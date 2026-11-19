/**
 * Accès aux données du module patients.
 *
 * Toutes les requêtes SQL sont regroupées ici : les services ne contiennent
 * aucune chaîne SQL. Les valeurs sont systématiquement passées par des
 * marqueurs `?` ; seuls les fragments réellement dynamiques (tri, `SET`) sont
 * construits à partir de listes blanches de colonnes.
 */

import type { Row } from '../../config/db.js';
import { execute, executeWith, insert, query, queryOne, withTransaction } from '../../config/db.js';

/* -------------------------------------------------------------------------- */
/* Lignes SQL                                                                  */
/* -------------------------------------------------------------------------- */

/** Ligne complète d'un dossier patient. */
export interface PatientRecord extends Row {
  id: number;
  user_id: number | null;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  blood_group: string | null;
  allergies: string | null;
  medical_history: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  insurance_number: string | null;
  created_at: string;
  updated_at: string;
}

/** Filtres de la liste paginée (valeurs déjà validées par `patientQuerySchema`). */
export interface PatientFilters {
  search?: string | undefined;
  gender?: string | undefined;
  bloodGroup?: string | undefined;
}

/** Compte utilisateur avec rôles et permissions agrégés. */
export interface UserRecord extends Row {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  patient_id: number | null;
  doctor_id: number | null;
  roles: string | null;
  permissions: string | null;
  /** Libellé français du premier rôle, pour l'affichage direct côté front. */
  role_name: string | null;
}

/** Colonnes exposées d'un dossier patient, dans l'ordre des lectures. */
const PATIENT_COLUMNS = `
  id, user_id, first_name, last_name, birth_date, gender,
  address, city, postal_code, phone, email, blood_group,
  allergies, medical_history, emergency_contact_name, emergency_contact_phone,
  insurance_number, created_at, updated_at
`;

/**
 * Construit le `WHERE` commun à la liste et à son comptage.
 *
 * Le motif `LIKE` est déjà échappé par `likePattern` (appelé dans le service) :
 * un `%` saisi par l'utilisateur ne peut donc pas élargir la recherche.
 */
function buildFilters(filters: PatientFilters): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.search !== undefined && filters.search.length > 0) {
    const pattern = filters.search;
    // `ESCAPE '\\'` correspond, après analyse par MySQL, au caractère « \ »
    // utilisé par `likePattern` : les jokers saisis restent donc neutralisés.
    conditions.push(
      `(last_name LIKE ? ESCAPE '\\\\' OR first_name LIKE ? ESCAPE '\\\\'
        OR CONCAT(first_name, ' ', last_name) LIKE ? ESCAPE '\\\\'
        OR email LIKE ? ESCAPE '\\\\' OR phone LIKE ? ESCAPE '\\\\'
        OR insurance_number LIKE ? ESCAPE '\\\\')`,
    );
    params.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }
  if (filters.gender !== undefined) {
    conditions.push('gender = ?');
    params.push(filters.gender);
  }
  if (filters.bloodGroup !== undefined) {
    conditions.push('blood_group = ?');
    params.push(filters.bloodGroup);
  }

  return {
    sql: conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Liste paginée des patients.
 * @param searchPattern motif `LIKE` déjà échappé, ou `undefined`.
 */
export async function list(
  filters: PatientFilters,
  orderBy: string,
  limit: number,
  offset: number,
): Promise<PatientRecord[]> {
  const where = buildFilters(filters);
  const rows = await query<PatientRecord>(
    `SELECT ${PATIENT_COLUMNS}
     FROM patients
     ${where.sql}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...where.params, limit, offset],
  );
  return rows;
}

/**
 * Compte les patients correspondant aux mêmes filtres.
 * Un second `SELECT COUNT(*)` explicite est préféré à `SQL_CALC_FOUND_ROWS`,
 * déprécié en MySQL 8 et plus coûteux que deux requêtes distinctes.
 */
export async function count(filters: PatientFilters): Promise<number> {
  const where = buildFilters(filters);
  const row = await queryOne<Row & { total: number }>(
    `SELECT COUNT(*) AS total FROM patients ${where.sql}`,
    where.params,
  );
  return Number(row?.total ?? 0);
}

/** Récupère un dossier patient par son identifiant. */
export async function findById(id: number): Promise<PatientRecord | null> {
  return queryOne<PatientRecord>(
    `SELECT ${PATIENT_COLUMNS} FROM patients WHERE id = ?`,
    [id],
  );
}

/** Identifiant du dossier rattaché à un compte utilisateur. */
export async function findIdByUserId(userId: number): Promise<number | null> {
  const row = await queryOne<Row & { id: number }>(
    'SELECT id FROM patients WHERE user_id = ?',
    [userId],
  );
  return row?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/** Champs acceptés à l'insertion (noms de colonnes SQL). */
const INSERT_COLUMNS = [
  'user_id',
  'first_name',
  'last_name',
  'birth_date',
  'gender',
  'address',
  'city',
  'postal_code',
  'phone',
  'email',
  'blood_group',
  'allergies',
  'medical_history',
  'emergency_contact_name',
  'emergency_contact_phone',
  'insurance_number',
] as const;

/** Champs acceptés à la mise à jour (noms de colonnes SQL). */
export const UPDATABLE_COLUMNS = [
  'first_name',
  'last_name',
  'birth_date',
  'gender',
  'address',
  'city',
  'postal_code',
  'phone',
  'email',
  'blood_group',
  'allergies',
  'medical_history',
  'emergency_contact_name',
  'emergency_contact_phone',
  'insurance_number',
] as const;

/** Crée un dossier patient et renvoie son identifiant. */
export async function create(values: Record<string, unknown>): Promise<number> {
  const columns = INSERT_COLUMNS.filter((column) =>
    Object.prototype.hasOwnProperty.call(values, column),
  );
  const placeholders = columns.map(() => '?').join(', ');
  const params = columns.map((column) => values[column]);

  return insert(
    `INSERT INTO patients (${columns.join(', ')}) VALUES (${placeholders})`,
    params,
  );
}

/** Applique une mise à jour partielle à un dossier patient. */
export async function update(id: number, setClause: string, params: unknown[]): Promise<void> {
  await execute(`UPDATE patients SET ${setClause} WHERE id = ?`, [...params, id]);
}

/**
 * Supprime un dossier patient.
 * Le compte utilisateur éventuellement rattaché n'est pas supprimé : la clé
 * étrangère `patients.user_id` est en `ON DELETE SET NULL`, mais aucune
 * suppression de compte n'est déclenchée par cette requête.
 */
export async function remove(id: number): Promise<void> {
  await execute('DELETE FROM patients WHERE id = ?', [id]);
}

/** Rattache un dossier existant à un compte utilisateur. */
export async function linkUser(patientId: number, userId: number): Promise<void> {
  await execute('UPDATE patients SET user_id = ? WHERE id = ?', [userId, patientId]);
}

/* -------------------------------------------------------------------------- */
/* Vérifications métier                                                        */
/* -------------------------------------------------------------------------- */

/** Volumes de données rattachés à un dossier patient (blocage de suppression). */
export interface PatientVolumes extends Row {
  appointments: number;
  consultations: number;
  invoices: number;
  lab_requests: number;
}

/**
 * Compte en une seule requête les données qui interdisent la suppression
 * physique d'un dossier (l'historique médical doit être conservé).
 */
export async function countVolumes(patientId: number): Promise<{
  appointments: number;
  consultations: number;
  invoices: number;
  labRequests: number;
}> {
  const row = await queryOne<PatientVolumes>(
    `SELECT
       (SELECT COUNT(*) FROM appointments   WHERE patient_id = ?) AS appointments,
       (SELECT COUNT(*) FROM lab_requests   WHERE patient_id = ?) AS lab_requests,
       (SELECT COUNT(*) FROM invoices       WHERE patient_id = ?) AS invoices,
       (SELECT COUNT(*) FROM consultations c
          JOIN appointments a ON a.id = c.appointment_id
         WHERE a.patient_id = ?)                                   AS consultations`,
    [patientId, patientId, patientId, patientId],
  );

  return {
    appointments: Number(row?.appointments ?? 0),
    consultations: Number(row?.consultations ?? 0),
    invoices: Number(row?.invoices ?? 0),
    labRequests: Number(row?.lab_requests ?? 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Comptes utilisateurs rattachés                                              */
/* -------------------------------------------------------------------------- */

/** Identifiant d'un compte existant pour un email donné (insensible à la casse). */
export async function findUserIdByEmail(email: string): Promise<number | null> {
  const row = await queryOne<Row & { id: number }>(
    'SELECT id FROM users WHERE email = ?',
    [email.toLowerCase()],
  );
  return row?.id ?? null;
}

/** Identifiant du rôle PATIENT. */
export async function findPatientRoleId(): Promise<number | null> {
  const row = await queryOne<Row & { id: number }>(
    'SELECT id FROM roles WHERE code = ?',
    ['PATIENT'],
  );
  return row?.id ?? null;
}

/**
 * Crée un compte portail pour un dossier patient existant : l'utilisateur, son
 * rôle PATIENT et le rattachement du dossier sont écrits dans une transaction,
 * afin de ne jamais laisser de compte orphelin.
 */
export async function createPortalAccount(input: {
  patientId: number;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}): Promise<number> {
  return withTransaction(async (connection) => {
    const userResult = await executeWith(
      connection,
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, is_active)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [input.email, input.passwordHash, input.firstName, input.lastName, input.phone],
    );
    const userId = userResult.insertId;

    const role = await queryOne<Row & { id: number }>(
      'SELECT id FROM roles WHERE code = ?',
      ['PATIENT'],
    );
    if (!role) {
      throw new Error('Le rôle PATIENT est absent de la base : exécutez 003_seed.sql.');
    }

    await executeWith(
      connection,
      'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
      [userId, role.id],
    );
    await executeWith(
      connection,
      'UPDATE patients SET user_id = ? WHERE id = ?',
      [userId, input.patientId],
    );

    return userId;
  });
}

/** Met à jour le téléphone du compte utilisateur rattaché au dossier. */
export async function updateLinkedAccountPhone(userId: number, phone: string): Promise<void> {
  await execute('UPDATE users SET phone = ? WHERE id = ?', [phone, userId]);
}

/**
 * Compte utilisateur complet (rôles et permissions agrégés) pour la réponse
 * `POST /api/patients/:id/account`. La requête est la même que celle du module
 * d'authentification, afin que l'objet `User` renvoyé soit identique.
 */
export async function findUserWithRoles(userId: number): Promise<UserRecord | null> {
  return queryOne<UserRecord>(
    `SELECT
       u.id, u.email, u.first_name, u.last_name, u.phone, u.is_active,
       u.last_login_at, u.created_at,
       pat.id AS patient_id,
       doc.id AS doctor_id,
       GROUP_CONCAT(DISTINCT r.code ORDER BY r.code SEPARATOR ',')       AS roles,
       GROUP_CONCAT(DISTINCT perm.code ORDER BY perm.code SEPARATOR ',') AS permissions
     FROM users u
     LEFT JOIN user_roles ur       ON ur.user_id = u.id
     LEFT JOIN roles r             ON r.id = ur.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions perm    ON perm.id = rp.permission_id
     LEFT JOIN patients pat        ON pat.user_id = u.id
     LEFT JOIN doctors doc         ON doc.user_id = u.id
     WHERE u.id = ?
     GROUP BY u.id, u.email, u.first_name, u.last_name, u.phone, u.is_active,
              u.last_login_at, u.created_at, pat.id, doc.id`,
    [userId],
  );
}

/* -------------------------------------------------------------------------- */
/* Rendez-vous du patient                                                      */
/* -------------------------------------------------------------------------- */

/** Ligne de `v_appointment_details` (colonnes consommées par l'API). */
export interface PatientAppointmentRecord extends Row {
  id: number;
  patient_id: number;
  patient_name: string;
  doctor_id: number;
  doctor_name: string;
  department_id: number | null;
  department_name: string | null;
  scheduled_at: string;
  duration: number;
  status: string;
  type: string;
  reason: string | null;
  notes: string | null;
  created_by: number | null;
  created_at: string;
}

/** Rendez-vous d'un patient, du plus récent au plus ancien. */
export async function listAppointments(
  patientId: number,
  limit: number,
  offset: number,
): Promise<PatientAppointmentRecord[]> {
  return query<PatientAppointmentRecord>(
    `SELECT
       id, patient_id, patient_name, doctor_id, doctor_name,
       department_id, department_name, scheduled_at, duration, status, type,
       reason, notes, created_by, created_at
     FROM v_appointment_details
     WHERE patient_id = ?
     ORDER BY scheduled_at DESC
     LIMIT ? OFFSET ?`,
    [patientId, limit, offset],
  );
}

/** Compte les rendez-vous d'un patient (pagination). */
export async function countAppointments(patientId: number): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    'SELECT COUNT(*) AS total FROM appointments WHERE patient_id = ?',
    [patientId],
  );
  return Number(row?.total ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Historique du patient                                                       */
/* -------------------------------------------------------------------------- */

/** Ligne de `v_consultation_details`. */
export interface PatientConsultationRecord extends Row {
  id: number;
  appointment_id: number;
  doctor_id: number;
  doctor_name: string;
  patient_id: number;
  patient_name: string;
  diagnosis: string;
  notes: string | null;
  follow_up_at: string | null;
  created_at: string;
}

/** Ligne de `v_prescription_details`. */
export interface PatientPrescriptionRecord extends Row {
  id: number;
  consultation_id: number;
  doctor_id: number;
  doctor_name: string;
  issued_at: string;
  status: string;
}

/** Ligne de `prescription_items` jointe au catalogue des médicaments. */
export interface PrescriptionItemRecord extends Row {
  id: number;
  prescription_id: number;
  medication_id: number;
  medication_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
  quantity: number;
}

/** Ligne de `v_invoice_details`. */
export interface PatientInvoiceRecord extends Row {
  id: number;
  number: string;
  patient_id: number;
  patient_name: string;
  consultation_id: number | null;
  total_amount: string;
  paid_amount: string;
  vat_rate: string;
  status: string;
  issued_at: string;
  due_date: string;
  created_at: string;
}

/** Ligne de `v_patient_history` (une ligne par événement). */
export interface HistoryEntryRecord extends Row {
  patient_id: number;
  entry_type: string;
  entry_id: number;
  event_date: string;
  title: string;
  description: string | null;
}

/** Consultations du patient (vue `v_consultation_details`). */
export async function listConsultations(patientId: number): Promise<PatientConsultationRecord[]> {
  return query<PatientConsultationRecord>(
    `SELECT
       id, appointment_id, doctor_id, doctor_name, patient_id, patient_name,
       diagnosis, notes, follow_up_at, created_at
     FROM v_consultation_details
     WHERE patient_id = ?
     ORDER BY created_at DESC`,
    [patientId],
  );
}

/** Ordonnances du patient (vue `v_prescription_details`). */
export async function listPrescriptions(patientId: number): Promise<PatientPrescriptionRecord[]> {
  return query<PatientPrescriptionRecord>(
    `SELECT id, consultation_id, doctor_id, doctor_name, issued_at, status
     FROM v_prescription_details
     WHERE patient_id = ?
     ORDER BY issued_at DESC`,
    [patientId],
  );
}

/** Lignes des ordonnances d'un patient, médicament dénommé. */
export async function listPrescriptionItems(patientId: number): Promise<PrescriptionItemRecord[]> {
  return query<PrescriptionItemRecord>(
    `SELECT
       pi.id, pi.prescription_id, pi.medication_id,
       m.name AS medication_name,
       pi.dosage, pi.frequency, pi.duration, pi.instructions, pi.quantity
     FROM prescription_items pi
     JOIN medications m         ON m.id = pi.medication_id
     JOIN prescriptions pr      ON pr.id = pi.prescription_id
     JOIN consultations c       ON c.id = pr.consultation_id
     JOIN appointments a        ON a.id = c.appointment_id
     WHERE a.patient_id = ?
     ORDER BY pi.prescription_id, pi.id`,
    [patientId],
  );
}

/** Factures du patient (vue `v_invoice_details`). */
export async function listInvoices(patientId: number): Promise<PatientInvoiceRecord[]> {
  return query<PatientInvoiceRecord>(
    `SELECT
       id, number, patient_id, patient_name, consultation_id,
       total_amount, paid_amount, vat_rate, status, issued_at, due_date, created_at
     FROM v_invoice_details
     WHERE patient_id = ?
     ORDER BY issued_at DESC`,
    [patientId],
  );
}

/**
 * Chronologie complète du dossier, dérivée de la vue `v_patient_history`.
 * La vue agrège rendez-vous, consultations, ordonnances, factures et analyses.
 */
export async function listHistoryEntries(patientId: number): Promise<HistoryEntryRecord[]> {
  return query<HistoryEntryRecord>(
    `SELECT patient_id, entry_type, entry_id, event_date, title, description
     FROM v_patient_history
     WHERE patient_id = ?
     ORDER BY event_date DESC`,
    [patientId],
  );
}
