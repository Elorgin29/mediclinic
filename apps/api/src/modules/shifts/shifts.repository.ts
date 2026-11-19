/**
 * Accès aux données du module « gardes ».
 *
 * Les lectures s'appuient sur la vue `v_shift_calendar` (jointures déjà
 * écrites dans `database/migrations/002_views.sql`) ; les écritures portent sur
 * la table `shifts`. Aucune règle métier ici : uniquement du SQL préparé.
 */

import type { ShiftStatus, ShiftType } from '@mediclinic/shared';
import type { PoolConnection } from 'mysql2/promise';

import type { Row } from '../../config/db.js';
import {
  execute,
  executeWith,
  limitClause,
  query,
  queryOne,
  withTransaction,
} from '../../config/db.js';
import { buildSetClause } from '../../utils/http.js';
import { buildOrderBy, whereClause } from '../../utils/pagination.js';

/* -------------------------------------------------------------------------- */
/* Types de lignes                                                             */
/* -------------------------------------------------------------------------- */

/** Ligne du planning (`v_shift_calendar`), enrichie du médecin et du département. */
export interface ShiftRow extends Row {
  id: number;
  doctor_id: number;
  department_id: number;
  start_at: string;
  end_at: string;
  type: ShiftType;
  status: ShiftStatus;
  notes: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  /** ROUND(x, 1) : MySQL renvoie un DECIMAL sous forme de chaîne. */
  hours: string;
  doctor_name: string;
  specialty_name: string;
  department_name: string;
}

/** Ligne brute de `shifts`, nécessaire au calcul du chevauchement. */
export interface ShiftRecord extends Row {
  id: number;
  doctor_id: number;
  department_id: number;
  start_at: string;
  end_at: string;
  type: ShiftType;
  status: ShiftStatus;
  notes: string | null;
  created_by: number | null;
}

/** Garde en conflit avec un nouveau créneau (message d'erreur 409). */
export interface ShiftConflictRow extends Row {
  id: number;
  start_at: string;
  end_at: string;
  type: ShiftType;
  status: ShiftStatus;
}

/* -------------------------------------------------------------------------- */
/* Filtres                                                                     */
/* -------------------------------------------------------------------------- */

export interface ShiftFilters {
  doctorId?: number;
  departmentId?: number;
  type?: string;
  status?: string;
  /** Borne basse incluse, au format `AAAA-MM-JJ`. */
  from?: string;
  /** Borne haute incluse, au format `AAAA-MM-JJ`. */
  to?: string;
}

/** Colonnes de tri autorisées : liste blanche, aucune valeur client en SQL. */
const SHIFT_SORT_COLUMNS: Readonly<Record<string, string>> = {
  start_at: 'sh.start_at',
  end_at: 'sh.end_at',
  type: 'sh.type',
  status: 'sh.status',
  doctor_name: 'sh.doctor_name',
  department_name: 'sh.department_name',
};

/** Colonnes modifiables d'une garde (liste blanche pour le SET dynamique). */
const SHIFT_UPDATABLE_COLUMNS = [
  'doctor_id',
  'department_id',
  'start_at',
  'end_at',
  'type',
  'status',
  'notes',
] as const;

const SHIFT_SELECT = `
  SELECT
    sh.id,
    sh.doctor_id,
    sh.department_id,
    sh.start_at,
    sh.end_at,
    sh.type,
    sh.status,
    sh.notes,
    sh.shift_date,
    sh.start_time,
    sh.end_time,
    sh.hours,
    sh.doctor_name,
    sh.specialty_name,
    sh.department_name
  FROM v_shift_calendar sh
`;

/**
 * Construit la clause WHERE commune à la liste et au comptage.
 * La borne haute est traitée en « jour entier » : une garde de nuit démarrant à
 * 22 h le dernier jour de la plage reste ainsi visible.
 */
function buildFilters(filters: ShiftFilters): { where: string; params: unknown[] } {
  const fragments: string[] = [];
  const params: unknown[] = [];

  if (filters.doctorId !== undefined) {
    fragments.push('sh.doctor_id = ?');
    params.push(filters.doctorId);
  }
  if (filters.departmentId !== undefined) {
    fragments.push('sh.department_id = ?');
    params.push(filters.departmentId);
  }
  if (filters.type !== undefined) {
    fragments.push('sh.type = ?');
    params.push(filters.type);
  }
  if (filters.status !== undefined) {
    fragments.push('sh.status = ?');
    params.push(filters.status);
  }
  if (filters.from !== undefined) {
    fragments.push('sh.start_at >= ?');
    params.push(`${filters.from} 00:00:00`);
  }
  if (filters.to !== undefined) {
    fragments.push('sh.start_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(filters.to);
  }

  return { where: whereClause(fragments), params };
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** Nombre total de gardes correspondant aux filtres (requête COUNT dédiée). */
export async function countShifts(filters: ShiftFilters): Promise<number> {
  const { where, params } = buildFilters(filters);
  const row = await queryOne<Row & { total: number }>(
    `SELECT COUNT(*) AS total FROM v_shift_calendar sh ${where}`,
    params,
  );
  return Number(row?.total ?? 0);
}

/** Liste paginée des gardes. */
export async function listShifts(
  filters: ShiftFilters,
  options: { sort?: string; order?: string; limit: number; offset: number },
): Promise<ShiftRow[]> {
  const { where, params } = buildFilters(filters);
  const orderBy = buildOrderBy(options.sort, options.order, SHIFT_SORT_COLUMNS, 'sh.start_at', 'asc');
  const limit = limitClause(options.limit, options.offset);

  return query<ShiftRow>(
    `${SHIFT_SELECT} ${where} ORDER BY ${orderBy}, sh.id ASC ${limit.sql}`,
    [...params, ...limit.params],
  );
}

/**
 * Gardes chevauchant la plage demandée (planning).
 * Un chevauchement se teste par `start_at < fin_de_plage AND end_at > début`,
 * ce qui couvre aussi les gardes de nuit à cheval sur deux jours.
 */
export async function listCalendarShifts(
  from: string,
  to: string,
  departmentId?: number,
): Promise<ShiftRow[]> {
  const params: unknown[] = [to, from];
  let sql = `${SHIFT_SELECT}
    WHERE sh.start_at < DATE_ADD(?, INTERVAL 1 DAY)
      AND sh.end_at > ?`;

  if (departmentId !== undefined) {
    sql += ' AND sh.department_id = ?';
    params.push(departmentId);
  }

  return query<ShiftRow>(`${sql} ORDER BY sh.start_at ASC, sh.id ASC`, params);
}

/** Détail d'une garde (vue enrichie). */
export async function findShiftById(id: number): Promise<ShiftRow | null> {
  return queryOne<ShiftRow>(`${SHIFT_SELECT} WHERE sh.id = ?`, [id]);
}

/** Ligne brute d'une garde (fusion start/end lors d'une modification partielle). */
export async function findShiftRecord(id: number): Promise<ShiftRecord | null> {
  return queryOne<ShiftRecord>(
    `SELECT id, doctor_id, department_id, start_at, end_at, type, status, notes, created_by
     FROM shifts WHERE id = ?`,
    [id],
  );
}

/**
 * Recherche une garde du même médecin chevauchant le créneau.
 * Les gardes annulées sont ignorées : elles ne bloquent pas la planification.
 */
export async function findOverlappingShift(
  doctorId: number,
  startAt: string,
  endAt: string,
  excludeId?: number,
): Promise<ShiftConflictRow | null> {
  const params: unknown[] = [doctorId, endAt, startAt];
  let sql = `SELECT id, start_at, end_at, type, status
    FROM shifts
    WHERE doctor_id = ?
      AND status <> 'CANCELLED'
      AND start_at < ?
      AND end_at > ?`;

  if (excludeId !== undefined) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }

  return queryOne<ShiftConflictRow>(`${sql} ORDER BY start_at ASC LIMIT 1`, params);
}

/* -------------------------------------------------------------------------- */
/* Vérifications de références                                                 */
/* -------------------------------------------------------------------------- */

/** Le médecin existe-t-il ? (message métier 422 le cas échéant). */
export async function findDoctorName(id: number): Promise<string | null> {
  const row = await queryOne<Row & { doctor_name: string }>(
    `SELECT CONCAT('Dr ', u.first_name, ' ', u.last_name) AS doctor_name
     FROM doctors d
     JOIN users u ON u.id = d.user_id
     WHERE d.id = ?`,
    [id],
  );
  return row?.doctor_name ?? null;
}

/** Le département existe-t-il ? */
export async function findDepartmentName(id: number): Promise<string | null> {
  const row = await queryOne<Row & { name: string }>(
    'SELECT name FROM departments WHERE id = ?',
    [id],
  );
  return row?.name ?? null;
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

export interface NewShiftInput {
  doctorId: number;
  departmentId: number;
  startAt: string;
  endAt: string;
  type: ShiftType;
  status: ShiftStatus;
  notes: string | null;
  createdBy: number;
}

/**
 * Crée une garde dans une transaction.
 * L'insertion est atomique vis-à-vis des contraintes de la table
 * (`chk_shifts_dates`) : aucune garde partiellement écrite ne peut subsister.
 */
export async function createShift(input: NewShiftInput): Promise<number> {
  return withTransaction(async (connection: PoolConnection) => {
    const result = await executeWith(
      connection,
      `INSERT INTO shifts
         (doctor_id, department_id, start_at, end_at, type, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.doctorId,
        input.departmentId,
        input.startAt,
        input.endAt,
        input.type,
        input.status,
        input.notes,
        input.createdBy,
      ],
    );
    return result.insertId;
  });
}

/** Met à jour les colonnes fournies (liste blanche) et renvoie les lignes touchées. */
export async function updateShift(id: number, values: Record<string, unknown>): Promise<number> {
  const { sql, params } = buildSetClause(values, SHIFT_UPDATABLE_COLUMNS);
  const result = await execute(`UPDATE shifts SET ${sql} WHERE id = ?`, [...params, id]);
  return result.affectedRows;
}

/** Supprime définitivement une garde et renvoie les lignes touchées. */
export async function deleteShift(id: number): Promise<number> {
  const result = await execute('DELETE FROM shifts WHERE id = ?', [id]);
  return result.affectedRows;
}
