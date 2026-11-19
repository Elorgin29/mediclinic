/**
 * Accès aux données du module « rendez-vous ».
 *
 * Toutes les requêtes préparées (`?`) sont regroupées ici : le service ne
 * contient aucune chaîne SQL. Les lectures s'appuient sur la vue
 * `v_appointment_details` (jointures patient / médecin / spécialité /
 * département déjà réalisées) ; seule `created_by`, absente de la vue, est
 * récupérée par jointure sur la table `appointments`.
 *
 * Les fonctions acceptent une connexion de transaction facultative : le
 * service est ainsi seul maître des frontières transactionnelles.
 */

import type { AppointmentStatus, AppointmentType } from '@mediclinic/shared';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';

import type { Row } from '../../config/db.js';
import { execute, executeWith, query, queryWith } from '../../config/db.js';
import { buildSetClause } from '../../utils/http.js';
import { buildOrderBy, likePattern, whereClause, type Pagination } from '../../utils/pagination.js';

/* -------------------------------------------------------------------------- */
/* Lignes                                                                     */
/* -------------------------------------------------------------------------- */

/** Ligne de la vue `v_appointment_details` enrichie de `created_by`. */
export interface AppointmentRow extends Row {
  id: number;
  patient_id: number;
  doctor_id: number;
  department_id: number | null;
  scheduled_at: string;
  duration: number;
  status: AppointmentStatus;
  type: AppointmentType;
  reason: string | null;
  notes: string | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
  appointment_date: string;
  ends_at: string;
  patient_name: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_phone: string | null;
  patient_email: string | null;
  patient_birth_date: string;
  doctor_name: string;
  specialty_name: string;
  department_name: string | null;
  consultation_id: number | null;
  meeting_id: number | null;
  meeting_status: string | null;
  zoom_meeting_id: string | null;
  created_by: number | null;
}

/** Consultation rattachée à un rendez-vous (détail d'un rendez-vous). */
export interface AppointmentConsultationRow extends Row {
  id: number;
  appointment_id: number;
  doctor_id: number;
  diagnosis: string;
  notes: string | null;
  follow_up_at: string | null;
  created_at: string;
  patient_id: number;
  patient_name: string;
  doctor_name: string;
  prescriptions_count: number;
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                   */
/* -------------------------------------------------------------------------- */

/** Colonnes lues dans la vue : contrat explicite avec `002_views.sql`. */
const APPOINTMENT_COLUMNS = `
  v.id,
  v.patient_id,
  v.doctor_id,
  v.department_id,
  v.scheduled_at,
  v.duration,
  v.status,
  v.type,
  v.reason,
  v.notes,
  v.cancelled_reason,
  v.created_at,
  v.updated_at,
  v.appointment_date,
  v.ends_at,
  v.patient_name,
  v.patient_first_name,
  v.patient_last_name,
  v.patient_phone,
  v.patient_email,
  v.patient_birth_date,
  v.doctor_name,
  v.specialty_name,
  v.department_name,
  v.consultation_id,
  v.meeting_id,
  v.meeting_status,
  v.zoom_meeting_id,
  a.created_by
`;

const APPOINTMENT_FROM = `
  FROM v_appointment_details v
  JOIN appointments a ON a.id = v.id
`;

/**
 * Colonnes de tri autorisées.
 * Le client ne transmet qu'une **clé** ; l'expression SQL correspondante est
 * choisie ici, ce qui interdit toute injection par le paramètre `sort`.
 */
const APPOINTMENT_SORTS: Readonly<Record<string, string>> = {
  scheduled_at: 'v.scheduled_at',
  created_at: 'v.created_at',
  updated_at: 'v.updated_at',
  status: 'v.status',
  type: 'v.type',
  duration: 'v.duration',
  patient_name: 'v.patient_name',
  doctor_name: 'v.doctor_name',
  department_name: 'v.department_name',
};

/** Filtres de liste des rendez-vous. */
export interface AppointmentFilters {
  from?: string;
  to?: string;
  status?: string;
  type?: string;
  doctorId?: number;
  patientId?: number;
  departmentId?: number;
  search?: string;
}

/** Construit la clause `WHERE` commune à la liste et au comptage. */
function buildFilters(filters: AppointmentFilters): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.from !== undefined) {
    clauses.push('DATE(v.scheduled_at) >= ?');
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    clauses.push('DATE(v.scheduled_at) <= ?');
    params.push(filters.to);
  }
  if (filters.status !== undefined) {
    clauses.push('v.status = ?');
    params.push(filters.status);
  }
  if (filters.type !== undefined) {
    clauses.push('v.type = ?');
    params.push(filters.type);
  }
  if (filters.doctorId !== undefined) {
    clauses.push('v.doctor_id = ?');
    params.push(filters.doctorId);
  }
  if (filters.patientId !== undefined) {
    clauses.push('v.patient_id = ?');
    params.push(filters.patientId);
  }
  if (filters.departmentId !== undefined) {
    clauses.push('v.department_id = ?');
    params.push(filters.departmentId);
  }
  if (filters.search !== undefined && filters.search.trim() !== '') {
    // Recherche sur le nom du patient ou le motif du rendez-vous.
    const pattern = likePattern(filters.search.trim());
    clauses.push('(v.patient_name LIKE ? OR v.reason LIKE ?)');
    params.push(pattern, pattern);
  }

  return { where: whereClause(clauses), params };
}

/** Liste paginée des rendez-vous (vue). */
export async function listAppointments(options: {
  filters: AppointmentFilters;
  pagination: Pagination;
  sort?: string;
  order?: string;
}): Promise<AppointmentRow[]> {
  const { where, params } = buildFilters(options.filters);
  const orderBy = buildOrderBy(options.sort, options.order, APPOINTMENT_SORTS, 'v.scheduled_at', 'desc');

  return query<AppointmentRow>(
    `SELECT ${APPOINTMENT_COLUMNS} ${APPOINTMENT_FROM} ${where}
     ORDER BY ${orderBy}, v.id DESC
     LIMIT ? OFFSET ?`,
    [...params, options.pagination.limit, options.pagination.offset],
  );
}

/** Nombre total de rendez-vous correspondant aux filtres (requête dédiée). */
export async function countAppointments(filters: AppointmentFilters): Promise<number> {
  const { where, params } = buildFilters(filters);
  const row = await queryOneTotal(
    `SELECT COUNT(*) AS total ${APPOINTMENT_FROM} ${where}`,
    params,
  );
  return row;
}

/** Comptage générique renvoyant un entier sûr. */
async function queryOneTotal(sql: string, params: unknown[]): Promise<number> {
  const rows = await query<Row & { total: number }>(sql, params);
  const first = rows[0];
  return Number(first?.total ?? 0);
}

/** Rendez-vous d'une journée (bornes incluses), triés par heure. */
export async function findForDateRange(
  from: string,
  to: string,
  direction: 'asc' | 'desc' = 'asc',
): Promise<AppointmentRow[]> {
  return query<AppointmentRow>(
    `SELECT ${APPOINTMENT_COLUMNS} ${APPOINTMENT_FROM}
     WHERE DATE(v.scheduled_at) BETWEEN ? AND ?
     ORDER BY v.scheduled_at ${direction === 'asc' ? 'ASC' : 'DESC'}, v.id ASC`,
    [from, to],
  );
}

/** Tous les rendez-vous d'un patient, du plus récent au plus ancien. */
export async function findByPatient(patientId: number): Promise<AppointmentRow[]> {
  return query<AppointmentRow>(
    `SELECT ${APPOINTMENT_COLUMNS} ${APPOINTMENT_FROM}
     WHERE v.patient_id = ?
     ORDER BY v.scheduled_at DESC, v.id DESC`,
    [patientId],
  );
}

/** Détail d'un rendez-vous (vue). */
export async function findById(id: number): Promise<AppointmentRow | null> {
  const rows = await query<AppointmentRow>(
    `SELECT ${APPOINTMENT_COLUMNS} ${APPOINTMENT_FROM} WHERE v.id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

/** Consultation éventuellement rattachée à un rendez-vous (1–1). */
export async function findConsultationForAppointment(
  appointmentId: number,
): Promise<AppointmentConsultationRow | null> {
  const rows = await query<AppointmentConsultationRow>(
    `SELECT
       v.id,
       v.appointment_id,
       v.doctor_id,
       v.diagnosis,
       v.notes,
       v.follow_up_at,
       v.created_at,
       v.patient_id,
       v.patient_name,
       v.doctor_name,
       v.prescriptions_count
     FROM v_consultation_details v
     WHERE v.appointment_id = ?`,
    [appointmentId],
  );
  return rows[0] ?? null;
}

/** Rendez-vous du médecin chevauchant le créneau demandé, s'il existe. */
export async function findOverlapping(options: {
  doctorId: number;
  scheduledAt: string;
  duration: number;
  excludeId?: number;
  connection?: PoolConnection;
}): Promise<AppointmentRow | null> {
  const params: unknown[] = [
    options.doctorId,
    options.scheduledAt,
    options.duration,
    options.scheduledAt,
  ];
  let exclude = '';
  if (options.excludeId !== undefined) {
    exclude = 'AND v.id <> ?';
    params.push(options.excludeId);
  }

  const rows = await selectRows<AppointmentRow>(
    `SELECT ${APPOINTMENT_COLUMNS} ${APPOINTMENT_FROM}
     WHERE v.doctor_id = ?
       AND v.status NOT IN ('CANCELLED', 'NO_SHOW')
       AND v.scheduled_at < ADDTIME(?, SEC_TO_TIME(? * 60))
       AND ADDTIME(v.scheduled_at, SEC_TO_TIME(v.duration * 60)) > ?
       ${exclude}
     ORDER BY v.scheduled_at ASC
     LIMIT 1`,
    params,
    options.connection,
  );
  return rows[0] ?? null;
}

/** Nom affichable d'un médecin (`Dr Prénom Nom`). */
export async function findDoctorName(
  doctorId: number,
  connection?: PoolConnection,
): Promise<string | null> {
  const rows = await selectRows<Row & { name: string }>(
    `SELECT CONCAT('Dr ', u.first_name, ' ', u.last_name) AS name
     FROM doctors d
     JOIN users u ON u.id = d.user_id
     WHERE d.id = ?`,
    [doctorId],
    connection,
  );
  return rows[0]?.name ?? null;
}

/** Le dossier patient existe-t-il ? */
export async function patientExists(id: number, connection?: PoolConnection): Promise<boolean> {
  const rows = await selectRows<Row & { id: number }>(
    'SELECT id FROM patients WHERE id = ?',
    [id],
    connection,
  );
  return rows.length > 0;
}

/** Nombre de consultations rattachées à un rendez-vous. */
export async function countConsultations(
  appointmentId: number,
  connection?: PoolConnection,
): Promise<number> {
  const rows = await selectRows<Row & { total: number }>(
    'SELECT COUNT(*) AS total FROM consultations WHERE appointment_id = ?',
    [appointmentId],
    connection,
  );
  return Number(rows[0]?.total ?? 0);
}

/** Identifiant d'un patient retrouvé par email ou téléphone (réservation en ligne). */
export async function findPatientIdByEmailOrPhone(
  email: string,
  phone: string | null,
  connection?: PoolConnection,
): Promise<number | null> {
  const rows = await selectRows<Row & { id: number }>(
    `SELECT id FROM patients
     WHERE email = ? OR (? IS NOT NULL AND phone = ?)
     ORDER BY id ASC
     LIMIT 1`,
    [email, phone, phone],
    connection,
  );
  return rows[0]?.id ?? null;
}

/** Utilisateurs actifs portant le rôle RECEPTIONIST (destinataires des alertes). */
export async function listReceptionistUserIds(connection?: PoolConnection): Promise<number[]> {
  const rows = await selectRows<Row & { id: number }>(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r       ON r.id = ur.role_id
     WHERE r.code = 'RECEPTIONIST' AND u.is_active = TRUE
     ORDER BY u.id ASC`,
    [],
    connection,
  );
  return rows.map((row) => row.id);
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                  */
/* -------------------------------------------------------------------------- */

/** Champs d'un nouveau rendez-vous (snake_case, prêts pour l'INSERT). */
export interface NewAppointment {
  patientId: number;
  doctorId: number;
  departmentId: number | null;
  scheduledAt: string;
  duration: number;
  status: AppointmentStatus;
  type: AppointmentType;
  reason: string | null;
  notes: string | null;
  createdBy: number | null;
}

/** Champs modifiables d'un rendez-vous (clés = colonnes SQL). */
export type AppointmentChanges = {
  doctor_id?: number;
  department_id?: number | null;
  scheduled_at?: string;
  duration?: number;
  status?: AppointmentStatus;
  type?: AppointmentType;
  reason?: string | null;
  notes?: string | null;
  cancelled_reason?: string | null;
};

const APPOINTMENT_UPDATE_COLUMNS = [
  'doctor_id',
  'department_id',
  'scheduled_at',
  'duration',
  'status',
  'type',
  'reason',
  'notes',
  'cancelled_reason',
] as const;

/** Crée un rendez-vous et renvoie son identifiant. */
export async function insertAppointment(
  input: NewAppointment,
  connection?: PoolConnection,
): Promise<number> {
  const result = await write(
    `INSERT INTO appointments
       (patient_id, doctor_id, department_id, scheduled_at, duration, status, type,
        reason, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.patientId,
      input.doctorId,
      input.departmentId,
      input.scheduledAt,
      input.duration,
      input.status,
      input.type,
      input.reason,
      input.notes,
      input.createdBy,
    ],
    connection,
  );
  return result.insertId;
}

/** Crée le dossier patient minimal d'une réservation en ligne. */
export async function insertPatient(
  input: {
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: string;
    email: string;
    phone: string | null;
  },
  connection?: PoolConnection,
): Promise<number> {
  const result = await write(
    `INSERT INTO patients (first_name, last_name, birth_date, gender, email, phone)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.firstName, input.lastName, input.birthDate, input.gender, input.email, input.phone],
    connection,
  );
  return result.insertId;
}

/** Crée la réunion Zoom d'une téléconsultation (statut PENDING). */
export async function insertMeeting(
  input: {
    appointmentId: number;
    patientId: number;
    doctorId: number;
    reason: string;
    preferredAt: string;
    duration: number;
    requestedBy: number | null;
  },
  connection?: PoolConnection,
): Promise<number> {
  const result = await write(
    `INSERT INTO meetings
       (appointment_id, patient_id, doctor_id, reason, preferred_at, duration, status, requested_by)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    [
      input.appointmentId,
      input.patientId,
      input.doctorId,
      input.reason,
      input.preferredAt,
      input.duration,
      input.requestedBy,
    ],
    connection,
  );
  return result.insertId;
}

/** Met à jour les colonnes fournies d'un rendez-vous. */
export async function updateAppointment(
  id: number,
  changes: AppointmentChanges,
  connection?: PoolConnection,
): Promise<void> {
  const { sql, params } = buildSetClause(changes, APPOINTMENT_UPDATE_COLUMNS);
  await write(`UPDATE appointments SET ${sql} WHERE id = ?`, [...params, id], connection);
}

/** Annule la réunion Zoom liée à un rendez-vous annulé. */
export async function cancelMeetingForAppointment(
  appointmentId: number,
  connection?: PoolConnection,
): Promise<void> {
  await write(
    `UPDATE meetings SET status = 'CANCELLED'
     WHERE appointment_id = ? AND status NOT IN ('CANCELLED', 'COMPLETED')`,
    [appointmentId],
    connection,
  );
}

/** Supprime définitivement un rendez-vous (les consultations suivent en cascade). */
export async function deleteAppointment(id: number, connection?: PoolConnection): Promise<void> {
  await write('DELETE FROM appointments WHERE id = ?', [id], connection);
}

/** Insère une notification pour un utilisateur. */
export async function insertNotification(
  input: { userId: number; title: string; message: string; type: string; link: string | null },
  connection?: PoolConnection,
): Promise<void> {
  await write(
    `INSERT INTO notifications (user_id, title, message, type, is_read, link)
     VALUES (?, ?, ?, ?, FALSE, ?)`,
    [input.userId, input.title, input.message, input.type, input.link],
    connection,
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers internes                                                           */
/* -------------------------------------------------------------------------- */

/** Lecture de lignes, sur le pool ou sur une connexion de transaction. */
async function selectRows<T extends Row>(
  sql: string,
  params: readonly unknown[],
  connection?: PoolConnection,
): Promise<T[]> {
  return connection ? queryWith<T>(connection, sql, params) : query<T>(sql, params);
}

/** Écriture, sur le pool ou sur une connexion de transaction. */
async function write(
  sql: string,
  params: readonly unknown[],
  connection?: PoolConnection,
): Promise<ResultSetHeader> {
  return connection ? executeWith(connection, sql, params) : execute(sql, params);
}
