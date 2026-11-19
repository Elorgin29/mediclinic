/**
 * Accès aux données des médecins.
 *
 * Toutes les lectures s'appuient sur la vue `v_doctor_directory` : elle joint
 * déjà `doctors` → `users` → `specialties` → `departments` et n'expose jamais
 * `users.password_hash`. La vue est en **lecture seule** : les écritures
 * passent par les tables `users`, `user_roles` et `doctors`.
 */

import type { PoolConnection } from 'mysql2/promise';

import type { Row } from '../../config/db.js';
import { execute, executeWith, query, queryWith, queryOne, limitClause, withTransaction } from '../../config/db.js';
import { buildSetClause } from '../../utils/http.js';
import { buildOrderBy, likePattern, whereClause } from '../../utils/pagination.js';

/** Ligne de la vue `v_doctor_directory`. */
export interface DoctorRow extends Row {
  doctor_id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  specialty_id: number;
  specialty_name: string;
  department_id: number | null;
  department_name: string | null;
  license_number: string;
  consultation_fee: string;
  bio: string | null;
  is_accepting_patients: number;
  created_at: string;
}

/** Créneau occupé par un rendez-vous (calcul des disponibilités). */
export interface BusySlotRow extends Row {
  scheduled_at: string;
  duration: number;
}

/** Colonnes communes à toutes les lectures de l'annuaire. */
const DOCTOR_COLUMNS = `
  v.doctor_id,
  v.user_id,
  v.first_name,
  v.last_name,
  v.email,
  v.phone,
  v.specialty_id,
  v.specialty_name,
  v.department_id,
  v.department_name,
  v.license_number,
  v.consultation_fee,
  v.bio,
  v.is_accepting_patients,
  v.created_at
`;

const DOCTOR_SOURCE = 'FROM v_doctor_directory v';

/** Tri autorisé : liste blanche, aucune expression venue du client. */
const DOCTOR_SORTABLE: Readonly<Record<string, string>> = {
  last_name: 'v.last_name',
  first_name: 'v.first_name',
  created_at: 'v.created_at',
  consultation_fee: 'v.consultation_fee',
  specialty: 'v.specialty_name',
  specialty_name: 'v.specialty_name',
  department: 'v.department_name',
  department_name: 'v.department_name',
};

/** Filtres de la liste des médecins (identifiants déjà validés par Zod). */
export interface DoctorFilters {
  specialtyId?: number;
  departmentId?: number;
  accepting?: boolean;
  search?: string;
}

/** Construit la clause WHERE et ses paramètres à partir des filtres. */
function buildFilter(filters: DoctorFilters): { sql: string; params: unknown[] } {
  const fragments: string[] = [];
  const params: unknown[] = [];

  if (filters.specialtyId !== undefined) {
    fragments.push('v.specialty_id = ?');
    params.push(filters.specialtyId);
  }
  if (filters.departmentId !== undefined) {
    fragments.push('v.department_id = ?');
    params.push(filters.departmentId);
  }
  if (filters.accepting !== undefined) {
    fragments.push('v.is_accepting_patients = ?');
    params.push(filters.accepting ? 1 : 0);
  }
  if (filters.search !== undefined && filters.search.length > 0) {
    const pattern = likePattern(filters.search);
    fragments.push(
      '(v.first_name LIKE ? OR v.last_name LIKE ? OR v.email LIKE ? OR v.license_number LIKE ?)',
    );
    params.push(pattern, pattern, pattern, pattern);
  }

  return { sql: whereClause(fragments), params };
}

/** Liste paginée des médecins, filtrée et triée en liste blanche. */
export async function findAll(params: {
  filters: DoctorFilters;
  sort?: string;
  order?: string;
  limit: number;
  offset: number;
}): Promise<DoctorRow[]> {
  const filter = buildFilter(params.filters);
  const limit = limitClause(params.limit, params.offset);
  const orderBy = buildOrderBy(params.sort, params.order, DOCTOR_SORTABLE, 'v.last_name', 'asc');

  return query<DoctorRow>(
    `SELECT ${DOCTOR_COLUMNS}
       ${DOCTOR_SOURCE}
       ${filter.sql}
      ORDER BY ${orderBy}, v.first_name ASC
      ${limit.sql}`,
    [...filter.params, ...limit.params],
  );
}

/** Nombre total de médecins correspondant aux mêmes filtres. */
export async function count(filters: DoctorFilters): Promise<number> {
  const filter = buildFilter(filters);
  const row = await queryOne<Row & { total: number }>(
    `SELECT COUNT(*) AS total ${DOCTOR_SOURCE} ${filter.sql}`,
    filter.params,
  );
  return Number(row?.total ?? 0);
}

/** Annuaire public : médecins actifs acceptant de nouveaux patients. */
export async function findPublicDirectory(params: {
  specialtyId?: number;
  search?: string;
}): Promise<DoctorRow[]> {
  const filter = buildFilter({
    specialtyId: params.specialtyId,
    accepting: true,
    search: params.search,
  });

  return query<DoctorRow>(
    `SELECT ${DOCTOR_COLUMNS}
       ${DOCTOR_SOURCE}
       ${filter.sql}
      ORDER BY v.last_name ASC, v.first_name ASC`,
    filter.params,
  );
}

/** Récupère un médecin par son identifiant. */
export async function findById(id: number): Promise<DoctorRow | null> {
  return queryOne<DoctorRow>(
    `SELECT ${DOCTOR_COLUMNS}
       ${DOCTOR_SOURCE}
      WHERE v.doctor_id = ?`,
    [id],
  );
}

/** Nombre de rendez-vous à venir (hors annulés et absences). */
export async function countUpcomingAppointments(doctorId: number): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    `SELECT COUNT(*) AS total
       FROM appointments
      WHERE doctor_id = ?
        AND scheduled_at >= NOW()
        AND status NOT IN ('CANCELLED', 'NO_SHOW')`,
    [doctorId],
  );
  return Number(row?.total ?? 0);
}

/** Nombre de consultations réalisées par le médecin. */
export async function countConsultations(doctorId: number): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    'SELECT COUNT(*) AS total FROM consultations WHERE doctor_id = ?',
    [doctorId],
  );
  return Number(row?.total ?? 0);
}

/** Nombre de rendez-vous rattachés au médecin (contrôle avant suppression). */
export async function countAppointments(doctorId: number): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    'SELECT COUNT(*) AS total FROM appointments WHERE doctor_id = ?',
    [doctorId],
  );
  return Number(row?.total ?? 0);
}

/**
 * Créneaux déjà occupés par le médecin sur une journée.
 * Les rendez-vous annulés ou non honorés ne bloquent pas de créneau.
 */
export async function findBusySlots(
  doctorId: number,
  from: string,
  to: string,
): Promise<BusySlotRow[]> {
  return query<BusySlotRow>(
    `SELECT a.scheduled_at, a.duration
       FROM appointments a
      WHERE a.doctor_id = ?
        AND a.status NOT IN ('CANCELLED', 'NO_SHOW')
        AND a.scheduled_at < ?
        AND DATE_ADD(a.scheduled_at, INTERVAL a.duration MINUTE) > ?`,
    [doctorId, to, from],
  );
}

/* -------------------------------------------------------------------------- */
/* Contrôles d'unicité et de références                                        */
/* -------------------------------------------------------------------------- */

/** Identifiant du profil médecin lié à un compte utilisateur, s'il existe. */
export async function findIdByUserId(userId: number): Promise<number | null> {
  const row = await queryOne<Row & { id: number }>('SELECT id FROM doctors WHERE user_id = ?', [
    userId,
  ]);
  return row?.id ?? null;
}

/**
 * Identifiant du médecin portant ce numéro d'ordre.
 *
 * @param excludeId identifiant à ignorer (mise à jour du même médecin)
 */
export async function findIdByLicenseNumber(
  licenseNumber: string,
  excludeId?: number,
): Promise<number | null> {
  const row = await queryOne<Row & { id: number }>(
    `SELECT id FROM doctors WHERE license_number = ?${excludeId === undefined ? '' : ' AND id <> ?'}`,
    excludeId === undefined ? [licenseNumber] : [licenseNumber, excludeId],
  );
  return row?.id ?? null;
}

/** Compte utilisateur minimal (existence et état). */
export async function findUserAccount(
  userId: number,
): Promise<{ id: number; email: string; is_active: number } | null> {
  const row = await queryOne<Row & { id: number; email: string; is_active: number }>(
    'SELECT id, email, is_active FROM users WHERE id = ?',
    [userId],
  );
  return row === null ? null : { id: row.id, email: row.email, is_active: row.is_active };
}

/** Identifiant d'un compte utilisateur à partir de son email. */
export async function findUserIdByEmail(email: string): Promise<number | null> {
  const row = await queryOne<Row & { id: number }>('SELECT id FROM users WHERE email = ?', [email]);
  return row?.id ?? null;
}

/** Vérifie l'existence d'une spécialité. */
export async function specialtyExists(id: number): Promise<boolean> {
  const row = await queryOne<Row & { id: number }>('SELECT id FROM specialties WHERE id = ?', [id]);
  return row !== null;
}

/** Vérifie l'existence d'un département. */
export async function departmentExists(id: number): Promise<boolean> {
  const row = await queryOne<Row & { id: number }>('SELECT id FROM departments WHERE id = ?', [id]);
  return row !== null;
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/** Valeurs d'un profil médecin, communes aux deux voies de création. */
export interface DoctorProfileValues {
  specialtyId: number;
  departmentId: number | null;
  licenseNumber: string;
  consultationFee: number;
  bio: string | null;
  isAcceptingPatients: boolean;
}

/** Compte utilisateur à créer en même temps que le profil médecin. */
export interface DoctorAccountValues {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

/**
 * Ajoute le rôle DOCTOR au compte s'il ne le porte pas déjà.
 * L'exécution partage la connexion de la transaction : un échec annule aussi la
 * création du profil, ce qui évite un médecin sans rôle applicatif.
 */
async function ensureDoctorRole(connection: PoolConnection, userId: number): Promise<void> {
  const roles = await queryWith<Row & { id: number }>(connection, 'SELECT id FROM roles WHERE code = ?', [
    'DOCTOR',
  ]);
  const role = roles[0];
  if (!role) {
    throw new Error('Le rôle DOCTOR est absent de la base : exécutez 003_seed.sql.');
  }

  const existing = await queryWith<Row>(
    connection,
    'SELECT user_id FROM user_roles WHERE user_id = ? AND role_id = ?',
    [userId, role.id],
  );
  if (existing.length === 0) {
    await executeWith(connection, 'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      userId,
      role.id,
    ]);
  }
}

/** Insère le profil médecin d'un compte existant et garantit le rôle DOCTOR. */
export async function createProfile(
  userId: number,
  values: DoctorProfileValues,
): Promise<number> {
  return withTransaction(async (connection) => {
    const result = await executeWith(
      connection,
      `INSERT INTO doctors
         (user_id, specialty_id, department_id, license_number, consultation_fee, bio,
          is_accepting_patients)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        values.specialtyId,
        values.departmentId,
        values.licenseNumber,
        values.consultationFee,
        values.bio,
        values.isAcceptingPatients,
      ],
    );

    await ensureDoctorRole(connection, userId);
    return result.insertId;
  });
}

/**
 * Crée le compte utilisateur puis le profil médecin dans une même transaction :
 * si l'insertion du profil échoue, le compte n'est pas créé.
 */
export async function createAccountWithProfile(
  account: DoctorAccountValues,
  values: DoctorProfileValues,
): Promise<{ userId: number; doctorId: number }> {
  return withTransaction(async (connection) => {
    const userResult = await executeWith(
      connection,
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, is_active)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [account.email, account.passwordHash, account.firstName, account.lastName, account.phone],
    );
    const userId = userResult.insertId;

    const doctorResult = await executeWith(
      connection,
      `INSERT INTO doctors
         (user_id, specialty_id, department_id, license_number, consultation_fee, bio,
          is_accepting_patients)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        values.specialtyId,
        values.departmentId,
        values.licenseNumber,
        values.consultationFee,
        values.bio,
        values.isAcceptingPatients,
      ],
    );

    await ensureDoctorRole(connection, userId);
    return { userId, doctorId: doctorResult.insertId };
  });
}

/** Champs modifiables d'un profil médecin (camelCase exposé au service). */
export interface DoctorChanges {
  specialtyId?: number;
  /** `null` détache le médecin de son département. */
  departmentId?: number | null;
  licenseNumber?: string;
  consultationFee?: number;
  bio?: string;
  isAcceptingPatients?: boolean;
}

const DOCTOR_UPDATABLE: readonly string[] = [
  'specialty_id',
  'department_id',
  'license_number',
  'consultation_fee',
  'bio',
  'is_accepting_patients',
];

/** Traduit les champs camelCase en colonnes snake_case attendues par `SET`. */
function toColumnValues(changes: DoctorChanges): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (changes.specialtyId !== undefined) values.specialty_id = changes.specialtyId;
  if (changes.departmentId !== undefined) values.department_id = changes.departmentId;
  if (changes.licenseNumber !== undefined) values.license_number = changes.licenseNumber;
  if (changes.consultationFee !== undefined) values.consultation_fee = changes.consultationFee;
  if (changes.bio !== undefined) values.bio = changes.bio;
  if (changes.isAcceptingPatients !== undefined) {
    values.is_accepting_patients = changes.isAcceptingPatients;
  }
  return values;
}

/**
 * Met à jour partiellement un profil médecin.
 * Le compte utilisateur n'est jamais modifié ici : le profil est la seule
 * ressource de ce module.
 */
export async function update(id: number, changes: DoctorChanges): Promise<void> {
  const { sql, params } = buildSetClause(toColumnValues(changes), DOCTOR_UPDATABLE);
  await execute(`UPDATE doctors SET ${sql} WHERE id = ?`, [...params, id]);
}

/**
 * Supprime le profil médecin. Le compte utilisateur est conservé : il porte
 * l'identité, l'historique de connexion et les autres rôles éventuels.
 */
export async function remove(id: number): Promise<void> {
  await execute('DELETE FROM doctors WHERE id = ?', [id]);
}
