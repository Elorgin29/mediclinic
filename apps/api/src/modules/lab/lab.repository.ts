/**
 * Accès aux données du module laboratoire (catalogue d'analyses et demandes).
 *
 * Toutes les requêtes SQL du module vivent ici. Les jointures patient/médecin/
 * analyse sont faites à la lecture afin que l'API renvoie directement
 * `patient_name`, `doctor_name` et `lab_test_name`.
 */

import type { Row } from '../../config/db.js';
import { execute, insert, query, queryOne } from '../../config/db.js';

/* -------------------------------------------------------------------------- */
/* Catalogue des analyses                                                      */
/* -------------------------------------------------------------------------- */

/** Ligne du catalogue `lab_tests`. */
export interface LabTestRecord extends Row {
  id: number;
  name: string;
  category: string;
  price: string;
  turnaround_hours: number;
}

/** Colonnes du catalogue exposées par l'API. */
const LAB_TEST_COLUMNS = 'id, name, category, price, turnaround_hours';

/** Catalogue complet des analyses, trié par nom. */
export async function listTests(): Promise<LabTestRecord[]> {
  return query<LabTestRecord>(
    `SELECT ${LAB_TEST_COLUMNS} FROM lab_tests ORDER BY name ASC`,
  );
}

/** Récupère une analyse du catalogue par son identifiant. */
export async function findTestById(id: number): Promise<LabTestRecord | null> {
  return queryOne<LabTestRecord>(
    `SELECT ${LAB_TEST_COLUMNS} FROM lab_tests WHERE id = ?`,
    [id],
  );
}

/**
 * Recherche une analyse par son nom exact (insensible à la casse).
 * Le classement `utf8mb4_unicode_ci` rend la comparaison insensible à la casse.
 */
export async function findTestByName(name: string): Promise<LabTestRecord | null> {
  return queryOne<LabTestRecord>(
    `SELECT ${LAB_TEST_COLUMNS} FROM lab_tests WHERE name = ?`,
    [name],
  );
}

/** Crée une analyse du catalogue et renvoie son identifiant. */
export async function createTest(values: {
  name: string;
  category: string;
  price: number;
  turnaroundHours?: number | undefined;
}): Promise<number> {
  return insert(
    `INSERT INTO lab_tests (name, category, price, turnaround_hours)
     VALUES (?, ?, ?, COALESCE(?, 24))`,
    [
      values.name,
      values.category,
      values.price,
      values.turnaroundHours === undefined ? null : values.turnaroundHours,
    ],
  );
}

/** Met à jour partiellement une analyse du catalogue. */
export async function updateTest(
  id: number,
  setClause: string,
  params: unknown[],
): Promise<void> {
  await execute(`UPDATE lab_tests SET ${setClause} WHERE id = ?`, [...params, id]);
}

/** Colonnes modifiables du catalogue (liste blanche pour `buildSetClause`). */
export const TEST_UPDATABLE_COLUMNS = [
  'name',
  'category',
  'price',
  'turnaround_hours',
] as const;

/* -------------------------------------------------------------------------- */
/* Demandes d'analyse                                                          */
/* -------------------------------------------------------------------------- */

/** Ligne enrichie d'une demande d'analyse. */
export interface LabRequestRecord extends Row {
  id: number;
  patient_id: number;
  patient_name: string;
  doctor_id: number;
  doctor_name: string;
  lab_test_id: number;
  lab_test_name: string;
  status: string;
  result_text: string | null;
  notes: string | null;
  requested_at: string;
  completed_at: string | null;
}

/** Filtres de la liste paginée des demandes. */
export interface LabRequestFilters {
  /** Motif `LIKE` déjà échappé (`likePattern`), ou `undefined`. */
  search?: string | undefined;
  status?: string | undefined;
  patientId?: number | undefined;
  doctorId?: number | undefined;
}

/**
 * Colonnes enrichies communes à toutes les lectures de demande.
 * Les alias `patient_name` / `doctor_name` / `lab_test_name` sont produits par
 * jointure : le front n'a ainsi aucune seconde requête à faire.
 */
const LAB_REQUEST_COLUMNS = `
  lr.id,
  lr.patient_id,
  CONCAT(p.first_name, ' ', p.last_name)             AS patient_name,
  lr.doctor_id,
  CONCAT('Dr ', du.first_name, ' ', du.last_name)    AS doctor_name,
  lr.lab_test_id,
  lt.name                                            AS lab_test_name,
  lr.status,
  lr.result_text,
  lr.notes,
  lr.requested_at,
  lr.completed_at
`;

const LAB_REQUEST_JOINS = `
  FROM lab_requests lr
  JOIN patients p   ON p.id = lr.patient_id
  JOIN doctors d    ON d.id = lr.doctor_id
  JOIN users du     ON du.id = d.user_id
  JOIN lab_tests lt ON lt.id = lr.lab_test_id
`;

/** Construit le `WHERE` commun à la liste et à son comptage. */
function buildFilters(filters: LabRequestFilters): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.search !== undefined && filters.search.length > 0) {
    // Le motif couvre à la fois le nom du patient et celui de l'analyse.
    conditions.push(
      `(CONCAT(p.first_name, ' ', p.last_name) LIKE ? ESCAPE '\\\\'
        OR p.last_name LIKE ? ESCAPE '\\\\'
        OR lt.name LIKE ? ESCAPE '\\\\')`,
    );
    params.push(filters.search, filters.search, filters.search);
  }
  if (filters.status !== undefined) {
    conditions.push('lr.status = ?');
    params.push(filters.status);
  }
  if (filters.patientId !== undefined) {
    conditions.push('lr.patient_id = ?');
    params.push(filters.patientId);
  }
  if (filters.doctorId !== undefined) {
    conditions.push('lr.doctor_id = ?');
    params.push(filters.doctorId);
  }

  return {
    sql: conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

/** Liste paginée des demandes d'analyse. */
export async function listRequests(
  filters: LabRequestFilters,
  orderBy: string,
  limit: number,
  offset: number,
): Promise<LabRequestRecord[]> {
  const where = buildFilters(filters);
  return query<LabRequestRecord>(
    `SELECT ${LAB_REQUEST_COLUMNS} ${LAB_REQUEST_JOINS} ${where.sql}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...where.params, limit, offset],
  );
}

/** Compte les demandes correspondant aux mêmes filtres. */
export async function countRequests(filters: LabRequestFilters): Promise<number> {
  const where = buildFilters(filters);
  const row = await queryOne<Row & { total: number }>(
    `SELECT COUNT(*) AS total ${LAB_REQUEST_JOINS} ${where.sql}`,
    where.params,
  );
  return Number(row?.total ?? 0);
}

/** Récupère une demande enrichie par son identifiant. */
export async function findRequestById(id: number): Promise<LabRequestRecord | null> {
  return queryOne<LabRequestRecord>(
    `SELECT ${LAB_REQUEST_COLUMNS} ${LAB_REQUEST_JOINS} WHERE lr.id = ?`,
    [id],
  );
}

/** Demandes d'un patient, de la plus récente à la plus ancienne. */
export async function listRequestsByPatient(patientId: number): Promise<LabRequestRecord[]> {
  return query<LabRequestRecord>(
    `SELECT ${LAB_REQUEST_COLUMNS} ${LAB_REQUEST_JOINS}
     WHERE lr.patient_id = ?
     ORDER BY lr.requested_at DESC`,
    [patientId],
  );
}

/** Crée une demande d'analyse et renvoie son identifiant. */
export async function createRequest(values: {
  patientId: number;
  doctorId: number;
  labTestId: number;
  notes?: string | undefined;
}): Promise<number> {
  return insert(
    `INSERT INTO lab_requests (patient_id, doctor_id, lab_test_id, notes, status)
     VALUES (?, ?, ?, ?, 'PENDING')`,
    [values.patientId, values.doctorId, values.labTestId, values.notes ?? null],
  );
}

/**
 * Met à jour une demande.
 * `completed` force `completed_at = NOW()` lorsque la demande passe à
 * `COMPLETED` : la date de résultat est ainsi toujours cohérente avec le statut.
 */
export async function updateRequest(
  id: number,
  setClause: string,
  params: unknown[],
  completed: boolean,
): Promise<void> {
  const completion = completed ? ', completed_at = NOW()' : '';
  await execute(`UPDATE lab_requests SET ${setClause}${completion} WHERE id = ?`, [
    ...params,
    id,
  ]);
}

/**
 * Annule la demande lorsqu'un résultat existe déjà (le résultat est une donnée
 * médicale qu'on ne supprime pas), sinon la supprime réellement.
 * @returns `true` si la demande a été annulée, `false` si elle a été supprimée.
 */
export async function cancelOrRemoveRequest(id: number): Promise<boolean> {
  const hasResult = await queryOne<Row & { id: number }>(
    `SELECT id FROM lab_requests
      WHERE id = ? AND result_text IS NOT NULL AND result_text <> ''
      LIMIT 1`,
    [id],
  );

  if (hasResult) {
    await execute(`UPDATE lab_requests SET status = 'CANCELLED' WHERE id = ?`, [id]);
    return true;
  }

  await execute('DELETE FROM lab_requests WHERE id = ?', [id]);
  return false;
}

/* -------------------------------------------------------------------------- */
/* Vérifications d'existence                                                   */
/* -------------------------------------------------------------------------- */

/** Un dossier patient existe-t-il ? */
export async function patientExists(patientId: number): Promise<boolean> {
  const row = await queryOne<Row & { id: number }>(
    'SELECT id FROM patients WHERE id = ?',
    [patientId],
  );
  return row !== null;
}

/** Un profil médecin existe-t-il ? */
export async function doctorExists(doctorId: number): Promise<boolean> {
  const row = await queryOne<Row & { id: number }>(
    'SELECT id FROM doctors WHERE id = ?',
    [doctorId],
  );
  return row !== null;
}
