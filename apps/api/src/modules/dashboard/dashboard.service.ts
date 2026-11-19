/**
 * Règles métier du tableau de bord.
 *
 * Le service transforme les lignes SQL (agrégats DECIMAL renvoyés en chaîne par
 * le pilote) en objets typés `DashboardStats` / `DashboardCharts` consommés
 * tels quels par le front. Aucune chaîne SQL n'est écrite ici.
 */

import type {
  ActivityEntry,
  AppointmentsByDepartmentPoint,
  ConsultationsByDoctorPoint,
  DashboardCharts,
  DashboardPayload,
  DashboardStats,
  LowStockMedication,
  Paginated,
  RevenueByMonthPoint,
  TopMedicationPoint,
} from '@mediclinic/shared';

import { AppError } from '../../utils/app-error.js';
import type { Pagination } from '../../utils/pagination.js';
import { paginated } from '../../utils/pagination.js';
import * as repository from './dashboard.repository.js';
import type {
  ActivityRow,
  DepartmentCountRow,
  DoctorCountRow,
  LowStockRow,
  MedicationCountRow,
  RevenueMonthRow,
} from './dashboard.repository.js';

/** Le graphique du chiffre d'affaires couvre toujours douze mois. */
const REVENUE_MONTHS = 12;
const CONSULTATIONS_LIMIT = 10;
const MEDICATIONS_LIMIT = 8;
const LOW_STOCK_LIMIT = 10;
const RECENT_ACTIVITY_LIMIT = 10;

/** Arrondit à deux décimales (pourcentages, moyennes). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Clé `AAAA-MM` d'une date. */
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Clés `AAAA-MM` des `count` derniers mois, du plus ancien au plus récent. */
function lastMonthKeys(count: number): string[] {
  const reference = new Date();
  const keys: string[] = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    keys.push(monthKey(new Date(reference.getFullYear(), reference.getMonth() - index, 1)));
  }

  return keys;
}

/**
 * Variation du chiffre d'affaires entre le mois courant et le mois précédent.
 *
 * Un mois précédent nul rend le pourcentage indéfini (division par zéro) : on
 * renvoie alors 0 plutôt qu'`Infinity`, valeur que le front ne saurait pas
 * afficher.
 */
function revenueChangePercent(current: number, previous: number): number {
  if (previous <= 0) return 0;
  return round2(((current - previous) / previous) * 100);
}

/**
 * Complète la série mensuelle pour qu'elle contienne TOUJOURS `REVENUE_MONTHS`
 * points : un mois sans encaissement doit apparaître à 0, sinon le graphique
 * se décale et laisse croire à une activité continue.
 */
function completeRevenueSeries(rows: RevenueMonthRow[]): RevenueByMonthPoint[] {
  const revenueByPeriod = new Map<string, number>();
  for (const row of rows) {
    revenueByPeriod.set(row.period, Number(row.revenue ?? 0));
  }

  return lastMonthKeys(REVENUE_MONTHS).map((month) => ({
    month,
    revenue: revenueByPeriod.get(month) ?? 0,
  }));
}

/** Convertit une ligne SQL en alerte de stock exposable. */
function toLowStockMedication(row: LowStockRow): LowStockMedication {
  return {
    id: Number(row.id),
    name: row.name,
    stock_quantity: Number(row.stock_quantity ?? 0),
    alert_threshold: Number(row.alert_threshold ?? 0),
  };
}

/** Convertit une ligne SQL en entrée d'activité exposable. */
function toActivityEntry(row: ActivityRow): ActivityEntry {
  return {
    id: Number(row.id),
    user_name: row.user_name ?? null,
    action: row.action,
    resource: row.resource,
    created_at: String(row.created_at),
  };
}

/** Indicateurs chiffrés de la page d'accueil. */
export async function getStats(): Promise<DashboardStats> {
  const row = await repository.findDashboardStats();

  // La vue est agrégée sans GROUP BY : elle renvoie toujours une ligne.
  if (!row) {
    throw AppError.internal(
      'Les indicateurs du tableau de bord sont indisponibles (vue v_dashboard_stats vide).',
      'DASHBOARD_STATS_UNAVAILABLE',
    );
  }

  const revenueMonth = Number(row.revenue_month ?? 0);
  const revenuePreviousMonth = Number(row.revenue_previous_month ?? 0);

  return {
    patientsTotal: Number(row.patients_total ?? 0),
    doctorsTotal: Number(row.doctors_total ?? 0),
    appointmentsToday: Number(row.appointments_today ?? 0),
    appointmentsWeek: Number(row.appointments_week ?? 0),
    appointmentsMonth: Number(row.appointments_month ?? 0),
    revenueMonth,
    revenuePreviousMonth,
    revenueChangePercent: revenueChangePercent(revenueMonth, revenuePreviousMonth),
    pendingMeetings: Number(row.pending_meetings ?? 0),
    lowStockCount: Number(row.low_stock_count ?? 0),
    shiftsInProgress: Number(row.shifts_in_progress ?? 0),
  };
}

/** Séries alimentant les graphiques du tableau de bord. */
export async function getCharts(): Promise<DashboardCharts> {
  const months = lastMonthKeys(REVENUE_MONTHS);
  const sinceMonth = months[0] ?? monthKey(new Date());

  const [revenueRows, departments, doctors, medications, lowStock, activity] = await Promise.all([
    repository.findRevenueByMonth(sinceMonth),
    repository.findAppointmentsByDepartment(),
    repository.findConsultationsByDoctor(CONSULTATIONS_LIMIT),
    repository.findTopMedications(MEDICATIONS_LIMIT),
    repository.findLowStockMedications(LOW_STOCK_LIMIT),
    repository.findRecentActivity(RECENT_ACTIVITY_LIMIT),
  ]);

  return {
    revenueByMonth: completeRevenueSeries(revenueRows),
    appointmentsByDepartment: departments.map(
      (row: DepartmentCountRow): AppointmentsByDepartmentPoint => ({
        department: row.department_name,
        count: Number(row.appointments_count ?? 0),
      }),
    ),
    consultationsByDoctor: doctors.map(
      (row: DoctorCountRow): ConsultationsByDoctorPoint => ({
        doctor: row.doctor_name,
        count: Number(row.consultations_count ?? 0),
      }),
    ),
    topMedications: medications.map(
      (row: MedicationCountRow): TopMedicationPoint => ({
        medication: row.name,
        dispensed: Number(row.total_quantity ?? 0),
      }),
    ),
    lowStock: lowStock.map(toLowStockMedication),
    recentActivity: activity.map(toActivityEntry),
  };
}

/** Charge complète du tableau de bord (indicateurs + graphiques). */
export async function getDashboardPayload(): Promise<DashboardPayload> {
  const [stats, charts] = await Promise.all([getStats(), getCharts()]);
  return { stats, charts };
}

/** Activité récente paginée (journal d'audit jointe à ses auteurs). */
export async function listActivity(pagination: Pagination): Promise<Paginated<ActivityEntry>> {
  const [rows, total] = await Promise.all([
    repository.findRecentActivity(pagination.limit, pagination.offset),
    repository.countActivity(),
  ]);

  return paginated(rows.map(toActivityEntry), total, pagination);
}
