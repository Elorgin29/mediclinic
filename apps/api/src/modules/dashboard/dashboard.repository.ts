/**
 * Accès aux données du tableau de bord.
 *
 * Toutes les statistiques sont lues depuis les vues de `002_views.sql` : les
 * jointures et les agrégats sont ainsi écrits une seule fois, côté base, et
 * l'API ne manipule que des lignes déjà prêtes à exposer.
 */

import type { Row } from '../../config/db.js';
import { query, queryOne } from '../../config/db.js';

/** Ligne unique de la vue `v_dashboard_stats`. */
export interface DashboardStatsRow extends Row {
  patients_total: number | string | null;
  doctors_total: number | string | null;
  appointments_today: number | string | null;
  appointments_week: number | string | null;
  appointments_month: number | string | null;
  revenue_month: number | string | null;
  revenue_previous_month: number | string | null;
  pending_meetings: number | string | null;
  low_stock_count: number | string | null;
  shifts_in_progress: number | string | null;
}

/** Point mensuel de la vue `v_revenue_by_month`. */
export interface RevenueMonthRow extends Row {
  period: string;
  revenue: number | string | null;
}

/** Répartition des rendez-vous par département. */
export interface DepartmentCountRow extends Row {
  department_name: string;
  appointments_count: number | string | null;
}

/** Nombre de consultations par médecin. */
export interface DoctorCountRow extends Row {
  doctor_name: string;
  consultations_count: number | string | null;
}

/** Quantité dispensée par médicament. */
export interface MedicationCountRow extends Row {
  name: string;
  total_quantity: number | string | null;
}

/** Médicament dont le stock a atteint le seuil d'alerte. */
export interface LowStockRow extends Row {
  id: number;
  name: string;
  stock_quantity: number | string;
  alert_threshold: number | string;
}

/** Entrée du journal d'audit jointe à son auteur. */
export interface ActivityRow extends Row {
  id: number | string;
  user_name: string | null;
  action: string;
  resource: string;
  created_at: string;
}

/**
 * Indicateurs agrégés de la page d'accueil.
 * La vue renvoie toujours exactement une ligne.
 */
export async function findDashboardStats(): Promise<DashboardStatsRow | null> {
  return queryOne<DashboardStatsRow>(
    `SELECT
       patients_total,
       doctors_total,
       appointments_today,
       appointments_week,
       appointments_month,
       revenue_month,
       revenue_previous_month,
       pending_meetings,
       low_stock_count,
       shifts_in_progress
     FROM v_dashboard_stats
     LIMIT 1`,
  );
}

/**
 * Chiffre d'affaires encaissé par mois depuis `sinceMonth` (clé `AAAA-MM`).
 * Les mois sans encaissement sont absents de la vue : c'est le service qui
 * les complète à zéro pour que le graphique garde une échelle stable.
 */
export async function findRevenueByMonth(sinceMonth: string): Promise<RevenueMonthRow[]> {
  return query<RevenueMonthRow>(
    `SELECT period, revenue
     FROM v_revenue_by_month
     WHERE period >= ?
     ORDER BY period ASC`,
    [sinceMonth],
  );
}

/** Rendez-vous par département, du plus fréquenté au moins fréquenté. */
export async function findAppointmentsByDepartment(): Promise<DepartmentCountRow[]> {
  return query<DepartmentCountRow>(
    `SELECT department_name, appointments_count
     FROM v_appointments_by_department
     ORDER BY appointments_count DESC, department_name ASC`,
  );
}

/** Médecins les plus sollicités (limités aux `limit` premiers). */
export async function findConsultationsByDoctor(limit: number): Promise<DoctorCountRow[]> {
  return query<DoctorCountRow>(
    `SELECT doctor_name, consultations_count
     FROM v_consultations_by_doctor
     ORDER BY consultations_count DESC, doctor_name ASC
     LIMIT ?`,
    [limit],
  );
}

/** Médicaments les plus dispensés (limités aux `limit` premiers). */
export async function findTopMedications(limit: number): Promise<MedicationCountRow[]> {
  return query<MedicationCountRow>(
    `SELECT name, total_quantity
     FROM v_top_medications
     ORDER BY total_quantity DESC, name ASC
     LIMIT ?`,
    [limit],
  );
}

/** Alertes de stock, les manques les plus importants en premier. */
export async function findLowStockMedications(limit: number): Promise<LowStockRow[]> {
  return query<LowStockRow>(
    `SELECT id, name, stock_quantity, alert_threshold
     FROM v_low_stock_medications
     ORDER BY missing_quantity DESC, name ASC
     LIMIT ?`,
    [limit],
  );
}

/** Dernières entrées du journal d'audit, avec le nom de leur auteur. */
export async function findRecentActivity(limit: number, offset = 0): Promise<ActivityRow[]> {
  return query<ActivityRow>(
    `SELECT
       al.id,
       CONCAT(u.first_name, ' ', u.last_name) AS user_name,
       al.action,
       al.resource,
       al.created_at
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ORDER BY al.created_at DESC, al.id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
  );
}

/** Nombre total d'entrées du journal (pagination de l'activité récente). */
export async function countActivity(): Promise<number> {
  const row = await queryOne<Row & { total: number | string | null }>(
    'SELECT COUNT(*) AS total FROM audit_logs',
  );
  return Number(row?.total ?? 0);
}
