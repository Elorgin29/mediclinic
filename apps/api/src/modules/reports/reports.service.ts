/**
 * Règles métier des rapports (`/api/reports`).
 *
 * Le service ne contient aucune chaîne SQL : il agrège les lignes renvoyées par
 * `reports.repository.ts` et les convertit en nombres exploitables par le front.
 *
 * IMPORTANT : les `SUM()` / `COUNT()` de MySQL arrivent en **chaîne** (le pilote
 * est configuré avec `supportBigNumbers`). Toutes les valeurs numériques de ce
 * fichier passent donc explicitement par `Number(...)` — jamais de `+` implicite
 * sur une valeur de ligne.
 */

import type { PaymentMethod } from '@mediclinic/shared';

import { AppError } from '../../utils/app-error.js';
import { defaultReportRange, toMySqlDate } from '../../utils/datetime.js';
import * as repository from './reports.repository.js';
import type { AppointmentReportGroup } from './reports.repository.js';

/* -------------------------------------------------------------------------- */
/* Constantes                                                                  */
/* -------------------------------------------------------------------------- */

/** Nombre de patients affichés dans le classement du chiffre d'affaires. */
const TOP_PATIENTS_LIMIT = 10;
/** Nombre de médicaments dans le rapport de consommation. */
const CONSUMPTION_LIMIT = 15;
/** Nombre de médicaments en alerte dans le rapport de stock. */
const LOW_STOCK_LIMIT = 25;
/** Nombre d'utilisateurs dans le rapport d'activité. */
const ACTIVITY_USERS_LIMIT = 15;

/* -------------------------------------------------------------------------- */
/* Plage de dates                                                              */
/* -------------------------------------------------------------------------- */

export interface ReportRange {
  /** `AAAA-MM-JJ` */
  from: string;
  /** `AAAA-MM-JJ` */
  to: string;
}

/** Arrondit à deux décimales (montants, moyennes, pourcentages). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Normalise la plage demandée.
 *
 * Sans paramètres, `defaultReportRange()` renvoie le mois courant. Une borne
 * isolée est complétée par l'autre extrémité de cette plage par défaut, ce qui
 * évite un `undefined` plus loin dans le SQL.
 *
 * @throws AppError 422 si les dates sont invalides ou inversées.
 */
export function resolveRange(input: { from?: string; to?: string }): ReportRange {
  const fallback = defaultReportRange();

  const from = input.from === undefined ? fallback.from : toMySqlDate(input.from);
  const to = input.to === undefined ? fallback.to : toMySqlDate(input.to);

  if (!from || !to) {
    throw AppError.unprocessable(
      'Les dates de la période sont invalides (format attendu : AAAA-MM-JJ).',
      'INVALID_DATE_RANGE',
    );
  }
  if (from > to) {
    throw AppError.unprocessable(
      'La date de début doit être antérieure ou égale à la date de fin.',
      'INVALID_DATE_RANGE',
    );
  }

  return { from, to };
}

/** Clé `AAAA-MM` d'une date `AAAA-MM-JJ`. */
function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** Enumère les clés `AAAA-MM` entre deux dates, bornes incluses. */
function monthKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  const start = Date.parse(`${monthKey(from)}-01T00:00:00Z`);
  const end = Date.parse(`${monthKey(to)}-01T00:00:00Z`);

  if (Number.isNaN(start) || Number.isNaN(end)) return keys;

  // Le 1er de chaque mois à 00:00 UTC : aucun décalage d'heure ne peut
  // déplacer la clé d'un mois sur l'autre.
  const cursor = new Date(start);
  while (cursor.getTime() <= end) {
    keys.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

/* -------------------------------------------------------------------------- */
/* Chiffre d'affaires                                                          */
/* -------------------------------------------------------------------------- */

export interface RevenueByMethodPoint {
  method: PaymentMethod | string;
  count: number;
  amount: number;
}

export interface RevenueByStatusPoint {
  status: string;
  count: number;
  amount: number;
}

export interface RevenueByMonthPointReport {
  /** `AAAA-MM` */
  period: string;
  revenue: number;
  paymentsCount: number;
  invoicesCount: number;
}

export interface TopPatientPoint {
  patientId: number;
  patientName: string;
  amount: number;
}

export interface RevenueReport extends ReportRange {
  totalRevenue: number;
  invoiceCount: number;
  paymentCount: number;
  averageInvoice: number;
  byMonth: RevenueByMonthPointReport[];
  byMethod: RevenueByMethodPoint[];
  byStatus: RevenueByStatusPoint[];
  topPatients: TopPatientPoint[];
}

/**
 * Rapport de chiffre d'affaires.
 * Le revenu est celui réellement ENCAISSÉ (`payments`), pas le montant facturé :
 * c'est la seule mesure comparable d'un mois sur l'autre.
 */
export async function getRevenueReport(input: { from?: string; to?: string }): Promise<RevenueReport> {
  const range = resolveRange(input);

  const [totals, invoiceCount, monthRows, methodRows, statusRows, topPatientRows] = await Promise.all([
    repository.findRevenueTotals(range.from, range.to),
    repository.countInvoicesInRange(range.from, range.to),
    repository.findRevenueByMonth(monthKey(range.from), monthKey(range.to)),
    repository.findRevenueByMethod(range.from, range.to),
    repository.findInvoiceStatusBreakdown(range.from, range.to),
    repository.findTopPatientsByRevenue(range.from, range.to, TOP_PATIENTS_LIMIT),
  ]);

  const totalRevenue = Number(totals?.total_revenue ?? 0);
  const paymentCount = Number(totals?.payments_count ?? 0);

  // La série mensuelle est complétée : un mois sans encaissement doit
  // apparaître à 0, sinon le graphique laisse croire à une activité continue.
  const monthIndex = new Map<
    string,
    { revenue: number; paymentsCount: number; invoicesCount: number }
  >();
  for (const row of monthRows) {
    monthIndex.set(row.period, {
      revenue: Number(row.revenue ?? 0),
      // `v_revenue_by_month` expose aussi ces deux compteurs : ils sont lus
      // lorsqu'ils sont présents et laissés à 0 sinon.
      paymentsCount: Number(row.payments_count ?? 0),
      invoicesCount: Number(row.invoices_count ?? 0),
    });
  }

  const byMonth: RevenueByMonthPointReport[] = monthKeys(range.from, range.to).map((period) => {
    const entry = monthIndex.get(period);
    return {
      period,
      revenue: entry?.revenue ?? 0,
      paymentsCount: entry?.paymentsCount ?? 0,
      invoicesCount: entry?.invoicesCount ?? 0,
    };
  });

  return {
    from: range.from,
    to: range.to,
    totalRevenue: round2(totalRevenue),
    invoiceCount: Number(invoiceCount),
    paymentCount: Number(paymentCount),
    // Sans facture, la moyenne est indéfinie : 0 est plus lisible qu'`Infinity`.
    averageInvoice: invoiceCount === 0 ? 0 : round2(totalRevenue / invoiceCount),
    byMonth,
    byMethod: methodRows.map((row) => ({
      method: row.method,
      count: Number(row.payments_count ?? 0),
      amount: round2(Number(row.amount ?? 0)),
    })),
    byStatus: statusRows.map((row) => ({
      status: row.status,
      count: Number(row.invoices_count ?? 0),
      amount: round2(Number(row.amount ?? 0)),
    })),
    topPatients: topPatientRows.map((row) => ({
      patientId: Number(row.patient_id),
      patientName: row.patient_name,
      amount: round2(Number(row.amount ?? 0)),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Rendez-vous                                                                 */
/* -------------------------------------------------------------------------- */

export interface AppointmentGroupPoint {
  label: string;
  count: number;
}

export interface AppointmentReport extends ReportRange {
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
  /** Taux de présence : terminés / total, en pourcentage arrondi. */
  attendanceRate: number;
  groupBy: AppointmentReportGroup;
  groups: AppointmentGroupPoint[];
}

/** Vérifie qu'un axe de regroupement reçu du client est autorisé. */
export function isAppointmentGroup(value: string): value is AppointmentReportGroup {
  return (repository.APPOINTMENT_REPORT_GROUPS as readonly string[]).includes(value);
}

/**
 * Rapport des rendez-vous, regroupé selon l'axe demandé.
 *
 * @throws AppError 400 si `groupBy` ne fait pas partie de la liste blanche.
 */
export async function getAppointmentReport(input: {
  from?: string;
  to?: string;
  groupBy?: string;
}): Promise<AppointmentReport> {
  const range = resolveRange(input);

  const requestedGroup = input.groupBy ?? 'day';
  if (!isAppointmentGroup(requestedGroup)) {
    throw AppError.badRequest(
      `Regroupement inconnu « ${requestedGroup} ». Valeurs acceptées : ${repository.APPOINTMENT_REPORT_GROUPS.join(', ')}.`,
      'INVALID_GROUP_BY',
    );
  }

  const [totals, groupRows] = await Promise.all([
    repository.findAppointmentTotals(range.from, range.to),
    repository.findAppointmentGroups(requestedGroup, range.from, range.to),
  ]);

  const total = Number(totals?.total ?? 0);
  const completed = Number(totals?.completed ?? 0);
  const cancelled = Number(totals?.cancelled ?? 0);
  const noShow = Number(totals?.no_show ?? 0);

  return {
    from: range.from,
    to: range.to,
    total,
    completed,
    cancelled,
    noShow,
    attendanceRate: total === 0 ? 0 : round2((completed / total) * 100),
    groupBy: requestedGroup,
    groups: groupRows.map((row) => ({
      // Un libellé vide (ex. département non affecté déjà couvert par
      // `COALESCE`) est normalisé pour rester lisible dans le graphique.
      label: row.label === '' || row.label === null ? 'Non renseigné' : String(row.label),
      count: Number(row.total ?? 0),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Stock                                                                       */
/* -------------------------------------------------------------------------- */

export interface LowStockPoint {
  id: number;
  name: string;
  stockQuantity: number;
  alertThreshold: number;
}

export interface ExpiredMedicationPoint {
  id: number;
  name: string;
  expiryDate: string | null;
  stockQuantity: number;
}

export interface ConsumptionPoint {
  medicationId: number;
  name: string;
  quantityOut: number;
  valueOut: number;
}

export interface StockReport extends ReportRange {
  totalReferences: number;
  totalUnits: number;
  stockValue: number;
  lowStock: LowStockPoint[];
  expired: ExpiredMedicationPoint[];
  movements: { in: number; out: number };
  consumptionByMedication: ConsumptionPoint[];
}

/**
 * Rapport de stock.
 * Les quantités entrées/sorties portent sur la période ; l'état du stock est
 * une photographie à l'instant de la requête (hors période par nature).
 */
export async function getStockReport(input: { from?: string; to?: string }): Promise<StockReport> {
  const range = resolveRange(input);

  const [totals, lowStockRows, expiredRows, movementTotals, consumptionRows] = await Promise.all([
    repository.findStockTotals(),
    repository.findLowStockMedications(LOW_STOCK_LIMIT),
    repository.findExpiredMedications(),
    repository.findStockMovementTotals(range.from, range.to),
    repository.findConsumptionByMedication(range.from, range.to, CONSUMPTION_LIMIT),
  ]);

  return {
    from: range.from,
    to: range.to,
    totalReferences: Number(totals?.total_references ?? 0),
    totalUnits: Number(totals?.total_units ?? 0),
    stockValue: round2(Number(totals?.stock_value ?? 0)),
    lowStock: lowStockRows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      stockQuantity: Number(row.stock_quantity ?? 0),
      alertThreshold: Number(row.alert_threshold ?? 0),
    })),
    expired: expiredRows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      expiryDate: row.expiry_date === null ? null : String(row.expiry_date),
      stockQuantity: Number(row.stock_quantity ?? 0),
    })),
    movements: {
      in: Number(movementTotals?.quantity_in ?? 0),
      out: Number(movementTotals?.quantity_out ?? 0),
    },
    consumptionByMedication: consumptionRows.map((row) => ({
      medicationId: Number(row.medication_id),
      name: row.name,
      quantityOut: Number(row.quantity_out ?? 0),
      valueOut: round2(Number(row.value_out ?? 0)),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Activité                                                                    */
/* -------------------------------------------------------------------------- */

export interface ActivityCountPoint {
  label: string;
  count: number;
}

export interface ActivityUserPoint {
  userId: number | null;
  userName: string;
  count: number;
}

export interface ActivityDayPoint {
  /** `AAAA-MM-JJ` */
  day: string;
  count: number;
}

export interface ActivityReport extends ReportRange {
  totalActions: number;
  byAction: ActivityCountPoint[];
  byResource: ActivityCountPoint[];
  byUser: ActivityUserPoint[];
  byDay: ActivityDayPoint[];
}

/**
 * Rapport d'activité du personnel, dérivé du journal d'audit.
 * Les journées sans action sont conservées à 0 : la série reste continue, ce
 * qui est indispensable pour un histogramme quotidien.
 */
export async function getActivityReport(input: { from?: string; to?: string }): Promise<ActivityReport> {
  const range = resolveRange(input);

  const [totalActions, actionRows, resourceRows, userRows, dayRows] = await Promise.all([
    repository.countAuditActions(range.from, range.to),
    repository.findAuditActionsByAction(range.from, range.to),
    repository.findAuditActionsByResource(range.from, range.to),
    repository.findAuditActionsByUser(range.from, range.to, ACTIVITY_USERS_LIMIT),
    repository.findAuditActionsByDay(range.from, range.to),
  ]);

  const dayIndex = new Map<string, number>();
  for (const row of dayRows) {
    dayIndex.set(String(row.day), Number(row.total ?? 0));
  }

  return {
    from: range.from,
    to: range.to,
    totalActions: Number(totalActions),
    byAction: actionRows.map((row) => ({ label: row.action, count: Number(row.total ?? 0) })),
    byResource: resourceRows.map((row) => ({ label: row.resource, count: Number(row.total ?? 0) })),
    byUser: userRows.map((row) => ({
      userId: row.user_id === null ? null : Number(row.user_id),
      // Un compte supprimé laisse un `user_id` NULL : l'action reste comptée.
      userName: row.user_name ?? 'Compte supprimé',
      count: Number(row.total ?? 0),
    })),
    byDay: enumerateDays(range.from, range.to).map((day) => ({
      day,
      count: dayIndex.get(day) ?? 0,
    })),
  };
}

/** Enumère les jours `AAAA-MM-JJ` d'une plage, bornes incluses. */
function enumerateDays(from: string, to: string): string[] {
  const days: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);

  if (Number.isNaN(start) || Number.isNaN(end)) return days;

  for (let time = start; time <= end; time += 86_400_000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

/* -------------------------------------------------------------------------- */
/* Patients                                                                    */
/* -------------------------------------------------------------------------- */

export interface PatientReport extends ReportRange {
  newPatients: number;
  totalPatients: number;
  byGender: ActivityCountPoint[];
  byAgeRange: ActivityCountPoint[];
  byCity: ActivityCountPoint[];
}

/**
 * Rapport démographique des patients.
 * `newPatients` porte sur la période ; les répartitions décrivent la totalité
 * du fichier patients (une pyramide des âges sur un mois n'aurait pas de sens).
 */
export async function getPatientReport(input: { from?: string; to?: string }): Promise<PatientReport> {
  const range = resolveRange(input);

  const [newPatients, totalPatients, genderRows, ageRows, cityRows] = await Promise.all([
    repository.countNewPatients(range.from, range.to),
    repository.countPatients(),
    repository.findPatientsByGender(),
    repository.findPatientsByAgeRange(),
    repository.findPatientsByCity(),
  ]);

  return {
    from: range.from,
    to: range.to,
    newPatients: Number(newPatients),
    totalPatients: Number(totalPatients),
    byGender: genderRows.map((row) => ({ label: row.gender, count: Number(row.total ?? 0) })),
    byAgeRange: ageRows.map((row) => ({ label: row.age_range, count: Number(row.total ?? 0) })),
    byCity: cityRows.map((row) => ({ label: row.city, count: Number(row.total ?? 0) })),
  };
}

/* -------------------------------------------------------------------------- */
/* Export CSV                                                                  */
/* -------------------------------------------------------------------------- */

/** Types de rapport exportables en CSV. */
export const EXPORT_TYPES = ['revenue', 'appointments', 'stock', 'activity'] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

/** Vérifie qu'un type d'export reçu du client est autorisé. */
export function isExportType(value: string): value is ExportType {
  return (EXPORT_TYPES as readonly string[]).includes(value);
}

/**
 * Échappe une valeur pour un CSV « Excel français ».
 *
 * Le séparateur est le point-virgule (convention francophone) et les guillemets
 * internes sont doublés. Une valeur contenant un séparateur, un guillemet ou un
 * saut de ligne est systématiquement entourée de guillemets.
 */
export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[";\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Assemble des lignes (tableau de cellules) en CSV terminé par un saut de ligne. */
function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((cells) => cells.map(escapeCsv).join(';')).join('\r\n') + '\r\n';
}

/** Contenu CSV du rapport demandé, sans BOM (ajouté par le contrôleur). */
export async function buildCsv(
  type: ExportType,
  input: { from?: string; to?: string; groupBy?: string },
): Promise<{ content: string; range: ReportRange }> {
  switch (type) {
    case 'revenue': {
      const report = await getRevenueReport(input);
      const rows: unknown[][] = [['Période', 'Mois', 'Encaissements', 'Factures', 'Montant']];
      for (const point of report.byMonth) {
        rows.push(['Chiffre d’affaires', point.period, point.paymentsCount, point.invoicesCount, point.revenue]);
      }
      rows.push([]);
      rows.push(['Moyen de paiement', 'Nombre', 'Montant']);
      for (const point of report.byMethod) {
        rows.push([point.method, point.count, point.amount]);
      }
      rows.push([]);
      rows.push(['Synthèse', 'Valeur']);
      rows.push(['Total encaissé', report.totalRevenue]);
      rows.push(['Factures émises', report.invoiceCount]);
      rows.push(['Paiements enregistrés', report.paymentCount]);
      rows.push(['Facture moyenne', report.averageInvoice]);
      return { content: toCsv(rows), range: { from: report.from, to: report.to } };
    }

    case 'appointments': {
      const report = await getAppointmentReport(input);
      const rows: unknown[][] = [['Regroupement', 'Libellé', 'Nombre']];
      for (const point of report.groups) {
        rows.push([report.groupBy, point.label, point.count]);
      }
      rows.push([]);
      rows.push(['Synthèse', 'Valeur']);
      rows.push(['Total', report.total]);
      rows.push(['Terminés', report.completed]);
      rows.push(['Annulés', report.cancelled]);
      rows.push(['Absents', report.noShow]);
      rows.push(['Taux de présence (%)', report.attendanceRate]);
      return { content: toCsv(rows), range: { from: report.from, to: report.to } };
    }

    case 'stock': {
      const report = await getStockReport(input);
      const rows: unknown[][] = [['Référence', 'Stock', 'Seuil d’alerte']];
      for (const point of report.lowStock) {
        rows.push([point.name, point.stockQuantity, point.alertThreshold]);
      }
      rows.push([]);
      rows.push(['Médicament', 'Quantité sortie', 'Valeur sortie']);
      for (const point of report.consumptionByMedication) {
        rows.push([point.name, point.quantityOut, point.valueOut]);
      }
      rows.push([]);
      rows.push(['Synthèse', 'Valeur']);
      rows.push(['Références', report.totalReferences]);
      rows.push(['Unités en stock', report.totalUnits]);
      rows.push(['Valeur du stock', report.stockValue]);
      rows.push(['Entrées sur la période', report.movements.in]);
      rows.push(['Sorties sur la période', report.movements.out]);
      return { content: toCsv(rows), range: { from: report.from, to: report.to } };
    }

    case 'activity': {
      const report = await getActivityReport(input);
      const rows: unknown[][] = [['Date', 'Actions']];
      for (const point of report.byDay) {
        rows.push([point.day, point.count]);
      }
      rows.push([]);
      rows.push(['Action', 'Nombre']);
      for (const point of report.byAction) {
        rows.push([point.label, point.count]);
      }
      rows.push([]);
      rows.push(['Utilisateur', 'Nombre']);
      for (const point of report.byUser) {
        rows.push([point.userName, point.count]);
      }
      rows.push([]);
      rows.push(['Total des actions', report.totalActions]);
      return { content: toCsv(rows), range: { from: report.from, to: report.to } };
    }
  }
}
