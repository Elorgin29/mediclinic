/**
 * Règles métier des téléconsultations.
 *
 * Le service ne contient AUCUNE chaîne SQL : toutes les lectures et écritures
 * passent par `meetings.repository.ts` (vue `v_active_meetings` pour les listes,
 * table `meetings` pour le détail et les écritures).
 *
 * Deux principes structurent ce module :
 *  1. **Zoom ne doit jamais bloquer l'application.** En l'absence
 *     d'identifiants, `createZoomMeeting()` renvoie une réunion simulée
 *     cohérente et l'approbation fonctionne exactement de la même façon.
 *  2. **Une notification ne doit jamais faire échouer l'opération métier.**
 *     L'email et les notifications sont donc best-effort : ils sont tentés
 *     après l'écriture, dans un `try/catch` qui ne remonte rien à l'appelant.
 */

import type { Meeting, MeetingSignature, MeetingStatus } from '@mediclinic/shared';

import {
  createZoomMeeting,
  deleteZoomMeeting,
  generateZoomSignature,
  isJoinWindowOpen,
  isZoomConfigured,
} from '../../config/zoom.js';
import { env } from '../../config/env.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { toMySqlDate, toMySqlDateTime } from '../../utils/datetime.js';
import { meetingApprovedEmail, sendMail } from '../../utils/email.service.js';
import type { Pagination } from '../../utils/pagination.js';
import { withTransaction } from '../../config/db.js';
import * as repository from './meetings.repository.js';
import type {
  MeetingDetailRow,
  MeetingListRow,
  MeetingRecord,
} from './meetings.repository.js';

/* -------------------------------------------------------------------------- */
/* Constantes                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Durée de validité d'un jeton de connexion (et de la signature SDK).
 * `generateZoomSignature()` signe pour deux heures : la valeur annoncée au
 * front doit rester alignée sur cette échéance.
 */
const JOIN_TOKEN_TTL_MINUTES = 120;

/** Fenêtre de connexion, reprise du module partagé pour le message d'erreur. */
const JOIN_WINDOW_MINUTES = 10;

/** Nombre maximum de personnes notifiées d'un refus (garde-fou). */
const MAX_REJECT_NOTIFICATIONS = 1;

/* -------------------------------------------------------------------------- */
/* Formes exposées par l'API                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Ligne de liste : la vue `v_active_meetings` ne porte pas les colonnes
 * techniques de la table (`requested_by`, `password`, `start_url`…). Le détail
 * complet reste accessible via `GET /api/meetings/:id`.
 */
export interface MeetingListItem {
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
  /** Fin prévue, calculée par la vue. */
  ends_at: string | null;
  status: MeetingStatus;
  zoom_meeting_id: string | null;
  join_url: string | null;
  is_joinable: boolean;
}

/** Détail d'une téléconsultation : objet `Meeting` complet + champs calculés. */
export interface MeetingDetail extends Meeting {
  patient_name: string;
  doctor_name: string;
  /** Email du patient, utilisé pour la notification d'approbation. */
  patient_email: string | null;
  /** Fenêtre de connexion ouverte au moment de la requête. */
  is_joinable: boolean;
}

/** Jeton de connexion transmis au Meeting SDK côté navigateur. */
export interface MeetingJoinToken {
  meetingNumber: string;
  password: string | null;
  joinUrl: string | null;
  /** `0` = participant, `1` = hôte. */
  role: 0 | 1;
  userName: string;
  expiresInMinutes: number;
  /** true lorsque la réunion est simulée (Zoom non configuré). */
  simulated: boolean;
}

/** Résultat d'une approbation (réunion + rendez-vous éventuellement créé). */
export interface MeetingApprovalResult {
  meeting: MeetingDetail;
  /** Identifiant du rendez-vous créé, `null` s'il en existait déjà un. */
  appointmentId: number | null;
  simulated: boolean;
}

/* -------------------------------------------------------------------------- */
/* Conversions ligne SQL → objet exposé                                        */
/* -------------------------------------------------------------------------- */

/** Convertit une ligne de `meetings` en objet `Meeting` partagé. */
export function toMeeting(row: MeetingRecord): Meeting {
  return {
    id: row.id,
    appointment_id: row.appointment_id,
    patient_id: row.patient_id,
    doctor_id: row.doctor_id,
    reason: row.reason,
    preferred_at: String(row.preferred_at),
    duration: row.duration,
    zoom_meeting_id: row.zoom_meeting_id,
    join_url: row.join_url,
    start_url: row.start_url,
    password: row.password,
    start_time: row.start_time === null ? null : String(row.start_time),
    status: row.status,
    rejection_reason: row.rejection_reason,
    requested_by: row.requested_by,
    approved_by: row.approved_by,
    created_at: String(row.created_at),
  };
}

/** Convertit une ligne de la vue `v_active_meetings` en élément de liste. */
export function toMeetingListItem(row: MeetingListRow): MeetingListItem {
  return {
    id: row.id,
    appointment_id: row.appointment_id,
    patient_id: row.patient_id,
    patient_name: row.patient_name,
    doctor_id: row.doctor_id,
    doctor_name: row.doctor_name,
    reason: row.reason,
    preferred_at: String(row.preferred_at),
    duration: row.duration,
    start_time: row.start_time === null ? null : String(row.start_time),
    ends_at: row.ends_at === null ? null : String(row.ends_at),
    status: row.status,
    zoom_meeting_id: row.zoom_meeting_id,
    join_url: row.join_url,
    // La vue renvoie 0/1, ou NULL lorsque `start_time` n'est pas encore fixé.
    is_joinable: Boolean(row.is_joinable),
  };
}

/**
 * Convertit un détail enrichi en `MeetingDetail`.
 * `is_joinable` est recalculé avec `isJoinWindowOpen()` plutôt que lu en SQL :
 * l'heure de référence est ainsi celle du serveur applicatif, comme pour
 * `GET /api/meetings/:id/join-token`, ce qui garantit la cohérence des deux
 * réponses.
 */
export function toMeetingDetail(row: MeetingDetailRow): MeetingDetail {
  return {
    ...toMeeting(row),
    patient_name: row.patient_name,
    doctor_name: row.doctor_name,
    patient_email: row.patient_email,
    is_joinable: isJoinWindowOpen(row.start_time, row.duration),
  };
}

/* -------------------------------------------------------------------------- */
/* Filtres                                                                     */
/* -------------------------------------------------------------------------- */

export interface MeetingListFilters {
  status?: MeetingStatus;
  doctorId?: number;
  patientId?: number;
  /** Borne basse incluse (`AAAA-MM-JJ` ou ISO 8601). */
  from?: string;
  /** Borne haute incluse (`AAAA-MM-JJ` ou ISO 8601). */
  to?: string;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

/** Normalise les bornes de date vers `AAAA-MM-JJ` (format attendu par le SQL). */
function normalizeFilters(filters: MeetingListFilters): repository.MeetingFilters {
  return {
    ...(filters.status === undefined ? {} : { status: filters.status }),
    ...(filters.doctorId === undefined ? {} : { doctorId: filters.doctorId }),
    ...(filters.patientId === undefined ? {} : { patientId: filters.patientId }),
    ...(filters.from === undefined ? {} : { from: toMySqlDate(filters.from) ?? undefined }),
    ...(filters.to === undefined ? {} : { to: toMySqlDate(filters.to) ?? undefined }),
    ...(filters.search === undefined ? {} : { search: filters.search }),
  };
}

/* -------------------------------------------------------------------------- */
/* Contrôles d'accès et de rôle                                                */
/* -------------------------------------------------------------------------- */

/** Nom complet affiché dans la réunion Zoom. */
function fullName(user: AuthUser): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

/** L'utilisateur est-il administrateur (ADMIN ou SUPER_ADMIN) ? */
function isAdministrator(user: AuthUser): boolean {
  return user.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN');
}

/** L'utilisateur est-il le médecin de la téléconsultation ? */
function isConcernedDoctor(user: AuthUser, meeting: MeetingDetail): boolean {
  return user.doctorId !== null && user.doctorId === meeting.doctor_id;
}

/** L'utilisateur est-il le patient de la téléconsultation ? */
function isConcernedPatient(user: AuthUser, meeting: MeetingDetail): boolean {
  return user.patientId !== null && user.patientId === meeting.patient_id;
}

/**
 * Autorise l'accès au jeton et à la signature : uniquement le patient
 * concerné, son médecin ou un administrateur.
 */
function assertMeetingAccess(user: AuthUser, meeting: MeetingDetail): void {
  if (isConcernedPatient(user, meeting) || isConcernedDoctor(user, meeting) || isAdministrator(user)) {
    return;
  }
  throw AppError.forbidden(
    'Vous ne pouvez accéder qu’aux téléconsultations qui vous concernent.',
    'MEETING_ACCESS_DENIED',
  );
}

/**
 * Détermine le rôle Zoom effectif.
 *
 * Le rôle demandé par le client n'est jamais accepté tel quel : un patient ne
 * doit pas pouvoir se connecter comme hôte. Seuls le médecin de la séance et
 * les administrateurs obtiennent le rôle hôte (`1`).
 */
function resolveRole(user: AuthUser, meeting: MeetingDetail, requested: 0 | 1): 0 | 1 {
  if (isConcernedDoctor(user, meeting) || isAdministrator(user)) return requested;
  return 0;
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** Liste paginée des téléconsultations (vue `v_active_meetings`). */
export async function list(
  filters: MeetingListFilters,
  pagination: Pagination,
): Promise<{ data: MeetingListItem[]; total: number }> {
  const normalized = normalizeFilters(filters);

  const [rows, total] = await Promise.all([
    repository.listMeetings(normalized, {
      ...(filters.sort === undefined ? {} : { sort: filters.sort }),
      ...(filters.order === undefined ? {} : { order: filters.order }),
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    repository.countMeetings(normalized),
  ]);

  return { data: rows.map(toMeetingListItem), total };
}

/**
 * Téléconsultations du patient connecté (`GET /api/meetings/me`).
 * Un compte sans dossier patient n'a rien à consulter : le message le dit.
 */
export async function listMine(
  user: AuthUser,
  pagination: Pagination,
): Promise<{ data: MeetingListItem[]; total: number }> {
  if (user.patientId === null) {
    throw AppError.forbidden(
      'Cette ressource est réservée aux comptes patients.',
      'NOT_A_PATIENT',
    );
  }
  return list({ patientId: user.patientId }, pagination);
}

/** Détail d'une téléconsultation, `is_joinable` recalculé côté serveur. */
export async function getById(id: number): Promise<MeetingDetail> {
  const row = await repository.findMeetingDetail(id);
  if (!row) {
    throw AppError.notFound('Téléconsultation introuvable.', 'MEETING_NOT_FOUND');
  }
  return toMeetingDetail(row);
}

/* -------------------------------------------------------------------------- */
/* Demande                                                                     */
/* -------------------------------------------------------------------------- */

export interface MeetingRequestPayload {
  doctorId: number;
  reason: string;
  preferredAt: string;
  duration: number;
  /** Fourni par le secrétariat ; à défaut, déduit du compte connecté. */
  patientId?: number;
}

/**
 * Crée une demande de téléconsultation (statut `PENDING`) et notifie les
 * administrateurs actifs.
 *
 * @throws AppError 403 `NOT_A_PATIENT` si aucun dossier patient n'est
 *         identifiable, 422 si le médecin n'existe pas.
 */
export async function requestMeeting(
  input: MeetingRequestPayload,
  user: AuthUser,
): Promise<MeetingDetail> {
  const patientId = input.patientId ?? user.patientId ?? null;
  if (patientId === null) {
    throw AppError.forbidden(
      'Seul un compte rattaché à un dossier patient peut demander une téléconsultation. Renseignez le patient concerné.',
      'NOT_A_PATIENT',
    );
  }

  const doctor = await repository.findDoctorSummary(input.doctorId);
  if (!doctor) {
    throw AppError.unprocessable(
      `Le médecin n° ${input.doctorId} n’existe pas.`,
      'DOCTOR_NOT_FOUND',
    );
  }

  const patient = await repository.findPatientContact(patientId);
  if (!patient) {
    throw AppError.notFound(
      `Le dossier patient n° ${patientId} est introuvable.`,
      'PATIENT_NOT_FOUND',
    );
  }

  const preferredAt = toMySqlDateTime(input.preferredAt);
  if (!preferredAt) {
    throw AppError.badRequest('La date souhaitée est invalide.', 'INVALID_PREFERRED_AT');
  }

  const administrators = await repository.findActiveAdministratorIds();

  // `link` pointe la liste des téléconsultations : l'identifiant définitif
  // n'est connu qu'à la fin de la transaction d'insertion.
  const meetingId = await repository.createMeetingWithNotifications(
    {
      patientId,
      doctorId: input.doctorId,
      reason: input.reason,
      preferredAt,
      duration: input.duration,
      requestedBy: user.id,
    },
    administrators,
    {
      title: 'Nouvelle demande de téléconsultation',
      message: `${patient.first_name} ${patient.last_name} demande une téléconsultation avec ${doctor.doctor_name} le ${preferredAt} (motif : ${input.reason}).`,
      type: 'INFO',
      link: '/meetings',
    },
  );

  return getById(meetingId);
}

/* -------------------------------------------------------------------------- */
/* Approbation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Approuve une demande : crée la réunion Zoom puis le rendez-vous de
 * téléconsultation lorsqu'il n'existe pas encore.
 *
 * L'écriture est transactionnelle côté repository (`approveMeeting`) : la
 * réunion et son rendez-vous sont validés ensemble ou pas du tout. L'email
 * d'information est envoyé APRÈS le commit et ne peut donc jamais annuler
 * l'approbation.
 */
export async function approve(id: number, user: AuthUser): Promise<MeetingApprovalResult> {
  const record = await repository.findMeetingById(id);
  if (!record) {
    throw AppError.notFound('Téléconsultation introuvable.', 'MEETING_NOT_FOUND');
  }
  if (record.status === 'APPROVED') {
    throw AppError.conflict('Cette téléconsultation est déjà approuvée.', 'MEETING_ALREADY_APPROVED');
  }
  if (record.status === 'CANCELLED' || record.status === 'COMPLETED') {
    throw AppError.conflict(
      'Cette téléconsultation est clôturée : elle ne peut plus être approuvée.',
      'MEETING_NOT_PENDING',
    );
  }

  const detail = await getById(id);
  const doctor = await repository.findDoctorSummary(record.doctor_id);

  // Le début effectif est la date souhaitée par le patient : elle sert à la
  // fois de `start_time` applicatif et de créneau du rendez-vous.
  const startTime = String(record.preferred_at);

  let zoomMeeting;
  try {
    zoomMeeting = await createZoomMeeting({
      topic: `Téléconsultation — ${detail.patient_name} / ${detail.doctor_name}`,
      startTime,
      duration: record.duration,
      agenda: `${env.CLINIC_NAME} — ${record.reason}`,
    });
  } catch (error) {
    throw AppError.serviceUnavailable(
      'La réunion Zoom n’a pas pu être créée. Réessayez dans quelques instants.',
      'ZOOM_UNAVAILABLE',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }

  const { appointmentId } = await repository.approveMeeting({
    meetingId: id,
    zoomMeetingId: zoomMeeting.id,
    joinUrl: zoomMeeting.join_url,
    startUrl: zoomMeeting.start_url,
    password: zoomMeeting.password,
    startTime,
    approvedBy: user.id,
    appointment:
      record.appointment_id === null
        ? {
            patientId: record.patient_id,
            doctorId: record.doctor_id,
            departmentId: doctor?.department_id ?? null,
            scheduledAt: startTime,
            duration: record.duration,
            reason: record.reason,
            createdBy: user.id,
          }
        : null,
  });

  const meeting = await getById(id);

  // Email d'information : jamais bloquant, y compris si le SMTP est absent.
  if (detail.patient_email) {
    try {
      const mail = meetingApprovedEmail({
        patientName: detail.patient_name,
        doctorName: detail.doctor_name,
        dateTime: startTime,
        joinUrl: zoomMeeting.join_url,
        password: zoomMeeting.password,
      });
      await sendMail({ ...mail, to: detail.patient_email });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[meetings] email d’approbation non envoyé :', error);
    }
  }

  return { meeting, appointmentId, simulated: zoomMeeting.simulated };
}

/* -------------------------------------------------------------------------- */
/* Refus                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Refuse une demande et prévient le patient.
 *
 * Le demandeur (`requested_by`) est le compte patient lorsque la demande a été
 * déposée depuis son espace : c'est donc lui qui reçoit la notification.
 * L'insertion est isolée dans un `try/catch` : un échec de notification ne doit
 * pas annuler le refus déjà enregistré.
 */
export async function reject(
  id: number,
  reason: string,
  user: AuthUser,
): Promise<MeetingDetail> {
  const record = await repository.findMeetingById(id);
  if (!record) {
    throw AppError.notFound('Téléconsultation introuvable.', 'MEETING_NOT_FOUND');
  }
  if (record.status !== 'PENDING') {
    throw AppError.conflict(
      'Seule une demande en attente peut être refusée.',
      'MEETING_NOT_PENDING',
    );
  }

  await repository.rejectMeeting(id, reason, user.id);

  const recipients =
    record.requested_by === user.id ? [] : [record.requested_by].slice(0, MAX_REJECT_NOTIFICATIONS);

  if (recipients.length > 0) {
    try {
      await withTransaction(async (connection) => {
        for (const userId of recipients) {
          await repository.insertNotification(connection, userId, {
            title: 'Demande de téléconsultation refusée',
            message: `Votre demande de téléconsultation du ${String(record.preferred_at)} a été refusée. Motif : ${reason}.`,
            type: 'WARNING',
            link: `/meetings/${id}`,
          });
        }
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[meetings] notification de refus non enregistrée :', error);
    }
  }

  return getById(id);
}

/* -------------------------------------------------------------------------- */
/* Annulation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Annule une téléconsultation.
 * La suppression de la réunion Zoom est tentée puis ignorée en cas d'échec :
 * l'annulation locale fait foi, une réunion orpheline côté Zoom est sans
 * conséquence pour le patient.
 */
export async function cancel(id: number): Promise<MeetingDetail> {
  const record = await repository.findMeetingById(id);
  if (!record) {
    throw AppError.notFound('Téléconsultation introuvable.', 'MEETING_NOT_FOUND');
  }
  if (record.status === 'CANCELLED') {
    throw AppError.conflict('Cette téléconsultation est déjà annulée.', 'MEETING_ALREADY_CANCELLED');
  }
  if (record.status === 'COMPLETED') {
    throw AppError.conflict(
      'Une téléconsultation terminée ne peut plus être annulée.',
      'MEETING_COMPLETED',
    );
  }

  if (record.zoom_meeting_id) {
    try {
      await deleteZoomMeeting(record.zoom_meeting_id);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[meetings] réunion Zoom non supprimée :', error);
    }
  }

  await repository.cancelMeeting(id);
  return getById(id);
}

/* -------------------------------------------------------------------------- */
/* Connexion et signature                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Jeton de connexion au Meeting SDK.
 *
 * @throws AppError 409 `JOIN_WINDOW_CLOSED` hors de la fenêtre de connexion.
 */
export async function getJoinToken(id: number, user: AuthUser): Promise<MeetingJoinToken> {
  const meeting = await getById(id);
  assertMeetingAccess(user, meeting);

  if (!meeting.zoom_meeting_id) {
    throw AppError.conflict(
      'La réunion n’a pas encore été créée : la demande doit d’abord être approuvée.',
      'MEETING_NOT_READY',
    );
  }

  if (!isJoinWindowOpen(meeting.start_time, meeting.duration)) {
    throw AppError.conflict(
      `La salle de téléconsultation ouvre ${JOIN_WINDOW_MINUTES} minutes avant l’heure prévue et se ferme à la fin de la séance.`,
      'JOIN_WINDOW_CLOSED',
      {
        startTime: meeting.start_time,
        duration: meeting.duration,
        windowMinutes: JOIN_WINDOW_MINUTES,
      },
    );
  }

  return {
    meetingNumber: meeting.zoom_meeting_id,
    password: meeting.password,
    joinUrl: meeting.join_url,
    role: resolveRole(user, meeting, isConcernedPatient(user, meeting) ? 0 : 1),
    userName: fullName(user),
    expiresInMinutes: JOIN_TOKEN_TTL_MINUTES,
    simulated: !isZoomConfigured(),
  };
}

/**
 * Signature Zoom Meeting SDK (`MeetingSignature` partagé).
 * Contrairement au jeton de connexion, la fenêtre n'a pas à être ouverte : le
 * front peut préparer le SDK à l'avance.
 */
export async function getSignature(
  id: number,
  role: 0 | 1,
  user: AuthUser,
): Promise<MeetingSignature> {
  const meeting = await getById(id);
  assertMeetingAccess(user, meeting);

  if (!meeting.zoom_meeting_id) {
    throw AppError.conflict(
      'La réunion n’a pas encore été créée : la demande doit d’abord être approuvée.',
      'MEETING_NOT_READY',
    );
  }

  const effectiveRole = resolveRole(user, meeting, role);
  const signature = generateZoomSignature(
    meeting.zoom_meeting_id,
    effectiveRole,
    fullName(user),
  );

  // `generateZoomSignature` renvoie un mot de passe vide : le code d'accès réel
  // est celui de la réunion, stocké en base à l'approbation.
  return { ...signature, password: meeting.password ?? '' };
}
