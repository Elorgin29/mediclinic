/**
 * Accès aux données du module « téléconsultations ».
 *
 * Les listes passent par la vue `v_active_meetings` (fenêtre de connexion déjà
 * calculée côté SQL) ; les détails et les écritures portent sur la table
 * `meetings`. Les opérations composées (demande + notifications, approbation +
 * rendez-vous) sont exécutées dans une transaction.
 */

import type { MeetingStatus, NotificationType } from '@mediclinic/shared';
import type { PoolConnection } from 'mysql2/promise';

import type { Row } from '../../config/db.js';
import { execute, executeWith, limitClause, query, queryOne, withTransaction } from '../../config/db.js';
import { buildOrderBy, likePattern, whereClause } from '../../utils/pagination.js';

/* -------------------------------------------------------------------------- */
/* Types de lignes                                                             */
/* -------------------------------------------------------------------------- */

/** Ligne de `v_active_meetings` (liste des téléconsultations). */
export interface MeetingListRow extends Row {
  id: number;
  appointment_id: number | null;
  patient_id: number;
  patient_name: string;
  doctor_id: number;
  doctor_name: string;
  reason: string;
  preferred_at: string;
  duration: number;
  start_time: string | null;
  /** Fin prévue calculée par la vue. */
  ends_at: string | null;
  status: MeetingStatus;
  zoom_meeting_id: string | null;
  join_url: string | null;
  /** 0/1 (la vue utilise une comparaison) ; peut être NULL si `start_time` l'est. */
  is_joinable: number | null;
}

/** Ligne complète de `meetings`. */
export interface MeetingRecord extends Row {
  id: number;
  appointment_id: number | null;
  patient_id: number;
  doctor_id: number;
  reason: string;
  preferred_at: string;
  duration: number;
  zoom_meeting_id: string | null;
  join_url: string | null;
  start_url: string | null;
  password: string | null;
  start_time: string | null;
  status: MeetingStatus;
  rejection_reason: string | null;
  requested_by: number;
  approved_by: number | null;
  created_at: string;
}

/** Détail enrichi du patient et du médecin (utilisé aussi pour l'email). */
export interface MeetingDetailRow extends MeetingRecord {
  patient_name: string;
  patient_email: string | null;
  doctor_name: string;
  doctor_department_id: number | null;
}

/** Contact d'un patient (vérification d'existence et adresse email). */
export interface PatientContactRow extends Row {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
}

/** Résumé d'un médecin (existence, département, libellé). */
export interface DoctorSummaryRow extends Row {
  id: number;
  department_id: number | null;
  doctor_name: string;
}

/* -------------------------------------------------------------------------- */
/* Filtres                                                                     */
/* -------------------------------------------------------------------------- */

export interface MeetingFilters {
  status?: string;
  doctorId?: number;
  patientId?: number;
  /** Borne basse incluse, au format `AAAA-MM-JJ`. */
  from?: string;
  /** Borne haute incluse, au format `AAAA-MM-JJ`. */
  to?: string;
  search?: string;
}

/** Colonnes de tri autorisées sur la vue (liste blanche). */
const MEETING_SORT_COLUMNS: Readonly<Record<string, string>> = {
  start_time: 'm.start_time',
  preferred_at: 'm.preferred_at',
  status: 'm.status',
  patient_name: 'm.patient_name',
  doctor_name: 'm.doctor_name',
};

const MEETING_DETAIL_SELECT = `
  SELECT
    m.id,
    m.appointment_id,
    m.patient_id,
    m.doctor_id,
    m.reason,
    m.preferred_at,
    m.duration,
    m.zoom_meeting_id,
    m.join_url,
    m.start_url,
    m.password,
    m.start_time,
    m.status,
    m.rejection_reason,
    m.requested_by,
    m.approved_by,
    m.created_at,
    CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
    COALESCE(p.email, pu.email)            AS patient_email,
    CONCAT('Dr ', u.first_name, ' ', u.last_name) AS doctor_name,
    d.department_id                        AS doctor_department_id
  FROM meetings m
  JOIN patients p     ON p.id = m.patient_id
  LEFT JOIN users pu  ON pu.id = p.user_id
  JOIN doctors d      ON d.id = m.doctor_id
  JOIN users u        ON u.id = d.user_id
`;

/** Construit la clause WHERE commune à la liste et au comptage. */
function buildFilters(filters: MeetingFilters): { where: string; params: unknown[] } {
  const fragments: string[] = [];
  const params: unknown[] = [];

  if (filters.status !== undefined) {
    fragments.push('m.status = ?');
    params.push(filters.status);
  }
  if (filters.doctorId !== undefined) {
    fragments.push('m.doctor_id = ?');
    params.push(filters.doctorId);
  }
  if (filters.patientId !== undefined) {
    fragments.push('m.patient_id = ?');
    params.push(filters.patientId);
  }
  if (filters.from !== undefined) {
    fragments.push('m.preferred_at >= ?');
    params.push(`${filters.from} 00:00:00`);
  }
  if (filters.to !== undefined) {
    fragments.push('m.preferred_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(filters.to);
  }
  if (filters.search !== undefined) {
    fragments.push('(m.patient_name LIKE ? OR m.doctor_name LIKE ?)');
    const pattern = likePattern(filters.search);
    params.push(pattern, pattern);
  }

  return { where: whereClause(fragments), params };
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** Nombre total de téléconsultations correspondant aux filtres. */
export async function countMeetings(filters: MeetingFilters): Promise<number> {
  const { where, params } = buildFilters(filters);
  const row = await queryOne<Row & { total: number }>(
    `SELECT COUNT(*) AS total FROM v_active_meetings m ${where}`,
    params,
  );
  return Number(row?.total ?? 0);
}

/** Liste paginée des téléconsultations. */
export async function listMeetings(
  filters: MeetingFilters,
  options: { sort?: string; order?: string; limit: number; offset: number },
): Promise<MeetingListRow[]> {
  const { where, params } = buildFilters(filters);
  const orderBy = buildOrderBy(
    options.sort,
    options.order,
    MEETING_SORT_COLUMNS,
    'm.preferred_at',
    'desc',
  );
  const limit = limitClause(options.limit, options.offset);

  return query<MeetingListRow>(
    `SELECT
       m.id, m.appointment_id, m.patient_id, m.patient_name, m.doctor_id, m.doctor_name,
       m.reason, m.preferred_at, m.duration, m.start_time, m.ends_at, m.status,
       m.zoom_meeting_id, m.join_url, m.is_joinable
     FROM v_active_meetings m
     ${where}
     ORDER BY ${orderBy}, m.id DESC
     ${limit.sql}`,
    [...params, ...limit.params],
  );
}

/** Ligne brute d'une téléconsultation. */
export async function findMeetingById(id: number): Promise<MeetingRecord | null> {
  return queryOne<MeetingRecord>(
    `SELECT id, appointment_id, patient_id, doctor_id, reason, preferred_at, duration,
            zoom_meeting_id, join_url, start_url, password, start_time, status,
            rejection_reason, requested_by, approved_by, created_at
     FROM meetings WHERE id = ?`,
    [id],
  );
}

/** Détail enrichi d'une téléconsultation. */
export async function findMeetingDetail(id: number): Promise<MeetingDetailRow | null> {
  return queryOne<MeetingDetailRow>(`${MEETING_DETAIL_SELECT} WHERE m.id = ?`, [id]);
}

/** Contact du patient (existence + email de notification). */
export async function findPatientContact(patientId: number): Promise<PatientContactRow | null> {
  return queryOne<PatientContactRow>(
    `SELECT p.id, p.first_name, p.last_name, COALESCE(p.email, u.email) AS email
     FROM patients p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.id = ?`,
    [patientId],
  );
}

/** Résumé du médecin (existence + département pour le rendez-vous créé). */
export async function findDoctorSummary(doctorId: number): Promise<DoctorSummaryRow | null> {
  return queryOne<DoctorSummaryRow>(
    `SELECT d.id, d.department_id,
            CONCAT('Dr ', u.first_name, ' ', u.last_name) AS doctor_name
     FROM doctors d
     JOIN users u ON u.id = d.user_id
     WHERE d.id = ?`,
    [doctorId],
  );
}

/** Identifiants des administrateurs actifs (destinataires des demandes). */
export async function findActiveAdministratorIds(): Promise<number[]> {
  const rows = await query<Row & { id: number }>(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r       ON r.id = ur.role_id
     WHERE u.is_active = TRUE
       AND r.code IN ('ADMIN', 'SUPER_ADMIN')
     ORDER BY u.id`,
  );
  return rows.map((row) => row.id);
}

/* -------------------------------------------------------------------------- */
/* Notifications (écriture minimale)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Charge utile d'une notification.
 * L'insertion est écrite ici — et non importée du module `notifications` — pour
 * que le module reste autonome et que la demande de téléconsultation soit
 * atomique dans une seule transaction.
 */
export interface MeetingNotification {
  title: string;
  message: string;
  type: NotificationType;
  link: string | null;
}

/** Insère une notification pour un destinataire. */
export async function insertNotification(
  connection: PoolConnection,
  userId: number,
  payload: MeetingNotification,
): Promise<void> {
  await executeWith(
    connection,
    `INSERT INTO notifications (user_id, title, message, type, link)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, payload.title, payload.message, payload.type, payload.link],
  );
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

export interface NewMeetingInput {
  patientId: number;
  doctorId: number;
  reason: string;
  preferredAt: string;
  duration: number;
  requestedBy: number;
}

/**
 * Crée la demande de téléconsultation (statut `PENDING`) et notifie les
 * administrateurs, le tout dans une transaction : jamais de demande sans
 * notification, jamais de notification orpheline.
 */
export async function createMeetingWithNotifications(
  input: NewMeetingInput,
  recipientIds: readonly number[],
  notification: MeetingNotification,
): Promise<number> {
  return withTransaction(async (connection) => {
    const result = await executeWith(
      connection,
      `INSERT INTO meetings
         (patient_id, doctor_id, reason, preferred_at, duration, status, requested_by)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
      [
        input.patientId,
        input.doctorId,
        input.reason,
        input.preferredAt,
        input.duration,
        input.requestedBy,
      ],
    );

    const meetingId = result.insertId;
    for (const userId of recipientIds) {
      await insertNotification(connection, userId, notification);
    }

    return meetingId;
  });
}

/** Rendez-vous à créer lors de l'approbation (absent si la réunion en a déjà un). */
export interface LinkedAppointmentInput {
  patientId: number;
  doctorId: number;
  departmentId: number | null;
  scheduledAt: string;
  duration: number;
  reason: string | null;
  createdBy: number;
}

export interface ApproveMeetingInput {
  meetingId: number;
  zoomMeetingId: string;
  joinUrl: string;
  startUrl: string;
  password: string;
  /** Début effectif de la séance (`preferred_at` ou valeur fournie). */
  startTime: string;
  approvedBy: number;
  /** `null` lorsque la téléconsultation est déjà rattachée à un rendez-vous. */
  appointment: LinkedAppointmentInput | null;
}

/**
 * Approuve la demande : crée le rendez-vous de téléconsultation s'il n'existe
 * pas encore, puis renseigne la réunion Zoom et le statut.
 * @returns l'identifiant du rendez-vous créé (`null` s'il existait déjà).
 */
export async function approveMeeting(
  input: ApproveMeetingInput,
): Promise<{ appointmentId: number | null }> {
  return withTransaction(async (connection) => {
    let appointmentId: number | null = null;

    if (input.appointment) {
      const created = await executeWith(
        connection,
        `INSERT INTO appointments
           (patient_id, doctor_id, department_id, scheduled_at, duration, status, type,
            reason, created_by)
         VALUES (?, ?, ?, ?, ?, 'CONFIRMED', 'TELEMEDICINE', ?, ?)`,
        [
          input.appointment.patientId,
          input.appointment.doctorId,
          input.appointment.departmentId,
          input.appointment.scheduledAt,
          input.appointment.duration,
          input.appointment.reason,
          input.appointment.createdBy,
        ],
      );
      appointmentId = created.insertId;
    }

    // COALESCE : on ne remplace jamais un rendez-vous déjà rattaché.
    await executeWith(
      connection,
      `UPDATE meetings
       SET appointment_id   = COALESCE(appointment_id, ?),
           zoom_meeting_id  = ?,
           join_url         = ?,
           start_url        = ?,
           password         = ?,
           start_time       = ?,
           status           = 'APPROVED',
           rejection_reason = NULL,
           approved_by      = ?
       WHERE id = ?`,
      [
        appointmentId,
        input.zoomMeetingId,
        input.joinUrl,
        input.startUrl,
        input.password,
        input.startTime,
        input.approvedBy,
        input.meetingId,
      ],
    );

    return { appointmentId };
  });
}

/** Refuse une demande de téléconsultation. */
export async function rejectMeeting(
  meetingId: number,
  reason: string,
  approvedBy: number,
): Promise<number> {
  const result = await execute(
    `UPDATE meetings
     SET status = 'REJECTED', rejection_reason = ?, approved_by = ?
     WHERE id = ?`,
    [reason, approvedBy, meetingId],
  );
  return result.affectedRows;
}

/** Annule une téléconsultation. */
export async function cancelMeeting(meetingId: number): Promise<number> {
  const result = await execute(`UPDATE meetings SET status = 'CANCELLED' WHERE id = ?`, [meetingId]);
  return result.affectedRows;
}
