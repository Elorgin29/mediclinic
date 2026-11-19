/**
 * Accès aux données des spécialités médicales.
 *
 * Toutes les requêtes sont préparées (`?`) et regroupées ici : ni le service ni
 * le contrôleur ne construisent de SQL. Les compteurs sont calculés par des
 * sous-requêtes plutôt que par des jointures agrégées : un double LEFT JOIN
 * multiplierait les lignes entre médecins et rendez-vous.
 */

import type { Row } from '../../config/db.js';
import { execute, insert, query, queryOne } from '../../config/db.js';
import { buildSetClause } from '../../utils/http.js';
import { buildOrderBy, likePattern, whereClause } from '../../utils/pagination.js';

/** Ligne de spécialité enrichie des compteurs d'usage. */
export interface SpecialtyRow extends Row {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  doctors_count: number;
  appointments_count: number;
}

/**
 * Colonnes communes à toutes les lectures : la spécialité et ses deux
 * compteurs. Les rendez-vous sont comptés à travers les médecins de la
 * spécialité (il n'existe pas de lien direct rendez-vous → spécialité).
 */
const SPECIALTY_COLUMNS = `
  s.id,
  s.name,
  s.description,
  s.created_at,
  (SELECT COUNT(*) FROM doctors d WHERE d.specialty_id = s.id) AS doctors_count,
  (SELECT COUNT(*) FROM appointments a
     JOIN doctors rd ON rd.id = a.doctor_id
    WHERE rd.specialty_id = s.id) AS appointments_count
`;

/** Tri autorisé : liste blanche, aucune expression venue du client. */
const SPECIALTY_SORTABLE: Readonly<Record<string, string>> = {
  name: 's.name',
  created_at: 's.created_at',
  doctors_count: 'doctors_count',
  appointments_count: 'appointments_count',
};

/** Liste des spécialités, avec recherche libre et tri validé en liste blanche. */
export async function findAll(params: {
  search?: string;
  sort?: string;
  order?: string;
}): Promise<SpecialtyRow[]> {
  const fragments: string[] = [];
  const values: unknown[] = [];

  if (params.search !== undefined && params.search.length > 0) {
    const pattern = likePattern(params.search);
    fragments.push('(s.name LIKE ? OR s.description LIKE ?)');
    values.push(pattern, pattern);
  }

  const orderBy = buildOrderBy(params.sort, params.order, SPECIALTY_SORTABLE, 's.name', 'asc');

  return query<SpecialtyRow>(
    `SELECT ${SPECIALTY_COLUMNS}
       FROM specialties s
       ${whereClause(fragments)}
      ORDER BY ${orderBy}`,
    values,
  );
}

/** Récupère une spécialité par son identifiant. */
export async function findById(id: number): Promise<SpecialtyRow | null> {
  return queryOne<SpecialtyRow>(
    `SELECT ${SPECIALTY_COLUMNS}
       FROM specialties s
      WHERE s.id = ?`,
    [id],
  );
}

/**
 * Cherche l'identifiant d'une spécialité portant ce nom.
 * La collation `utf8mb4_unicode_ci` rend la comparaison insensible à la casse
 * et aux accents : « Cardiologie » et « cardiologie » sont donc en conflit.
 *
 * @param excludeId identifiant à ignorer (mise à jour de la même spécialité)
 */
export async function findIdByName(name: string, excludeId?: number): Promise<number | null> {
  const row = await queryOne<Row & { id: number }>(
    `SELECT id FROM specialties WHERE name = ?${excludeId === undefined ? '' : ' AND id <> ?'}`,
    excludeId === undefined ? [name] : [name, excludeId],
  );
  return row?.id ?? null;
}

/** Nombre de médecins rattachés à une spécialité. */
export async function countDoctors(id: number): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    'SELECT COUNT(*) AS total FROM doctors WHERE specialty_id = ?',
    [id],
  );
  return Number(row?.total ?? 0);
}

/** Crée une spécialité et renvoie son identifiant. */
export async function create(input: { name: string; description: string | null }): Promise<number> {
  return insert('INSERT INTO specialties (name, description) VALUES (?, ?)', [
    input.name,
    input.description,
  ]);
}

/** Champs modifiables d'une spécialité (camelCase exposé au service). */
export interface SpecialtyChanges {
  name?: string;
  description?: string;
}

const SPECIALTY_UPDATABLE: readonly string[] = ['name', 'description'];

/** Traduit les champs camelCase en colonnes snake_case attendues par `SET`. */
function toColumnValues(changes: SpecialtyChanges): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (changes.name !== undefined) values.name = changes.name;
  if (changes.description !== undefined) values.description = changes.description;
  return values;
}

/** Met à jour partiellement une spécialité. */
export async function update(id: number, changes: SpecialtyChanges): Promise<void> {
  const { sql, params } = buildSetClause(toColumnValues(changes), SPECIALTY_UPDATABLE);
  await execute(`UPDATE specialties SET ${sql} WHERE id = ?`, [...params, id]);
}

/** Supprime physiquement une spécialité (appelant : service, après contrôle d'usage). */
export async function remove(id: number): Promise<void> {
  await execute('DELETE FROM specialties WHERE id = ?', [id]);
}
