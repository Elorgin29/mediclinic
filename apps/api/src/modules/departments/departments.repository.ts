/**
 * Accès aux données des départements de la clinique.
 *
 * Les lectures s'appuient sur les tables (il n'existe pas de vue dédiée) et
 * regroupent la jointure « chef de département » : `departments.head_doctor_id`
 * → `doctors` → `users`. Les compteurs sont calculés en sous-requêtes pour
 * éviter la multiplication des lignes par les jointures.
 */

import type { Row } from '../../config/db.js';
import { execute, insert, query, queryOne } from '../../config/db.js';
import { buildSetClause } from '../../utils/http.js';
import { buildOrderBy, likePattern, whereClause } from '../../utils/pagination.js';

/** Ligne de département enrichie du nom du chef et du nombre de médecins. */
export interface DepartmentRow extends Row {
  id: number;
  name: string;
  description: string | null;
  head_doctor_id: number | null;
  created_at: string;
  head_doctor_name: string | null;
  doctors_count: number;
}

/** Médecin d'un département, réduit à ce qu'affiche la fiche du département. */
export interface DepartmentDoctorRow extends Row {
  id: number;
  full_name: string;
  specialty_name: string;
}

/**
 * Colonnes communes aux lectures : le département, le nom du chef (concaténation
 * faite en SQL pour rester homogène avec la vue `v_doctor_directory`) et le
 * nombre de médecins rattachés.
 */
const DEPARTMENT_COLUMNS = `
  dp.id,
  dp.name,
  dp.description,
  dp.head_doctor_id,
  dp.created_at,
  CONCAT('Dr ', hu.first_name, ' ', hu.last_name) AS head_doctor_name,
  (SELECT COUNT(*) FROM doctors d WHERE d.department_id = dp.id) AS doctors_count
`;

const DEPARTMENT_JOINS = `
  FROM departments dp
  LEFT JOIN doctors hd ON hd.id = dp.head_doctor_id
  LEFT JOIN users hu   ON hu.id = hd.user_id
`;

/** Tri autorisé : liste blanche, aucune expression venue du client. */
const DEPARTMENT_SORTABLE: Readonly<Record<string, string>> = {
  name: 'dp.name',
  created_at: 'dp.created_at',
  doctors_count: 'doctors_count',
  head_doctor_name: 'head_doctor_name',
};

/** Liste des départements, avec recherche libre et tri validé en liste blanche. */
export async function findAll(params: {
  search?: string;
  sort?: string;
  order?: string;
}): Promise<DepartmentRow[]> {
  const fragments: string[] = [];
  const values: unknown[] = [];

  if (params.search !== undefined && params.search.length > 0) {
    const pattern = likePattern(params.search);
    fragments.push('(dp.name LIKE ? OR dp.description LIKE ?)');
    values.push(pattern, pattern);
  }

  const orderBy = buildOrderBy(params.sort, params.order, DEPARTMENT_SORTABLE, 'dp.name', 'asc');

  return query<DepartmentRow>(
    `SELECT ${DEPARTMENT_COLUMNS}
       ${DEPARTMENT_JOINS}
       ${whereClause(fragments)}
      ORDER BY ${orderBy}`,
    values,
  );
}

/** Récupère un département par son identifiant. */
export async function findById(id: number): Promise<DepartmentRow | null> {
  return queryOne<DepartmentRow>(
    `SELECT ${DEPARTMENT_COLUMNS}
       ${DEPARTMENT_JOINS}
      WHERE dp.id = ?`,
    [id],
  );
}

/**
 * Cherche l'identifiant d'un département portant ce nom.
 * La collation `utf8mb4_unicode_ci` rend la comparaison insensible à la casse.
 *
 * @param excludeId identifiant à ignorer (mise à jour du même département)
 */
export async function findIdByName(name: string, excludeId?: number): Promise<number | null> {
  const row = await queryOne<Row & { id: number }>(
    `SELECT id FROM departments WHERE name = ?${excludeId === undefined ? '' : ' AND id <> ?'}`,
    excludeId === undefined ? [name] : [name, excludeId],
  );
  return row?.id ?? null;
}

/** Vérifie l'existence d'un médecin (chef de département potentiel). */
export async function doctorExists(id: number): Promise<boolean> {
  const row = await queryOne<Row & { id: number }>('SELECT id FROM doctors WHERE id = ?', [id]);
  return row !== null;
}

/** Médecins rattachés à un département (nom complet + spécialité). */
export async function findDoctors(departmentId: number): Promise<DepartmentDoctorRow[]> {
  return query<DepartmentDoctorRow>(
    `SELECT d.id,
            CONCAT('Dr ', u.first_name, ' ', u.last_name) AS full_name,
            s.name AS specialty_name
       FROM doctors d
       JOIN users u       ON u.id = d.user_id
       JOIN specialties s ON s.id = d.specialty_id
      WHERE d.department_id = ?
      ORDER BY u.last_name ASC, u.first_name ASC`,
    [departmentId],
  );
}

/** Nombre de médecins rattachés au département. */
export async function countDoctors(id: number): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    'SELECT COUNT(*) AS total FROM doctors WHERE department_id = ?',
    [id],
  );
  return Number(row?.total ?? 0);
}

/** Nombre de rendez-vous rattachés au département. */
export async function countAppointments(id: number): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    'SELECT COUNT(*) AS total FROM appointments WHERE department_id = ?',
    [id],
  );
  return Number(row?.total ?? 0);
}

/** Nombre de gardes rattachées au département. */
export async function countShifts(id: number): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    'SELECT COUNT(*) AS total FROM shifts WHERE department_id = ?',
    [id],
  );
  return Number(row?.total ?? 0);
}

/** Crée un département et renvoie son identifiant. */
export async function create(input: {
  name: string;
  description: string | null;
  headDoctorId: number | null;
}): Promise<number> {
  return insert(
    'INSERT INTO departments (name, description, head_doctor_id) VALUES (?, ?, ?)',
    [input.name, input.description, input.headDoctorId],
  );
}

/** Champs modifiables d'un département (camelCase exposé au service). */
export interface DepartmentChanges {
  name?: string;
  description?: string;
  /** `null` retire explicitement le chef de département. */
  headDoctorId?: number | null;
}

const DEPARTMENT_UPDATABLE: readonly string[] = ['name', 'description', 'head_doctor_id'];

/** Traduit les champs camelCase en colonnes snake_case attendues par `SET`. */
function toColumnValues(changes: DepartmentChanges): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (changes.name !== undefined) values.name = changes.name;
  if (changes.description !== undefined) values.description = changes.description;
  // `null` est une valeur légitime : elle doit être écrite, pas ignorée.
  if (changes.headDoctorId !== undefined) values.head_doctor_id = changes.headDoctorId;
  return values;
}

/** Met à jour partiellement un département. */
export async function update(id: number, changes: DepartmentChanges): Promise<void> {
  const { sql, params } = buildSetClause(toColumnValues(changes), DEPARTMENT_UPDATABLE);
  await execute(`UPDATE departments SET ${sql} WHERE id = ?`, [...params, id]);
}

/** Supprime physiquement un département (appelant : service, après contrôle d'usage). */
export async function remove(id: number): Promise<void> {
  await execute('DELETE FROM departments WHERE id = ?', [id]);
}
