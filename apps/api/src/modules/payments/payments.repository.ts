/**
 * Accès aux données des encaissements.
 *
 * Règle structurelle : `paid_amount` et `status` de la facture sont maintenus
 * par les triggers `trg_payment_after_*`. Ce fichier n'écrit donc JAMAIS ces
 * colonnes : un paiement se résume à une ligne dans `payments`, et la facture
 * est relue ensuite par le service.
 *
 * Toutes les requêtes sont préparées (`?`).
 */

import type { PaymentMethod } from '@mediclinic/shared';

import type { Row } from '../../config/db.js';
import { execute, insert, query, queryOne } from '../../config/db.js';
import { whereClause } from '../../utils/pagination.js';

/* -------------------------------------------------------------------------- */
/* Lignes SQL                                                                  */
/* -------------------------------------------------------------------------- */

/** Paiement brut de la table `payments`. */
export interface PaymentRow extends Row {
  id: number;
  invoice_id: number;
  amount: string;
  method: PaymentMethod;
  paid_at: string;
  reference: string | null;
  recorded_by: number;
  created_at: string;
}

/** Paiement enrichi du numéro de facture, du patient et de l'encaisseur. */
export interface PaymentDetailRow extends PaymentRow {
  invoice_number: string;
  patient_id: number;
  patient_name: string;
  user_name: string;
}

/** Facture minimale nécessaire au contrôle d'un encaissement. */
export interface InvoiceBalanceRow extends Row {
  id: number;
  number: string;
  patient_id: number;
  total_amount: string;
  paid_amount: string;
  status: string;
}

/* -------------------------------------------------------------------------- */
/* Colonnes exposées                                                           */
/* -------------------------------------------------------------------------- */

/** Colonnes du paiement, toutes qualifiées (alias `p`). */
const PAYMENT_COLUMNS = `
  p.id,
  p.invoice_id,
  p.amount,
  p.method,
  p.paid_at,
  p.reference,
  p.recorded_by,
  p.created_at
`;

/** Jointures communes : facture, patient et utilisateur encaisseur. */
const PAYMENT_FROM = `
  FROM payments p
  JOIN invoices i ON i.id = p.invoice_id
  JOIN patients pt ON pt.id = i.patient_id
  JOIN users u    ON u.id = p.recorded_by
`;

/* -------------------------------------------------------------------------- */
/* Filtres                                                                     */
/* -------------------------------------------------------------------------- */

/** Filtres métier de la liste des paiements (normalisés par le service). */
export interface PaymentFilters {
  invoiceId?: number;
  method?: PaymentMethod;
  /** Date de paiement minimale (`AAAA-MM-JJ`). */
  from?: string;
  /** Date de paiement maximale (`AAAA-MM-JJ`). */
  to?: string;
  /** Numéro de facture, nom du patient ou référence de paiement. */
  search?: string;
}

/** Filtres + tri + pagination. */
export interface PaymentListOptions extends PaymentFilters {
  orderBy: string;
  limit: number;
  offset: number;
}

/** Construit la clause `WHERE` commune à la liste et au comptage. */
function buildPaymentWhere(filters: PaymentFilters): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.invoiceId !== undefined) {
    clauses.push('p.invoice_id = ?');
    params.push(filters.invoiceId);
  }
  if (filters.method !== undefined) {
    clauses.push('p.method = ?');
    params.push(filters.method);
  }
  if (filters.from !== undefined) {
    clauses.push('DATE(p.paid_at) >= ?');
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    clauses.push('DATE(p.paid_at) <= ?');
    params.push(filters.to);
  }
  if (filters.search !== undefined && filters.search.length > 0) {
    clauses.push('(i.number LIKE ? OR pt.first_name LIKE ? OR pt.last_name LIKE ? OR p.reference LIKE ?)');
    const pattern = `%${filters.search}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  return { where: whereClause(clauses), params };
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** Liste paginée des paiements, enrichis du contexte facture/patient. */
export async function findPayments(options: PaymentListOptions): Promise<PaymentDetailRow[]> {
  const { where, params } = buildPaymentWhere(options);

  return query<PaymentDetailRow>(
    `SELECT ${PAYMENT_COLUMNS},
            i.number                                      AS invoice_number,
            i.patient_id                                  AS patient_id,
            CONCAT(pt.first_name, ' ', pt.last_name)      AS patient_name,
            CONCAT(u.first_name, ' ', u.last_name)        AS user_name
     ${PAYMENT_FROM}
     ${where}
     ORDER BY ${options.orderBy}, p.id DESC
     LIMIT ? OFFSET ?`,
    [...params, options.limit, options.offset],
  );
}

/** Nombre de paiements correspondant aux filtres. */
export async function countPayments(filters: PaymentFilters): Promise<number> {
  const { where, params } = buildPaymentWhere(filters);
  const row = await queryOne<Row & { total: number }>(
    `SELECT COUNT(*) AS total ${PAYMENT_FROM} ${where}`,
    params,
  );
  return Number(row?.total ?? 0);
}

/** Un paiement enrichi, par son identifiant. */
export async function findPaymentById(id: number): Promise<PaymentDetailRow | null> {
  return queryOne<PaymentDetailRow>(
    `SELECT ${PAYMENT_COLUMNS},
            i.number                                      AS invoice_number,
            i.patient_id                                  AS patient_id,
            CONCAT(pt.first_name, ' ', pt.last_name)      AS patient_name,
            CONCAT(u.first_name, ' ', u.last_name)        AS user_name
     ${PAYMENT_FROM}
     WHERE p.id = ?`,
    [id],
  );
}

/** Tous les paiements d'une facture, du plus ancien au plus récent. */
export async function findPaymentsByInvoice(invoiceId: number): Promise<PaymentDetailRow[]> {
  return query<PaymentDetailRow>(
    `SELECT ${PAYMENT_COLUMNS},
            i.number                                      AS invoice_number,
            i.patient_id                                  AS patient_id,
            CONCAT(pt.first_name, ' ', pt.last_name)      AS patient_name,
            CONCAT(u.first_name, ' ', u.last_name)        AS user_name
     ${PAYMENT_FROM}
     WHERE p.invoice_id = ?
     ORDER BY p.paid_at ASC, p.id ASC`,
    [invoiceId],
  );
}

/**
 * Facture minimale pour contrôler un encaissement (statut, total, déjà payé).
 * Lue sur la table et non sur la vue : le solde doit être l'état transactionnel
 * exact, sans recalcul applicatif.
 */
export async function findInvoiceBalance(invoiceId: number): Promise<InvoiceBalanceRow | null> {
  return queryOne<InvoiceBalanceRow>(
    `SELECT id, number, patient_id, total_amount, paid_amount, status
     FROM invoices
     WHERE id = ?`,
    [invoiceId],
  );
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/** Valeurs d'un nouvel encaissement. */
export interface NewPaymentValues {
  invoiceId: number;
  amount: string;
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
  recordedBy: number;
}

/**
 * Insère un paiement.
 * Les triggers `trg_payment_after_insert` mettent à jour `paid_amount` et
 * `status` de la facture : aucune de ces colonnes n'est écrite ici.
 */
export async function insertPayment(values: NewPaymentValues): Promise<number> {
  return insert(
    `INSERT INTO payments (invoice_id, amount, method, paid_at, reference, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      values.invoiceId,
      values.amount,
      values.method,
      values.paidAt,
      values.reference,
      values.recordedBy,
    ],
  );
}

/** Supprime un paiement (le trigger recalcule la facture). */
export async function deletePayment(id: number): Promise<void> {
  await execute('DELETE FROM payments WHERE id = ?', [id]);
}
