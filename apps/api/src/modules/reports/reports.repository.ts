/**
 * Accès aux données des rapports (`/api/reports`).
 *
 * Les vues de `002_views.sql` sont utilisées partout où elles existent
 * (`v_revenue_by_month`, `v_appointment_details`, `v_low_stock_medications`) ;
 * les autres agrégats sont écrits à la main sur les tables, avec des marqueurs
 * `?` uniquement. Aucune valeur client n'est concaténée dans le SQL, y compris
 * le regroupement des rendez-vous, qui passe par une liste blanche.
 */

import type { Row } from '../../config/db.js';
import { query, queryOne } from '../../config/db.js';

/* -------------------------------------------------------------------------- */
/* Chiffre d'affaires                                                          */
/* -------------------------------------------------------------------------- */

/** Encaissements réels de la période. */
export interface RevenueTotalsRow extends Row {
  total_revenue: number | string | null;
  payments_count: number | string | null;
}

/** Chiffre d'affaires encaissé sur une période (base : `payments`). */
export async function findRevenueTotals(
  from: string,
  to: string,
): Promise<RevenueTotalsRow | null> {
  return queryOne<RevenueTotalsRow>(
    `SELECT
       COALESCE(SUM(amount), 0) AS total_revenue,
       COUNT(*)                 AS payments_count
     FROM payments
     WHERE paid_at >= ? AND paid_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [from, to],
  );
}

/** Nombre de factures émises sur la période. */
export async function countInvoicesInRange(from: string, to: string): Promise<number> {
  const row = await queryOne<Row & { invoices_count: number | string | null }>(
    `SELECT COUNT(*) AS invoices_count
     FROM invoices
     WHERE issued_at >= ? AND issued_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [from, to],
  );
  return Number(row?.invoices_count ?? 0);
}

/** Chiffre d'affaires encaissé par mois, bornes `AAAA-MM` incluses. */
export async function findRevenueByMonth(
  fromMonth: string,
  toMonth: string,
): Promise<Array<Row & { period: string; revenue: number | string | null }>> {
  return query(
    `SELECT period, revenue
     FROM v_revenue_by_month
     WHERE period >= ? AND period <= ?
     ORDER BY period ASC`,
    [fromMonth, toMonth],
  );
}

/** Répartition des encaissements par moyen de paiement. */
export async function findRevenueByMethod(
  from: string,
  to: string,
): Promise<Array<Row & { method: string; payments_count: number | string | null; amount: number | string | null }>> {
  return query(
    `SELECT
       method,
       COUNT(*)                 AS payments_count,
       COALESCE(SUM(amount), 0) AS amount
     FROM payments
     WHERE paid_at >= ? AND paid_at < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY method
     ORDER BY amount DESC`,
    [from, to],
  );
}

/** Répartition des factures émises par statut. */
export async function findInvoiceStatusBreakdown(
  from: string,
  to: string,
): Promise<Array<Row & { status: string; invoices_count: number | string | null; amount: number | string | null }>> {
  return query(
    `SELECT
       status,
       COUNT(*)                       AS invoices_count,
       COALESCE(SUM(total_amount), 0) AS amount
     FROM invoices
     WHERE issued_at >= ? AND issued_at < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY status
     ORDER BY amount DESC`,
    [from, to],
  );
}

/** Patients ayant le plus encaissé sur la période. */
export async function findTopPatientsByRevenue(
  from: string,
  to: string,
  limit: number,
): Promise<Array<Row & { patient_id: number; patient_name: string; amount: number | string | null }>> {
  return query(
    `SELECT
       p.id                             AS patient_id,
       CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
       COALESCE(SUM(pay.amount), 0)     AS amount
     FROM payments pay
     JOIN invoices i ON i.id = pay.invoice_id
     JOIN patients p ON p.id = i.patient_id
     WHERE pay.paid_at >= ? AND pay.paid_at < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY p.id, p.first_name, p.last_name
     ORDER BY amount DESC, patient_name ASC
     LIMIT ?`,
    [from, to, limit],
  );
}

/* -------------------------------------------------------------------------- */
/* Rendez-vous                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Regroupements autorisés pour le rapport des rendez-vous.
 * Cette table est une liste blanche : la clé reçue du client n'est jamais
 * injectée dans la requête, seule l'expression SQL connue l'est.
 */
export const APPOINTMENT_REPORT_GROUPS = [
  'day',
  'week',
  'month',
  'department',
  'doctor',
  'status',
] as const;

export type AppointmentReportGroup = (typeof APPOINTMENT_REPORT_GROUPS)[number];

interface GroupDefinition {
  /** Expression regroupée (source de la colonne `label`). */
  expression: string;
  /** Tri appliqué aux groupes (chronologique ou décroissant). */
  orderBy: string;
}

const APPOINTMENT_GROUPS: Record<AppointmentReportGroup, GroupDefinition> = {
  day: { expression: 'DATE(a.appointment_date)', orderBy: 'label ASC' },
  week: { expression: "DATE_FORMAT(a.appointment_date, '%x-W%v')", orderBy: 'label ASC' },
  month: { expression: "DATE_FORMAT(a.appointment_date, '%Y-%m')", orderBy: 'label ASC' },
  department: { expression: "COALESCE(a.department_name, 'Non affecté')", orderBy: 'total DESC' },
  doctor: { expression: 'a.doctor_name', orderBy: 'total DESC' },
  status: { expression: 'a.status', orderBy: 'total DESC' },
};

/** Groupes de rendez-vous selon l'axe demandé (liste blanche). */
export async function findAppointmentGroups(
  groupBy: AppointmentReportGroup,
  from: string,
  to: string,
): Promise<Array<Row & { label: string; total: number | string | null }>> {
  const definition = APPOINTMENT_GROUPS[groupBy];

  return query(
    `SELECT
       ${definition.expression} AS label,
       COUNT(*)                 AS total
     FROM v_appointment_details a
     WHERE a.appointment_date BETWEEN ? AND ?
     GROUP BY label
     ORDER BY ${definition.orderBy}`,
    [from, to],
  );
}

/** Compteurs globaux de la période (statuts des rendez-vous). */
export async function findAppointmentTotals(
  from: string,
  to: string,
): Promise<Row & {
  total: number | string | null;
  completed: number | string | null;
  cancelled: number | string | null;
  no_show: number | string | null;
} | null> {
  return queryOne(
    `SELECT
       COUNT(*)                                                 AS total,
       COALESCE(SUM(a.status = 'COMPLETED'), 0)                 AS completed,
       COALESCE(SUM(a.status = 'CANCELLED'), 0)                 AS cancelled,
       COALESCE(SUM(a.status = 'NO_SHOW'), 0)                   AS no_show
     FROM v_appointment_details a
     WHERE a.appointment_date BETWEEN ? AND ?`,
    [from, to],
  );
}

/* -------------------------------------------------------------------------- */
/* Stock et pharmacie                                                          */
/* -------------------------------------------------------------------------- */

/** État courant du stock (hors période : le stock est une photographie). */
export async function findStockTotals(): Promise<Row & {
  total_references: number | string | null;
  total_units: number | string | null;
  stock_value: number | string | null;
} | null> {
  return queryOne(
    `SELECT
       COUNT(*)                                  AS total_references,
       COALESCE(SUM(stock_quantity), 0)          AS total_units,
       COALESCE(SUM(stock_quantity * price), 0)  AS stock_value
     FROM medications`,
  );
}

/** Médicaments sous le seuil d'alerte (vue dédiée). */
export async function findLowStockMedications(
  limit: number,
): Promise<Array<Row & {
  id: number;
  name: string;
  stock_quantity: number | string;
  alert_threshold: number | string;
}>> {
  return query(
    `SELECT id, name, stock_quantity, alert_threshold
     FROM v_low_stock_medications
     ORDER BY missing_quantity DESC, name ASC
     LIMIT ?`,
    [limit],
  );
}

/** Médicaments dont la date de péremption est dépassée. */
export async function findExpiredMedications(): Promise<Array<Row & {
  id: number;
  name: string;
  expiry_date: string | null;
  stock_quantity: number | string;
}>> {
  return query(
    `SELECT id, name, expiry_date, stock_quantity
     FROM medications
     WHERE expiry_date IS NOT NULL AND expiry_date < CURDATE()
     ORDER BY expiry_date ASC, name ASC`,
  );
}

/**
 * Quantités entrées et sorties sur la période.
 * On totalise les unités (et non le nombre de mouvements) : c'est la mesure
 * comparable à `total_units` du stock courant.
 */
export async function findStockMovementTotals(
  from: string,
  to: string,
): Promise<Row & { quantity_in: number | string | null; quantity_out: number | string | null } | null> {
  return queryOne(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'IN'  THEN quantity ELSE 0 END), 0) AS quantity_in,
       COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) AS quantity_out
     FROM stock_movements
     WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [from, to],
  );
}

/** Consommation de médicaments sur la période, valorisée au prix courant. */
export async function findConsumptionByMedication(
  from: string,
  to: string,
  limit: number,
): Promise<Array<Row & {
  medication_id: number;
  name: string;
  quantity_out: number | string | null;
  value_out: number | string | null;
}>> {
  return query(
    `SELECT
       m.id                              AS medication_id,
       m.name                            AS name,
       COALESCE(SUM(sm.quantity), 0)     AS quantity_out,
       COALESCE(SUM(sm.quantity * m.price), 0) AS value_out
     FROM stock_movements sm
     JOIN medications m ON m.id = sm.medication_id
     WHERE sm.type = 'OUT'
       AND sm.created_at >= ? AND sm.created_at < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY m.id, m.name
     ORDER BY quantity_out DESC, m.name ASC
     LIMIT ?`,
    [from, to, limit],
  );
}

/* -------------------------------------------------------------------------- */
/* Activité du personnel (journal d'audit)                                     */
/* -------------------------------------------------------------------------- */

/** Nombre total d'actions journalisées sur la période. */
export async function countAuditActions(from: string, to: string): Promise<number> {
  const row = await queryOne<Row & { total: number | string | null }>(
    `SELECT COUNT(*) AS total
     FROM audit_logs
     WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [from, to],
  );
  return Number(row?.total ?? 0);
}

/** Actions journalisées par type d'action. */
export async function findAuditActionsByAction(
  from: string,
  to: string,
): Promise<Array<Row & { action: string; total: number | string | null }>> {
  return query(
    `SELECT action, COUNT(*) AS total
     FROM audit_logs
     WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY action
     ORDER BY total DESC, action ASC`,
    [from, to],
  );
}

/** Actions journalisées par ressource. */
export async function findAuditActionsByResource(
  from: string,
  to: string,
): Promise<Array<Row & { resource: string; total: number | string | null }>> {
  return query(
    `SELECT resource, COUNT(*) AS total
     FROM audit_logs
     WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY resource
     ORDER BY total DESC, resource ASC`,
    [from, to],
  );
}

/** Actions journalisées par utilisateur. */
export async function findAuditActionsByUser(
  from: string,
  to: string,
  limit: number,
): Promise<Array<Row & { user_id: number | null; user_name: string | null; total: number | string | null }>> {
  return query(
    `SELECT
       al.user_id,
       CONCAT(u.first_name, ' ', u.last_name) AS user_name,
       COUNT(*)                               AS total
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.created_at >= ? AND al.created_at < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY al.user_id, u.first_name, u.last_name
     ORDER BY total DESC
     LIMIT ?`,
    [from, to, limit],
  );
}

/** Actions journalisées par jour (série chronologique). */
export async function findAuditActionsByDay(
  from: string,
  to: string,
): Promise<Array<Row & { day: string; total: number | string | null }>> {
  return query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS total
     FROM audit_logs
     WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
     GROUP BY day
     ORDER BY day ASC`,
    [from, to],
  );
}

/* -------------------------------------------------------------------------- */
/* Patients                                                                    */
/* -------------------------------------------------------------------------- */

/** Nouveaux dossiers patients créés sur la période. */
export async function countNewPatients(from: string, to: string): Promise<number> {
  const row = await queryOne<Row & { total: number | string | null }>(
    `SELECT COUNT(*) AS total
     FROM patients
     WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    [from, to],
  );
  return Number(row?.total ?? 0);
}

/** Nombre total de dossiers patients. */
export async function countPatients(): Promise<number> {
  const row = await queryOne<Row & { total: number | string | null }>(
    'SELECT COUNT(*) AS total FROM patients',
  );
  return Number(row?.total ?? 0);
}

/** Répartition des patients par genre. */
export async function findPatientsByGender(): Promise<
  Array<Row & { gender: string; total: number | string | null }>
> {
  return query(
    `SELECT gender, COUNT(*) AS total
     FROM patients
     GROUP BY gender
     ORDER BY total DESC`,
  );
}

/**
 * Répartition des patients par tranche d'âge.
 * Les bornes sont calculées sur l'âge révolu (`TIMESTAMPDIFF`), puis les
 * tranches sont ordonnées chronologiquement par `FIELD`.
 */
export async function findPatientsByAgeRange(): Promise<
  Array<Row & { age_range: string; total: number | string | null }>
> {
  return query(
    `SELECT
       CASE
         WHEN TIMESTAMPDIFF(YEAR, birth_date, CURDATE()) < 18 THEN 'Moins de 18 ans'
         WHEN TIMESTAMPDIFF(YEAR, birth_date, CURDATE()) < 35 THEN '18-34 ans'
         WHEN TIMESTAMPDIFF(YEAR, birth_date, CURDATE()) < 50 THEN '35-49 ans'
         WHEN TIMESTAMPDIFF(YEAR, birth_date, CURDATE()) < 65 THEN '50-64 ans'
         ELSE '65 ans et plus'
       END      AS age_range,
       COUNT(*) AS total
     FROM patients
     GROUP BY age_range
     ORDER BY FIELD(age_range, 'Moins de 18 ans', '18-34 ans', '35-49 ans', '50-64 ans', '65 ans et plus')`,
  );
}

/** Répartition des patients par ville (les villes non renseignées sont regroupées). */
export async function findPatientsByCity(): Promise<
  Array<Row & { city: string; total: number | string | null }>
> {
  return query(
    `SELECT
       COALESCE(city, 'Non renseignée') AS city,
       COUNT(*)                         AS total
     FROM patients
     GROUP BY COALESCE(city, 'Non renseignée')
     ORDER BY total DESC, city ASC`,
  );
}
