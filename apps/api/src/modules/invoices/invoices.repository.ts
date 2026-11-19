/**
 * Accès aux données de la facturation.
 *
 * Deux règles structurent ce fichier :
 *  1. `subtotal`, `vat_amount`, `total_amount`, `paid_amount` et `status` sont
 *     maintenus par les triggers de `001_init.sql`. Ils n'apparaissent donc
 *     jamais dans une clause `SET` : seule `vat_rate` est modifiable, et
 *     `status` uniquement lorsque le service demande explicitement une
 *     annulation ou une réémission (route `PATCH /:id/status`).
 *  2. Le numéro de facture est calculé ici, à l'intérieur de la transaction :
 *     le dernier identifiant est verrouillé (`FOR UPDATE`) avant d'en déduire
 *     la séquence, ce qui interdit deux numéros identiques en cas de créations
 *     simultanées.
 *
 * Toutes les requêtes sont préparées (`?`) ; aucune valeur client n'est
 * concaténée dans le SQL.
 */

import type { InvoiceStatus, PaymentMethod } from '@mediclinic/shared';
import type { PoolConnection } from 'mysql2/promise';

import type { Row } from '../../config/db.js';
import { execute, executeWith, query, queryOne, queryWith } from '../../config/db.js';
import { whereClause } from '../../utils/pagination.js';

/* -------------------------------------------------------------------------- */
/* Lignes SQL                                                                  */
/* -------------------------------------------------------------------------- */

/** Ligne brute de la table `invoices` (état réel, hors vue). */
export interface InvoiceRow extends Row {
  id: number;
  number: string;
  patient_id: number;
  consultation_id: number | null;
  subtotal: string;
  vat_rate: string;
  vat_amount: string;
  total_amount: string;
  paid_amount: string;
  status: InvoiceStatus;
  issued_at: string;
  due_date: string;
  created_at: string;
  updated_at: string;
}

/** Ligne de la vue `v_invoice_details` (facture + patient + indicateurs). */
export interface InvoiceDetailRow extends Row {
  id: number;
  number: string;
  patient_id: number;
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
  created_at: string;
  updated_at: string;
  patient_name: string;
  items_count: number;
  is_overdue: number;
}

/** Ligne de `invoice_items` (`line_total` est une colonne générée). */
export interface InvoiceItemRow extends Row {
  id: number;
  invoice_id: number;
  label: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

/** Paiement brut rattaché à une facture. */
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

/** Paiement enrichi du nom de l'utilisateur qui l'a encaissé. */
export interface PaymentDetailRow extends PaymentRow {
  user_name: string;
}

/** Consultation à facturer, avec le tarif et le libellé du médecin. */
export interface ConsultationBillingRow extends Row {
  id: number;
  patient_id: number;
  doctor_id: number;
  consultation_fee: string;
  doctor_name: string;
  specialty_name: string;
}

/** Totaux agrégés du tableau de bord de facturation. */
export interface InvoiceTotalsRow extends Row {
  total_invoiced: string | null;
  total_paid: string | null;
  total_outstanding: string | null;
  overdue_count: number | null;
}

/** Répartition des factures par statut. */
export interface InvoiceStatusTotalRow extends Row {
  status: InvoiceStatus;
  count: number;
  amount: string | null;
}

/* -------------------------------------------------------------------------- */
/* Colonnes exposées                                                           */
/* -------------------------------------------------------------------------- */

/** Colonnes de la vue `v_invoice_details`, toutes qualifiées (alias `v`). */
const INVOICE_DETAIL_COLUMNS = `
  v.id,
  v.number,
  v.patient_id,
  v.consultation_id,
  v.subtotal,
  v.vat_rate,
  v.vat_amount,
  v.total_amount,
  v.paid_amount,
  v.balance_due,
  v.status,
  v.issued_at,
  v.due_date,
  v.created_at,
  v.updated_at,
  v.patient_name,
  v.items_count,
  v.is_overdue
`;

const INVOICE_ITEM_COLUMNS = `
  ii.id,
  ii.invoice_id,
  ii.label,
  ii.quantity,
  ii.unit_price,
  ii.line_total
`;

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

/* -------------------------------------------------------------------------- */
/* Filtres de liste                                                            */
/* -------------------------------------------------------------------------- */

/** Filtres métier de la liste des factures (déjà normalisés par le service). */
export interface InvoiceFilters {
  status?: InvoiceStatus;
  patientId?: number;
  /** Date d'émission minimale (`AAAA-MM-JJ`). */
  from?: string;
  /** Date d'émission maximale (`AAAA-MM-JJ`). */
  to?: string;
  /** Uniquement les factures échues et non soldées. */
  overdue?: boolean;
  /** Numéro de facture ou nom du patient. */
  search?: string;
}

/** Filtres + tri + pagination : tout ce dont la requête a besoin. */
export interface InvoiceListOptions extends InvoiceFilters {
  orderBy: string;
  limit: number;
  offset: number;
}

/** Construit la clause `WHERE` commune à la liste et au comptage. */
function buildInvoiceWhere(filters: InvoiceFilters): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.status !== undefined) {
    clauses.push('v.status = ?');
    params.push(filters.status);
  }
  if (filters.patientId !== undefined) {
    clauses.push('v.patient_id = ?');
    params.push(filters.patientId);
  }
  if (filters.from !== undefined) {
    clauses.push('DATE(v.issued_at) >= ?');
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    clauses.push('DATE(v.issued_at) <= ?');
    params.push(filters.to);
  }
  if (filters.overdue === true) {
    // `is_overdue` est calculé par la vue : il tient compte de l'échéance ET du
    // statut, deux informations qu'un simple `due_date < CURDATE()` ignorerait.
    clauses.push('v.is_overdue = 1');
  }
  if (filters.search !== undefined && filters.search.length > 0) {
    clauses.push('(v.number LIKE ? OR v.patient_name LIKE ?)');
    const pattern = `%${filters.search}%`;
    params.push(pattern, pattern);
  }

  return { where: whereClause(clauses), params };
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** État réel d'une facture (table `invoices`), utilisé après chaque écriture. */
export async function findInvoiceById(id: number): Promise<InvoiceRow | null> {
  return queryOne<InvoiceRow>(
    `SELECT id, number, patient_id, consultation_id, subtotal, vat_rate, vat_amount,
            total_amount, paid_amount, status, issued_at, due_date, created_at, updated_at
     FROM invoices
     WHERE id = ?`,
    [id],
  );
}

/** Facture détaillée (vue `v_invoice_details`). */
export async function findInvoiceDetailById(id: number): Promise<InvoiceDetailRow | null> {
  return queryOne<InvoiceDetailRow>(
    `SELECT ${INVOICE_DETAIL_COLUMNS}
     FROM v_invoice_details v
     WHERE v.id = ?`,
    [id],
  );
}

/** Liste paginée de factures (vue). */
export async function findInvoices(options: InvoiceListOptions): Promise<InvoiceDetailRow[]> {
  const { where, params } = buildInvoiceWhere(options);

  return query<InvoiceDetailRow>(
    `SELECT ${INVOICE_DETAIL_COLUMNS}
     FROM v_invoice_details v
     ${where}
     ORDER BY ${options.orderBy}, v.id DESC
     LIMIT ? OFFSET ?`,
    [...params, options.limit, options.offset],
  );
}

/** Nombre de factures correspondant aux filtres. */
export async function countInvoices(filters: InvoiceFilters): Promise<number> {
  const { where, params } = buildInvoiceWhere(filters);
  const row = await queryOne<Row & { total: number }>(
    `SELECT COUNT(*) AS total FROM v_invoice_details v ${where}`,
    params,
  );
  return Number(row?.total ?? 0);
}

/** Lignes d'une facture, dans l'ordre de saisie. */
export async function findItemsByInvoice(invoiceId: number): Promise<InvoiceItemRow[]> {
  return query<InvoiceItemRow>(
    `SELECT ${INVOICE_ITEM_COLUMNS}
     FROM invoice_items ii
     WHERE ii.invoice_id = ?
     ORDER BY ii.id ASC`,
    [invoiceId],
  );
}

/** Paiements d'une facture, enrichis du nom de l'encaisseur. */
export async function findPaymentsByInvoice(invoiceId: number): Promise<PaymentDetailRow[]> {
  return query<PaymentDetailRow>(
    `SELECT ${PAYMENT_COLUMNS},
            CONCAT(u.first_name, ' ', u.last_name) AS user_name
     FROM payments p
     JOIN users u ON u.id = p.recorded_by
     WHERE p.invoice_id = ?
     ORDER BY p.paid_at ASC, p.id ASC`,
    [invoiceId],
  );
}

/** Facture éventuellement déjà émise pour une consultation (unicité métier). */
export async function findInvoiceByConsultation(
  consultationId: number,
): Promise<InvoiceRow | null> {
  return queryOne<InvoiceRow>(
    `SELECT id, number, patient_id, consultation_id, subtotal, vat_rate, vat_amount,
            total_amount, paid_amount, status, issued_at, due_date, created_at, updated_at
     FROM invoices
     WHERE consultation_id = ?
     LIMIT 1`,
    [consultationId],
  );
}

/** Consultation à facturer (patient, médecin, tarif, spécialité). */
export async function findConsultationForBilling(
  consultationId: number,
): Promise<ConsultationBillingRow | null> {
  return queryOne<ConsultationBillingRow>(
    `SELECT c.id,
            a.patient_id,
            c.doctor_id,
            d.consultation_fee,
            CONCAT('Dr ', u.first_name, ' ', u.last_name) AS doctor_name,
            s.name                                        AS specialty_name
     FROM consultations c
     JOIN appointments a ON a.id = c.appointment_id
     JOIN doctors d      ON d.id = c.doctor_id
     JOIN users u        ON u.id = d.user_id
     JOIN specialties s  ON s.id = d.specialty_id
     WHERE c.id = ?`,
    [consultationId],
  );
}

/** Identifiant d'un dossier patient (validation avant création). */
export async function findPatientById(id: number): Promise<number | null> {
  const row = await queryOne<Row & { id: number }>('SELECT id FROM patients WHERE id = ?', [id]);
  return row?.id ?? null;
}

/** Identifiant d'une consultation (validation avant création). */
export async function findConsultationById(id: number): Promise<number | null> {
  const row = await queryOne<Row & { id: number }>(
    'SELECT id FROM consultations WHERE id = ?',
    [id],
  );
  return row?.id ?? null;
}

/** Nombre de paiements enregistrés sur une facture. */
export async function countPayments(invoiceId: number): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    'SELECT COUNT(*) AS total FROM payments WHERE invoice_id = ?',
    [invoiceId],
  );
  return Number(row?.total ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Statistiques                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Totaux consolidés de la facturation.
 * Les factures annulées sont exclues du chiffre d'affaires et des encaissements :
 * elles ne représentent aucune créance réelle.
 */
export async function findInvoiceTotals(): Promise<InvoiceTotalsRow | null> {
  return queryOne<InvoiceTotalsRow>(
    `SELECT
       COALESCE(SUM(CASE WHEN v.status <> 'CANCELLED' THEN v.total_amount ELSE 0 END), 0)
         AS total_invoiced,
       COALESCE(SUM(CASE WHEN v.status <> 'CANCELLED' THEN v.paid_amount ELSE 0 END), 0)
         AS total_paid,
       COALESCE(SUM(CASE WHEN v.status NOT IN ('PAID', 'CANCELLED') THEN v.balance_due ELSE 0 END), 0)
         AS total_outstanding,
       COALESCE(SUM(CASE WHEN v.is_overdue = 1 THEN 1 ELSE 0 END), 0)
         AS overdue_count
     FROM v_invoice_details v`,
  );
}

/** Répartition des factures par statut, dans l'ordre du cycle de vie. */
export async function findInvoiceTotalsByStatus(): Promise<InvoiceStatusTotalRow[]> {
  return query<InvoiceStatusTotalRow>(
    `SELECT v.status,
            COUNT(*)                          AS count,
            COALESCE(SUM(v.total_amount), 0)  AS amount
     FROM v_invoice_details v
     GROUP BY v.status
     ORDER BY FIELD(v.status, 'DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')`,
  );
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/** Valeurs nécessaires à l'insertion d'une facture (numéro déjà calculé). */
export interface NewInvoiceValues {
  number: string;
  patientId: number;
  consultationId: number | null;
  vatRate: number;
  issuedAt: string;
  dueDate: string;
  createdBy: number;
}

/**
 * Dernier identifiant de facture, verrouillé pour la transaction en cours.
 *
 * `ORDER BY id DESC LIMIT 1 FOR UPDATE` verrouille la dernière ligne : la
 * séquence obtenue est donc stable jusqu'au `COMMIT`, ce qui rend le numéro
 * unique même si deux requêtes créent une facture au même instant.
 * Aucune facture n'existe encore ⇒ `0`.
 */
export async function lockLastInvoiceId(connection: PoolConnection): Promise<number> {
  const rows = await queryWith<Row & { id: number }>(
    connection,
    'SELECT id FROM invoices ORDER BY id DESC LIMIT 1 FOR UPDATE',
  );
  return rows[0]?.id ?? 0;
}

/**
 * Insère la facture et renvoie son identifiant.
 *
 * Les colonnes de montants sont initialisées à 0 et `status` à `ISSUED` : juste
 * après, l'insertion des lignes déclenche `trg_invoice_item_after_insert`, qui
 * recalcule les totaux. Le service relit ensuite la facture en base : il ne
 * devine jamais les valeurs produites par les triggers.
 */
export async function insertInvoice(
  connection: PoolConnection,
  values: NewInvoiceValues,
): Promise<number> {
  const result = await executeWith(
    connection,
    `INSERT INTO invoices
       (number, patient_id, consultation_id, subtotal, vat_rate, vat_amount,
        total_amount, paid_amount, status, issued_at, due_date, created_by)
     VALUES (?, ?, ?, 0, ?, 0, 0, 0, 'ISSUED', ?, ?, ?)`,
    [
      values.number,
      values.patientId,
      values.consultationId,
      values.vatRate,
      values.issuedAt,
      values.dueDate,
      values.createdBy,
    ],
  );
  return result.insertId;
}

/** Ligne de facture telle que fournie par le client (montants en chaîne). */
export interface InvoiceItemInput {
  label: string;
  quantity: number;
  unitPrice: string;
}

/**
 * Insère les lignes d'une facture en une seule requête.
 * Les marqueurs `?` sont générés à partir du nombre de lignes : la structure
 * dépend uniquement de la taille du tableau, jamais de son contenu.
 */
export async function insertInvoiceItems(
  connection: PoolConnection,
  invoiceId: number,
  items: readonly InvoiceItemInput[],
): Promise<void> {
  if (items.length === 0) return;

  const placeholders = items.map(() => '(?, ?, ?, ?)').join(', ');
  const params = items.flatMap((item) => [
    invoiceId,
    item.label,
    item.quantity,
    item.unitPrice,
  ]);

  await executeWith(
    connection,
    `INSERT INTO invoice_items (invoice_id, label, quantity, unit_price)
     VALUES ${placeholders}`,
    params,
  );
}

/** Supprime toutes les lignes d'une facture (remplacement complet). */
export async function deleteInvoiceItems(
  connection: PoolConnection,
  invoiceId: number,
): Promise<void> {
  await executeWith(connection, 'DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
}

/**
 * Met à jour les colonnes autorisées d'une facture (liste blanche du service).
 * La connexion est fournie par l'appelant : le remplacement des lignes et la
 * mise à jour de l'en-tête partagent ainsi la même transaction.
 */
export async function updateInvoice(
  connection: PoolConnection,
  id: number,
  setClauseSql: string,
  params: readonly unknown[],
): Promise<void> {
  await executeWith(connection, `UPDATE invoices SET ${setClauseSql} WHERE id = ?`, [
    ...params,
    id,
  ]);
}

/**
 * Change le statut d'une facture (annulation ou réémission).
 * Seule écriture de `status` autorisée : elle correspond à une décision
 * explicite du service, jamais à un calcul de montants.
 */
export async function updateInvoiceStatus(id: number, status: InvoiceStatus): Promise<void> {
  await execute('UPDATE invoices SET status = ? WHERE id = ?', [status, id]);
}

/**
 * Taux de TVA de référence de la clinique (`clinic_settings`), à défaut `null`.
 * Utilisé lorsqu'une facture est générée sans taux explicite.
 */
export async function findDefaultVatRate(): Promise<string | null> {
  const row = await queryOne<Row & { vat_rate: string }>(
    'SELECT vat_rate FROM clinic_settings WHERE id = 1',
  );
  return row?.vat_rate ?? null;
}

/** Supprime une facture (les lignes suivent par `ON DELETE CASCADE`). */
export async function deleteInvoice(id: number): Promise<void> {
  await execute('DELETE FROM invoices WHERE id = ?', [id]);
}
