/**
 * Règles métier de la facturation.
 *
 * Le service est le seul endroit où vivent les décisions :
 *  - il génère le numéro de facture (`FAC-AAAA-000123`) DANS la transaction,
 *    en s'appuyant sur le dernier identifiant verrouillé, pour garantir
 *    l'unicité même en cas de créations simultanées ;
 *  - il n'écrit JAMAIS `subtotal`, `vat_amount`, `total_amount`, `paid_amount`
 *    ni `status` en dehors de l'annulation/réémission explicite : ces colonnes
 *    sont produites par les triggers de `001_init.sql` ;
 *  - après chaque écriture, il RELIT la facture en base : les montants
 *    renvoyés sont donc toujours l'état réel calculé par MySQL.
 */

import type { InvoiceStatus, PaymentMethod } from '@mediclinic/shared';
import { createInvoiceSchema, updateInvoiceSchema } from '@mediclinic/shared';
import type { z } from 'zod';

import { withTransaction } from '../../config/db.js';
import { AppError } from '../../utils/app-error.js';
import { toMySqlDate, toMySqlDateTime } from '../../utils/datetime.js';
import { buildSetClause } from '../../utils/http.js';
import { buildOrderBy, type Pagination } from '../../utils/pagination.js';
import * as repository from './invoices.repository.js';
import type {
  InvoiceDetailRow,
  InvoiceItemRow,
  PaymentDetailRow,
} from './invoices.repository.js';

/* -------------------------------------------------------------------------- */
/* Objets exposés par l'API                                                    */
/* -------------------------------------------------------------------------- */

/** Facture telle qu'exposée en liste : montants en chaîne, indicateurs calculés. */
export interface InvoiceSummary {
  id: number;
  number: string;
  patient_id: number;
  patient_name: string;
  consultation_id: number | null;
  subtotal: string;
  vat_rate: string;
  vat_amount: string;
  total_amount: string;
  paid_amount: string;
  balance_due: string;
  status: InvoiceStatus;
  issued_at: string;
  due_date: string;
  items_count: number;
  is_overdue: boolean;
  created_at: string;
  updated_at: string;
}

/** Ligne de facture (le total de ligne est une colonne générée). */
export interface InvoiceItemView {
  id: number;
  invoice_id: number;
  label: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

/** Paiement rattaché à une facture, avec l'auteur de l'encaissement. */
export interface InvoicePaymentView {
  id: number;
  invoice_id: number;
  amount: string;
  method: PaymentMethod;
  paid_at: string;
  reference: string | null;
  recorded_by: number;
  user_name: string;
  created_at: string;
}

/** Facture détaillée : en-tête, lignes et paiements. */
export interface InvoiceDetail extends InvoiceSummary {
  items: InvoiceItemView[];
  payments: InvoicePaymentView[];
}

/** Indicateurs consolidés de la facturation (nombres, pour les graphiques). */
export interface InvoiceStats {
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueCount: number;
  byStatus: Array<{ status: InvoiceStatus; count: number; amount: number }>;
}

/* -------------------------------------------------------------------------- */
/* Conversions                                                                 */
/* -------------------------------------------------------------------------- */

/** Convertit une ligne de `v_invoice_details` en objet d'API. */
export function toInvoiceSummary(row: InvoiceDetailRow): InvoiceSummary {
  return {
    id: row.id,
    number: row.number,
    patient_id: row.patient_id,
    patient_name: row.patient_name,
    consultation_id: row.consultation_id,
    subtotal: String(row.subtotal),
    vat_rate: String(row.vat_rate),
    vat_amount: String(row.vat_amount),
    total_amount: String(row.total_amount),
    paid_amount: String(row.paid_amount),
    balance_due: String(row.balance_due),
    status: row.status,
    issued_at: String(row.issued_at),
    due_date: String(row.due_date),
    items_count: row.items_count,
    is_overdue: Boolean(row.is_overdue),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Convertit une ligne de `invoice_items`. */
function toInvoiceItem(row: InvoiceItemRow): InvoiceItemView {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    label: row.label,
    quantity: row.quantity,
    unit_price: String(row.unit_price),
    line_total: String(row.line_total),
  };
}

/** Convertit un paiement enrichi en objet d'API. */
function toInvoicePayment(row: PaymentDetailRow): InvoicePaymentView {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
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

/** Filtres normalisés de la liste (issus de la query string validée). */
export interface InvoiceQuery {
  status?: InvoiceStatus;
  patientId?: number;
  from?: string;
  to?: string;
  overdue?: boolean;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

/**
 * Colonnes de tri autorisées. Le client ne transmet qu'une CLÉ : l'expression
 * SQL correspondante est choisie ici, ce qui interdit toute injection.
 */
const SORTABLE_COLUMNS: Readonly<Record<string, string>> = {
  issued_at: 'v.issued_at',
  due_date: 'v.due_date',
  number: 'v.number',
  status: 'v.status',
  total_amount: 'v.total_amount',
  paid_amount: 'v.paid_amount',
  balance_due: 'v.balance_due',
  patient_name: 'v.patient_name',
  created_at: 'v.created_at',
};

/** Colonnes de facture modifiables par `PATCH /api/invoices/:id` (liste blanche). */
const INVOICE_EDITABLE_COLUMNS = ['vat_rate', 'due_date'] as const;

/** Statuts pour lesquels toute modification de contenu est interdite. */
const LOCKED_STATUSES: readonly InvoiceStatus[] = ['PAID', 'CANCELLED'];

/* -------------------------------------------------------------------------- */
/* Génération du numéro                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Construit le numéro de facture `FAC-AAAA-000123`.
 *
 * @param year      année d'émission (celle de `issued_at`)
 * @param sequence  rang de la facture (identifiant suivant), complété à 6 chiffres
 */
export function buildInvoiceNumber(year: number, sequence: number): string {
  return `FAC-${year}-${String(sequence).padStart(6, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Liste, statistiques, factures du patient connecté                           */
/* -------------------------------------------------------------------------- */

/** Liste paginée des factures (vue `v_invoice_details`). */
export async function listInvoices(
  filters: InvoiceQuery,
  pagination: Pagination,
): Promise<{ data: InvoiceSummary[]; total: number }> {
  const orderBy = buildOrderBy(
    filters.sort,
    filters.order,
    SORTABLE_COLUMNS,
    'v.issued_at',
    'desc',
  );

  const applied = {
    status: filters.status,
    patientId: filters.patientId,
    // Les dates de la query string sont normalisées avant d'atteindre le SQL.
    from: filters.from === undefined ? undefined : toMySqlDate(filters.from) ?? undefined,
    to: filters.to === undefined ? undefined : toMySqlDate(filters.to) ?? undefined,
    overdue: filters.overdue,
    search: filters.search !== undefined && filters.search.length > 0 ? filters.search : undefined,
  };

  const [rows, total] = await Promise.all([
    repository.findInvoices({ ...applied, orderBy, limit: pagination.limit, offset: pagination.offset }),
    repository.countInvoices(applied),
  ]);

  return { data: rows.map(toInvoiceSummary), total };
}

/**
 * Indicateurs consolidés de la facturation.
 * Les DECIMAL arrivent en chaîne : la conversion en nombre est faite ici, et
 * uniquement ici, puisqu'il s'agit d'agrégats de statistiques.
 */
export async function getInvoiceStats(): Promise<InvoiceStats> {
  const [totals, byStatus] = await Promise.all([
    repository.findInvoiceTotals(),
    repository.findInvoiceTotalsByStatus(),
  ]);

  return {
    totalInvoiced: Number(totals?.total_invoiced ?? 0),
    totalPaid: Number(totals?.total_paid ?? 0),
    totalOutstanding: Number(totals?.total_outstanding ?? 0),
    overdueCount: Number(totals?.overdue_count ?? 0),
    byStatus: byStatus.map((row) => ({
      status: row.status,
      count: Number(row.count ?? 0),
      amount: Number(row.amount ?? 0),
    })),
  };
}

/**
 * Factures du patient connecté (portail patient).
 *
 * Le dossier patient est imposé serveur : le patient ne peut donc pas élargir
 * la liste en modifiant la query string.
 *
 * @throws 403 `NOT_A_PATIENT` si le compte n'a pas de dossier patient.
 */
export async function listOwnInvoices(
  patientId: number | null,
  filters: InvoiceQuery,
  pagination: Pagination,
): Promise<{ data: InvoiceSummary[]; total: number }> {
  if (patientId === null) {
    throw AppError.forbidden(
      'Ce compte n’est pas rattaché à un dossier patient.',
      'NOT_A_PATIENT',
    );
  }
  return listInvoices({ ...filters, patientId }, pagination);
}

/* -------------------------------------------------------------------------- */
/* Détail                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Facture complète : en-tête, lignes et paiements.
 *
 * @throws 404 `INVOICE_NOT_FOUND` si la facture n'existe pas.
 */
export async function getInvoice(id: number): Promise<InvoiceDetail> {
  const detail = await getInvoiceDetailOrFail(id);
  const [items, payments] = await Promise.all([
    repository.findItemsByInvoice(id),
    repository.findPaymentsByInvoice(id),
  ]);

  return {
    ...toInvoiceSummary(detail),
    items: items.map(toInvoiceItem),
    payments: payments.map(toInvoicePayment),
  };
}

/** Charge l'en-tête détaillé d'une facture ou lève une 404. */
async function getInvoiceDetailOrFail(id: number): Promise<InvoiceDetailRow> {
  const detail = await repository.findInvoiceDetailById(id);
  if (!detail) {
    throw AppError.notFound('Facture introuvable.', 'INVOICE_NOT_FOUND');
  }
  return detail;
}

/* -------------------------------------------------------------------------- */
/* Création                                                                    */
/* -------------------------------------------------------------------------- */

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

/** Convertit les lignes validées en valeurs insérables (montants en chaîne). */
function toItemInputs(
  items: ReadonlyArray<{ label: string; quantity: number; unitPrice: number }>,
): repository.InvoiceItemInput[] {
  return items.map((item) => ({
    label: item.label,
    quantity: item.quantity,
    unitPrice: String(item.unitPrice),
  }));
}

/**
 * Crée une facture et ses lignes dans une seule transaction.
 *
 * Le numéro est calculé à partir du dernier identifiant VERROUILLÉ : deux
 * créations concurrentes obtiennent donc des séquences différentes.
 * Après l'insertion des lignes, la facture est relue : les totaux affichés sont
 * ceux calculés par `trg_invoice_item_after_insert`.
 *
 * @throws 422 `PATIENT_NOT_FOUND` / `CONSULTATION_NOT_FOUND` si une référence
 *         n'existe pas.
 * @throws 409 `CONSULTATION_ALREADY_INVOICED` si la consultation est déjà facturée.
 */
export async function createInvoice(
  input: CreateInvoiceInput,
  userId: number,
): Promise<InvoiceDetail> {
  const patientId = await repository.findPatientById(input.patientId);
  if (patientId === null) {
    throw AppError.unprocessable('Le patient indiqué n’existe pas.', 'PATIENT_NOT_FOUND', {
      patientId: input.patientId,
    });
  }

  const consultationId = input.consultationId ?? null;
  if (consultationId !== null) {
    const consultation = await repository.findConsultationById(consultationId);
    if (consultation === null) {
      throw AppError.unprocessable(
        'La consultation indiquée n’existe pas.',
        'CONSULTATION_NOT_FOUND',
        { consultationId },
      );
    }

    const existing = await repository.findInvoiceByConsultation(consultationId);
    if (existing) {
      throw AppError.conflict(
        `La consultation ${consultationId} est déjà facturée (facture ${existing.number}).`,
        'CONSULTATION_ALREADY_INVOICED',
        { invoiceId: existing.id, number: existing.number },
      );
    }
  }

  const issuedAt = toMySqlDateTime(new Date()) as string;
  const year = Number(issuedAt.slice(0, 4));
  // Échéance par défaut : 30 jours après l'émission, comme le prévoit la
  // politique de règlement de la clinique.
  const dueDate =
    toMySqlDate(input.dueDate) ?? (toMySqlDate(defaultDueDate(issuedAt)) as string);

  const invoiceId = await withTransaction(async (connection) => {
    const lastId = await repository.lockLastInvoiceId(connection);
    const number = buildInvoiceNumber(year, lastId + 1);

    const id = await repository.insertInvoice(connection, {
      number,
      patientId,
      consultationId,
      vatRate: input.vatRate,
      issuedAt,
      dueDate,
      createdBy: userId,
    });

    await repository.insertInvoiceItems(connection, id, toItemInputs(input.items));
    return id;
  });

  // Relecture obligatoire : les totaux viennent des triggers.
  return getInvoice(invoiceId);
}

/** Échéance par défaut : 30 jours après l'émission. */
function defaultDueDate(issuedAt: string): string {
  const date = new Date(issuedAt.replace(' ', 'T'));
  date.setDate(date.getDate() + 30);
  return toMySqlDateTime(date) as string;
}

/* -------------------------------------------------------------------------- */
/* Mise à jour                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Met à jour une facture : TVA, échéance, et éventuellement ses lignes.
 *
 * Le remplacement des lignes est transactionnel : jamais de facture momentanément
 * vide si l'insertion échoue. Le trigger recalcule les totaux après chaque
 * suppression/insertion, puis la facture est relue.
 *
 * @throws 404 `INVOICE_NOT_FOUND`.
 * @throws 409 `INVOICE_LOCKED` si la facture est payée ou annulée.
 * @throws 409 `INVOICE_HAS_PAYMENTS` si des paiements couvrent déjà des lignes
 *         qu'on chercherait à remplacer.
 */
export async function updateInvoice(
  id: number,
  input: UpdateInvoiceInput,
): Promise<InvoiceDetail> {
  const current = await repository.findInvoiceById(id);
  if (!current) {
    throw AppError.notFound('Facture introuvable.', 'INVOICE_NOT_FOUND');
  }

  if (LOCKED_STATUSES.includes(current.status)) {
    throw AppError.conflict(
      `La facture ${current.number} est « ${current.status} » : elle ne peut plus être modifiée.`,
      'INVOICE_LOCKED',
      { status: current.status },
    );
  }

  if (input.items !== undefined) {
    const payments = await repository.countPayments(id);
    if (payments > 0) {
      throw AppError.conflict(
        'Cette facture possède des paiements : le remplacement des lignes est impossible.',
        'INVOICE_HAS_PAYMENTS',
        { payments },
      );
    }
  }

  const values: Record<string, unknown> = {
    vat_rate: input.vatRate,
    due_date: input.dueDate === undefined ? undefined : toMySqlDate(input.dueDate),
  };

  await withTransaction(async (connection) => {
    // 1. Les colonnes scalaires d'abord : `vat_rate` déclenche le recalcul des
    //    montants dérivés (trg_invoice_before_update).
    const nonEmpty = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(nonEmpty).length > 0) {
      const { sql, params } = buildSetClause(nonEmpty, INVOICE_EDITABLE_COLUMNS);
      await repository.updateInvoice(connection, id, sql, params);
    }

    // 2. Puis le remplacement des lignes, si demandé. Les triggers de
    //    `invoice_items` recalculent les totaux à chaque étape.
    if (input.items !== undefined) {
      await repository.deleteInvoiceItems(connection, id);
      await repository.insertInvoiceItems(connection, id, toItemInputs(input.items));
    }
  });

  return getInvoice(id);
}

/* -------------------------------------------------------------------------- */
/* Suppression et changement de statut                                         */
/* -------------------------------------------------------------------------- */

/**
 * Supprime une facture sans paiement.
 *
 * @throws 404 `INVOICE_NOT_FOUND`.
 * @throws 409 `INVOICE_HAS_PAYMENTS` si des encaissements existent : ils font
 *         partie de l'historique comptable.
 */
export async function deleteInvoice(id: number): Promise<void> {
  const current = await repository.findInvoiceById(id);
  if (!current) {
    throw AppError.notFound('Facture introuvable.', 'INVOICE_NOT_FOUND');
  }

  const payments = await repository.countPayments(id);
  if (payments > 0) {
    throw AppError.conflict(
      `Cette facture possède ${payments} paiement(s) : la suppression effacerait l’historique comptable. Annulez-la plutôt.`,
      'INVOICE_HAS_PAYMENTS',
      { payments },
    );
  }

  // Les lignes suivent par ON DELETE CASCADE.
  await repository.deleteInvoice(id);
}

/** Changement de statut autorisé par `PATCH /:id/status`. */
export interface InvoiceStatusChange {
  status: 'CANCELLED' | 'ISSUED';
}

/**
 * Annule une facture ou la remet en circulation.
 *
 * L'annulation est refusée dès qu'un paiement existe : il faudrait d'abord
 * supprimer l'encaissement, opération tracée par le module payments.
 *
 * @throws 404 `INVOICE_NOT_FOUND`.
 * @throws 409 `INVOICE_HAS_PAYMENTS` si l'annulation est demandée avec des paiements.
 * @throws 409 `INVOICE_ALREADY_CANCELLED` si la facture est déjà annulée.
 */
export async function changeInvoiceStatus(
  id: number,
  change: InvoiceStatusChange,
): Promise<InvoiceSummary> {
  const current = await repository.findInvoiceById(id);
  if (!current) {
    throw AppError.notFound('Facture introuvable.', 'INVOICE_NOT_FOUND');
  }

  if (change.status === 'CANCELLED') {
    const payments = await repository.countPayments(id);
    if (payments > 0) {
      throw AppError.conflict(
        `Impossible d’annuler la facture ${current.number} : ${payments} paiement(s) y sont rattachés.`,
        'INVOICE_HAS_PAYMENTS',
        { payments },
      );
    }
    if (current.status === 'CANCELLED') {
      throw AppError.conflict(
        `La facture ${current.number} est déjà annulée.`,
        'INVOICE_ALREADY_CANCELLED',
      );
    }
    await repository.updateInvoiceStatus(id, 'CANCELLED');
  } else {
    // Réémission : le statut réel est ensuite recalculé par le trigger de
    // paiement s'il existe des encaissements, et la relecture le reflète.
    if (current.status !== 'CANCELLED') {
      throw AppError.conflict(
        `Seule une facture annulée peut être réémise (statut actuel : « ${current.status} »).`,
        'INVOICE_NOT_CANCELLED',
      );
    }
    await repository.updateInvoiceStatus(id, 'ISSUED');
  }

  return toInvoiceSummary(await getInvoiceDetailOrFail(id));
}

/* -------------------------------------------------------------------------- */
/* Facturation d'une consultation                                              */
/* -------------------------------------------------------------------------- */

/** Corps accepté par `POST /api/invoices/from-consultation/:consultationId`. */
export interface InvoiceFromConsultationInput {
  /** Montant supplémentaire d'actes complémentaires, s'il y en a. */
  extraAmount?: number;
  /** Taux de TVA, à défaut celui de la clinique. */
  vatRate?: number;
  /** Échéance, à défaut 30 jours après émission. */
  dueDate?: string;
}

/**
 * Génère la facture d'une consultation : honoraires du médecin, plus
 * éventuellement une ligne d'actes complémentaires.
 *
 * @throws 404 `CONSULTATION_NOT_FOUND` si la consultation n'existe pas.
 * @throws 409 `CONSULTATION_ALREADY_INVOICED` si elle est déjà facturée.
 */
export async function createInvoiceFromConsultation(
  consultationId: number,
  input: InvoiceFromConsultationInput,
  userId: number,
): Promise<InvoiceDetail> {
  const consultation = await repository.findConsultationForBilling(consultationId);
  if (!consultation) {
    throw AppError.notFound('Consultation introuvable.', 'CONSULTATION_NOT_FOUND');
  }

  const existing = await repository.findInvoiceByConsultation(consultationId);
  if (existing) {
    throw AppError.conflict(
      `La consultation ${consultationId} est déjà facturée (facture ${existing.number}).`,
      'CONSULTATION_ALREADY_INVOICED',
      { invoiceId: existing.id, number: existing.number },
    );
  }

  const items: repository.InvoiceItemInput[] = [
    {
      label: `Consultation ${consultation.specialty_name} — ${consultation.doctor_name}`,
      quantity: 1,
      unitPrice: String(consultation.consultation_fee),
    },
  ];

  if (input.extraAmount !== undefined && input.extraAmount > 0) {
    items.push({
      label: 'Actes complémentaires',
      quantity: 1,
      unitPrice: String(input.extraAmount),
    });
  }

  const issuedAt = toMySqlDateTime(new Date()) as string;
  const year = Number(issuedAt.slice(0, 4));
  const dueDate =
    toMySqlDate(input.dueDate) ?? (toMySqlDate(defaultDueDate(issuedAt)) as string);
  // À défaut de taux explicite, on reprend celui de la facture la plus récente
  // de la clinique ; 20 % est la valeur par défaut de la table.
  const vatRate = input.vatRate ?? (await resolveDefaultVatRate());

  const invoiceId = await withTransaction(async (connection) => {
    const lastId = await repository.lockLastInvoiceId(connection);
    const number = buildInvoiceNumber(year, lastId + 1);

    const id = await repository.insertInvoice(connection, {
      number,
      patientId: consultation.patient_id,
      consultationId,
      vatRate,
      issuedAt,
      dueDate,
      createdBy: userId,
    });

    await repository.insertInvoiceItems(connection, id, items);
    return id;
  });

  return getInvoice(invoiceId);
}

/** Taux de TVA de référence : celui de `clinic_settings`, sinon 20 %. */
async function resolveDefaultVatRate(): Promise<number> {
  const row = await repository.findDefaultVatRate();
  return row === null ? 20 : Number(row);
}
