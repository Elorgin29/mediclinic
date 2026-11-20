/**
 * Règles métier des encaissements.
 *
 * Invariant central : le service n'écrit JAMAIS `paid_amount` ni `status` de la
 * facture. Il insère ou supprime une ligne dans `payments`, puis RELIT la
 * facture : les colonnes dérivées sont produites par les triggers
 * `trg_payment_after_insert` / `trg_payment_after_delete`.
 *
 * Les contrôles (facture existante, statut encaissable, solde restant) sont
 * faits AVANT l'écriture pour renvoyer un message explicite en français.
 */

import type { PaymentMethod } from '@mediclinic/shared';
import type { z } from 'zod';
import type { createPaymentSchema } from '@mediclinic/shared';

import { AppError } from '../../utils/app-error.js';
import { toMySqlDate, toMySqlDateTime } from '../../utils/datetime.js';
import { buildOrderBy, type Pagination } from '../../utils/pagination.js';
import { findInvoiceDetailById } from '../invoices/invoices.repository.js';
import { toInvoiceSummary, type InvoiceSummary } from '../invoices/invoices.service.js';
import * as repository from './payments.repository.js';
import type { PaymentDetailRow } from './payments.repository.js';

/* -------------------------------------------------------------------------- */
/* Objets exposés par l'API                                                    */
/* -------------------------------------------------------------------------- */

/** Paiement tel qu'exposé par l'API (`amount` reste une chaîne DECIMAL). */
export interface PaymentView {
  id: number;
  invoice_id: number;
  invoice_number: string;
  patient_id: number;
  patient_name: string;
  amount: string;
  method: PaymentMethod;
  paid_at: string;
  reference: string | null;
  recorded_by: number;
  user_name: string;
  created_at: string;
}

/** Résultat d'un encaissement : le paiement créé et l'état réel de la facture. */
export interface PaymentCreationResult {
  payment: PaymentView;
  invoice: InvoiceSummary;
}

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/* -------------------------------------------------------------------------- */
/* Conversions                                                                 */
/* -------------------------------------------------------------------------- */

/** Convertit une ligne de paiement enrichie en objet d'API. */
export function toPayment(row: PaymentDetailRow): PaymentView {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    invoice_number: row.invoice_number,
    patient_id: row.patient_id,
    patient_name: row.patient_name,
    amount: String(row.amount),
    method: row.method,
    paid_at: String(row.paid_at),
    reference: row.reference,
    recorded_by: row.recorded_by,
    user_name: row.user_name,
    created_at: String(row.created_at),
  };
}

/* -------------------------------------------------------------------------- */
/* Filtres et tri                                                              */
/* -------------------------------------------------------------------------- */

/** Filtres normalisés de la liste des paiements. */
export interface PaymentQuery {
  invoiceId?: number;
  method?: PaymentMethod;
  from?: string;
  to?: string;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

/**
 * Colonnes de tri autorisées (liste blanche) : la valeur reçue du client est
 * une clé, jamais une expression SQL.
 */
const SORTABLE_COLUMNS: Readonly<Record<string, string>> = {
  paid_at: 'p.paid_at',
  amount: 'p.amount',
  method: 'p.method',
  created_at: 'p.created_at',
  invoice_number: 'i.number',
  patient_name: 'pt.last_name',
};

/** Tolérance de comparaison sur les montants DECIMAL (arrondi au centime). */
const AMOUNT_SCALE = 0.005;

/* -------------------------------------------------------------------------- */
/* Liste et détail                                                             */
/* -------------------------------------------------------------------------- */

/** Liste paginée des paiements, avec numéro de facture et nom du patient. */
export async function listPayments(
  filters: PaymentQuery,
  pagination: Pagination,
): Promise<{ data: PaymentView[]; total: number }> {
  const orderBy = buildOrderBy(filters.sort, filters.order, SORTABLE_COLUMNS, 'p.paid_at', 'desc');

  const applied = {
    invoiceId: filters.invoiceId,
    method: filters.method,
    from: filters.from === undefined ? undefined : toMySqlDate(filters.from) ?? undefined,
    to: filters.to === undefined ? undefined : toMySqlDate(filters.to) ?? undefined,
    search: filters.search !== undefined && filters.search.length > 0 ? filters.search : undefined,
  };

  const [rows, total] = await Promise.all([
    repository.findPayments({ ...applied, orderBy, limit: pagination.limit, offset: pagination.offset }),
    repository.countPayments(applied),
  ]);

  return { data: rows.map(toPayment), total };
}

/**
 * Un paiement précis.
 *
 * @throws 404 `PAYMENT_NOT_FOUND`.
 */
export async function getPayment(id: number): Promise<PaymentView> {
  const row = await repository.findPaymentById(id);
  if (!row) {
    throw AppError.notFound('Paiement introuvable.', 'PAYMENT_NOT_FOUND');
  }
  return toPayment(row);
}

/**
 * Paiements d'une facture.
 *
 * @throws 404 `INVOICE_NOT_FOUND` si la facture n'existe pas.
 */
export async function listPaymentsForInvoice(invoiceId: number): Promise<PaymentView[]> {
  const invoice = await findInvoiceDetailById(invoiceId);
  if (!invoice) {
    throw AppError.notFound('Facture introuvable.', 'INVOICE_NOT_FOUND');
  }

  const rows = await repository.findPaymentsByInvoice(invoiceId);
  return rows.map(toPayment);
}

/* -------------------------------------------------------------------------- */
/* Encaissement                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Enregistre un encaissement (total ou partiel).
 *
 * Règles appliquées, dans cet ordre :
 *  1. la facture doit exister (404) ;
 *  2. son statut doit permettre un encaissement (409 si `DRAFT` ou `CANCELLED`) ;
 *  3. le montant ne peut pas dépasser le solde restant (422, avec le solde).
 *
 * @throws 404 `INVOICE_NOT_FOUND`
 * @throws 409 `INVOICE_DRAFT` / `INVOICE_CANCELLED`
 * @throws 422 `AMOUNT_EXCEEDS_BALANCE`
 */
export async function createPayment(
  input: CreatePaymentInput & { invoiceId: number },
  recordedBy: number,
): Promise<PaymentCreationResult> {
  const invoice = await repository.findInvoiceBalance(input.invoiceId);
  if (!invoice) {
    throw AppError.notFound('Facture introuvable.', 'INVOICE_NOT_FOUND');
  }

  if (invoice.status === 'DRAFT') {
    throw AppError.conflict(
      `La facture ${invoice.number} est un brouillon : émettez-la avant d’enregistrer un paiement.`,
      'INVOICE_DRAFT',
      { status: invoice.status },
    );
  }
  if (invoice.status === 'CANCELLED') {
    throw AppError.conflict(
      `La facture ${invoice.number} est annulée : aucun paiement ne peut y être rattaché.`,
      'INVOICE_CANCELLED',
      { status: invoice.status },
    );
  }

  const total = Number(invoice.total_amount);
  const alreadyPaid = Number(invoice.paid_amount);
  const balance = Math.round((total - alreadyPaid) * 100) / 100;

  if (input.amount > balance + AMOUNT_SCALE) {
    throw AppError.unprocessable(
      `Le montant saisi (${input.amount.toFixed(2)}) dépasse le solde restant de la facture ${invoice.number} (${balance.toFixed(2)}).`,
      'AMOUNT_EXCEEDS_BALANCE',
      { balance, amount: input.amount, total, paid: alreadyPaid },
    );
  }

  const paymentId = await repository.insertPayment({
    invoiceId: input.invoiceId,
    amount: input.amount.toFixed(2),
    method: input.method,
    paidAt: toMySqlDateTime(input.paidAt) ?? (toMySqlDateTime(new Date()) as string),
    reference: input.reference ?? null,
    recordedBy,
  });

  // Relecture : `paid_amount` et `status` viennent d'être recalculés par trigger.
  const payment = await repository.findPaymentById(paymentId);
  const refreshed = await findInvoiceDetailById(input.invoiceId);

  if (!payment || !refreshed) {
    throw AppError.internal('Le paiement enregistré est introuvable après insertion.');
  }

  return { payment: toPayment(payment), invoice: toInvoiceSummary(refreshed) };
}

/* -------------------------------------------------------------------------- */
/* Suppression                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Supprime un encaissement : le trigger recalcule la facture.
 *
 * @throws 404 `PAYMENT_NOT_FOUND`.
 */
export async function deletePayment(id: number): Promise<PaymentView> {
  const row = await repository.findPaymentById(id);
  if (!row) {
    throw AppError.notFound('Paiement introuvable.', 'PAYMENT_NOT_FOUND');
  }

  await repository.deletePayment(id);
  return toPayment(row);
}
