/**
 * Règles métier du planning des gardes.
 *
 * Le service normalise les dates entrantes, vérifie l'existence des références
 * (médecin, département), refuse les créneaux incohérents ou chevauchants, puis
 * délègue toute la SQL au repository.
 */

import {
  type CreateShiftInput,
  type Shift,
  type ShiftCalendarEntry,
  type ShiftStatus,
  type ShiftType,
  type UpdateShiftInput,
} from '@mediclinic/shared';

import { AppError } from '../../utils/app-error.js';
import { toMySqlDate, toMySqlDateTime } from '../../utils/datetime.js';
import type { Pagination } from '../../utils/pagination.js';
import * as repository from './shifts.repository.js';
import type { ShiftRow } from './shifts.repository.js';

/* -------------------------------------------------------------------------- */
/* Couleurs du planning                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Palette de 10 couleurs stables : l'index est dérivé de `doctor_id % 10`, ce
 * qui garantit qu'un médecin conserve toujours la même couleur d'un écran à
 * l'autre, sans stockage supplémentaire en base.
 */
export const DOCTOR_COLORS: readonly string[] = [
  '#0f766e',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#4f46e5',
];

/** Couleur hexadécimale stable associée à un médecin. */
export function doctorColor(doctorId: number): string {
  const index = Math.abs(Math.trunc(doctorId)) % DOCTOR_COLORS.length;
  // `noUncheckedIndexedAccess` : le modulo borne déjà l'index, la garde évite
  // malgré tout un `undefined` en cas d'évolution de la palette.
  return DOCTOR_COLORS[index] ?? DOCTOR_COLORS[0] ?? '#0f766e';
}

/* -------------------------------------------------------------------------- */
/* Conversions                                                                 */
/* -------------------------------------------------------------------------- */

/** Convertit une ligne de la vue en objet `Shift` exposé par l'API. */
function toShift(row: ShiftRow): Shift {
  return {
    id: row.id,
    doctor_id: row.doctor_id,
    doctor_name: row.doctor_name,
    department_id: row.department_id,
    department_name: row.department_name,
    start_at: String(row.start_at),
    end_at: String(row.end_at),
    type: row.type,
    status: row.status,
    notes: row.notes,
  };
}

/** Entrée de planning : garde complétée de la couleur du médecin. */
function toCalendarEntry(row: ShiftRow): ShiftCalendarEntry {
  return { ...toShift(row), doctor_color: doctorColor(row.doctor_id) };
}

/* -------------------------------------------------------------------------- */
/* Filtres et plages de dates                                                  */
/* -------------------------------------------------------------------------- */

export interface ShiftListFilters {
  doctorId?: number;
  departmentId?: number;
  type?: ShiftType;
  status?: ShiftStatus;
  from?: string;
  to?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

/** Nombre de jours maximum accepté pour un planning (garde-fou de charge). */
const CALENDAR_MAX_DAYS = 366;

/** Enumérate les jours d'une plage, en UTC pour ignorer les changements d'heure. */
function enumerateDays(from: string, to: string): string[] {
  const days: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);

  for (let time = start; time <= end; time += 86_400_000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

/** Bornes du mois courant, utilisées par défaut par `GET /calendar`. */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const last = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

/** Normalise et contrôle une plage de dates (`AAAA-MM-JJ`). */
function resolveRange(from?: string, to?: string): { from: string; to: string } {
  const fallback = currentMonthRange();
  const normalizedFrom = from === undefined ? fallback.from : toMySqlDate(from);
  const normalizedTo = to === undefined ? fallback.to : toMySqlDate(to);

  if (!normalizedFrom || !normalizedTo) {
    throw AppError.unprocessable('Les dates de la plage sont invalides.', 'INVALID_DATE_RANGE');
  }
  if (normalizedFrom > normalizedTo) {
    throw AppError.unprocessable(
      'La date de début doit être antérieure ou égale à la date de fin.',
      'INVALID_DATE_RANGE',
    );
  }

  const days = enumerateDays(normalizedFrom, normalizedTo).length;
  if (days === 0 || days > CALENDAR_MAX_DAYS) {
    throw AppError.unprocessable(
      `La plage demandée est trop étendue (maximum ${CALENDAR_MAX_DAYS} jours).`,
      'DATE_RANGE_TOO_WIDE',
    );
  }

  return { from: normalizedFrom, to: normalizedTo };
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** Liste paginée des gardes (vue `v_shift_calendar`). */
export async function list(
  filters: ShiftListFilters,
  pagination: Pagination,
): Promise<{ rows: Shift[]; total: number }> {
  const normalized = {
    ...(filters.doctorId === undefined ? {} : { doctorId: filters.doctorId }),
    ...(filters.departmentId === undefined ? {} : { departmentId: filters.departmentId }),
    ...(filters.type === undefined ? {} : { type: filters.type }),
    ...(filters.status === undefined ? {} : { status: filters.status }),
    ...(filters.from === undefined ? {} : { from: toMySqlDate(filters.from) ?? undefined }),
    ...(filters.to === undefined ? {} : { to: toMySqlDate(filters.to) ?? undefined }),
  };

  const [rows, total] = await Promise.all([
    repository.listShifts(normalized, {
      ...(filters.sort === undefined ? {} : { sort: filters.sort }),
      ...(filters.order === undefined ? {} : { order: filters.order }),
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    repository.countShifts(normalized),
  ]);

  return { rows: rows.map(toShift), total };
}

/** Gardes du médecin connecté (route `GET /me`). */
export async function listMine(
  doctorId: number | null,
  pagination: Pagination,
): Promise<{ rows: Shift[]; total: number }> {
  if (doctorId === null) {
    throw AppError.forbidden(
      'Cette ressource est réservée aux comptes médecins.',
      'DOCTOR_PROFILE_REQUIRED',
    );
  }
  return list({ doctorId }, pagination);
}

/** Résumé d'un médecin sur la plage affichée. */
export interface DoctorCalendarSummary {
  doctorId: number;
  doctorName: string;
  color: string;
  shiftCount: number;
  hours: number;
}

export interface ShiftCalendar {
  from: string;
  to: string;
  days: Array<{ date: string; shifts: ShiftCalendarEntry[] }>;
  byDoctor: DoctorCalendarSummary[];
}

/** Planning groupé par jour, avec un récapitulatif par médecin. */
export async function calendar(input: {
  from?: string;
  to?: string;
  departmentId?: number;
}): Promise<ShiftCalendar> {
  const range = resolveRange(input.from, input.to);
  const rows = await repository.listCalendarShifts(range.from, range.to, input.departmentId);

  const byDate = new Map<string, ShiftCalendarEntry[]>();
  const byDoctor = new Map<number, DoctorCalendarSummary>();

  for (const row of rows) {
    const date = String(row.shift_date);
    const entries = byDate.get(date);
    if (entries) entries.push(toCalendarEntry(row));
    else byDate.set(date, [toCalendarEntry(row)]);

    const hours = Number(row.hours ?? 0);
    const summary = byDoctor.get(row.doctor_id);
    if (summary) {
      summary.shiftCount += 1;
      summary.hours = Math.round((summary.hours + hours) * 10) / 10;
    } else {
      byDoctor.set(row.doctor_id, {
        doctorId: row.doctor_id,
        doctorName: row.doctor_name,
        color: doctorColor(row.doctor_id),
        shiftCount: 1,
        hours: Math.round(hours * 10) / 10,
      });
    }
  }

  return {
    from: range.from,
    to: range.to,
    days: enumerateDays(range.from, range.to).map((date) => ({
      date,
      shifts: byDate.get(date) ?? [],
    })),
    byDoctor: [...byDoctor.values()].sort((a, b) => a.doctorName.localeCompare(b.doctorName, 'fr')),
  };
}

/** Détail d'une garde. */
export async function getById(id: number): Promise<Shift> {
  const row = await repository.findShiftById(id);
  if (!row) throw AppError.notFound('Garde introuvable.', 'SHIFT_NOT_FOUND');
  return toShift(row);
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/** Vérifie qu'un médecin existe (422 explicite plutôt qu'une erreur SQL). */
async function assertDoctorExists(doctorId: number): Promise<void> {
  const name = await repository.findDoctorName(doctorId);
  if (!name) {
    throw AppError.unprocessable(`Le médecin n° ${doctorId} n'existe pas.`, 'DOCTOR_NOT_FOUND');
  }
}

/** Vérifie qu'un département existe. */
async function assertDepartmentExists(departmentId: number): Promise<void> {
  const name = await repository.findDepartmentName(departmentId);
  if (!name) {
    throw AppError.unprocessable(
      `Le département n° ${departmentId} n'existe pas.`,
      'DEPARTMENT_NOT_FOUND',
    );
  }
}

/** Refuse un créneau dont la fin n'est pas strictement postérieure au début. */
function assertChronology(startAt: string | null, endAt: string | null): { startAt: string; endAt: string } {
  if (!startAt || !endAt) {
    throw AppError.unprocessable('Les dates de la garde sont invalides.', 'INVALID_SHIFT_DATES');
  }
  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    throw AppError.unprocessable(
      'La fin de la garde doit être strictement postérieure à son début.',
      'INVALID_SHIFT_DATES',
    );
  }
  return { startAt, endAt };
}

/** Refuse un chevauchement avec une autre garde du même médecin (409). */
async function assertNoOverlap(
  doctorId: number,
  startAt: string,
  endAt: string,
  excludeId?: number,
): Promise<void> {
  const conflict = await repository.findOverlappingShift(doctorId, startAt, endAt, excludeId);
  if (!conflict) return;

  throw AppError.conflict(
    `Le médecin a déjà une garde sur ce créneau (garde n° ${conflict.id} du ${conflict.start_at} au ${conflict.end_at}, statut ${conflict.status}).`,
    'SHIFT_OVERLAP',
  );
}

/** Crée une garde après vérification des références et du chevauchement. */
export async function create(input: CreateShiftInput, userId: number): Promise<Shift> {
  await assertDoctorExists(input.doctorId);
  await assertDepartmentExists(input.departmentId);

  const { startAt, endAt } = assertChronology(
    toMySqlDateTime(input.startAt),
    toMySqlDateTime(input.endAt),
  );
  await assertNoOverlap(input.doctorId, startAt, endAt);

  const id = await repository.createShift({
    doctorId: input.doctorId,
    departmentId: input.departmentId,
    startAt,
    endAt,
    type: input.type,
    status: input.status,
    notes: input.notes ?? null,
    createdBy: userId,
  });

  return getById(id);
}

/**
 * Modifie une garde.
 * Les dates effectives sont reconstituées à partir de la garde existante : une
 * modification partielle (une seule borne) reste ainsi contrôlée.
 */
export async function update(id: number, input: UpdateShiftInput): Promise<Shift> {
  const existing = await repository.findShiftRecord(id);
  if (!existing) throw AppError.notFound('Garde introuvable.', 'SHIFT_NOT_FOUND');

  const doctorId = input.doctorId ?? existing.doctor_id;
  const departmentId = input.departmentId ?? existing.department_id;

  if (input.doctorId !== undefined) await assertDoctorExists(doctorId);
  if (input.departmentId !== undefined) await assertDepartmentExists(departmentId);

  const { startAt, endAt } = assertChronology(
    input.startAt === undefined ? String(existing.start_at) : toMySqlDateTime(input.startAt),
    input.endAt === undefined ? String(existing.end_at) : toMySqlDateTime(input.endAt),
  );

  const doctorChanged = doctorId !== existing.doctor_id;
  const datesChanged = input.startAt !== undefined || input.endAt !== undefined;
  if (doctorChanged || datesChanged) {
    await assertNoOverlap(doctorId, startAt, endAt, id);
  }

  const values: Record<string, unknown> = {};
  if (input.doctorId !== undefined) values.doctor_id = input.doctorId;
  if (input.departmentId !== undefined) values.department_id = input.departmentId;
  if (datesChanged) {
    values.start_at = startAt;
    values.end_at = endAt;
  }
  if (input.type !== undefined) values.type = input.type;
  if (input.status !== undefined) values.status = input.status;
  if (input.notes !== undefined) values.notes = input.notes;

  if (Object.keys(values).length === 0) {
    throw AppError.badRequest('Aucun champ valide à mettre à jour.', 'NOTHING_TO_UPDATE');
  }

  await repository.updateShift(id, values);
  return getById(id);
}

/** Supprime une garde. */
export async function remove(id: number): Promise<void> {
  const affected = await repository.deleteShift(id);
  if (affected === 0) throw AppError.notFound('Garde introuvable.', 'SHIFT_NOT_FOUND');
}
