/**
 * Règles métier du module « rendez-vous ».
 *
 * Points d'attention :
 *  - un médecin ne peut pas avoir deux rendez-vous qui se chevauchent : le
 *    contrôle a lieu avant toute écriture, et le message d'erreur précise le
 *    créneau déjà occupé ;
 *  - un rendez-vous `TELEMEDICINE` crée automatiquement la réunion Zoom
 *    correspondante (statut `PENDING`) ;
 *  - l'annulation d'un rendez-vous annule la réunion liée ;
 *  - la suppression est refusée si une consultation existe et que l'auteur
 *    n'a pas le droit de supprimer des consultations.
 */

import {
  type Appointment,
  type AppointmentStatus,
  type AppointmentType,
  type CreateAppointmentInput,
  type Paginated,
  type PublicBookingInput,
  hasPermission,
} from '@mediclinic/shared';

import { withTransaction } from '../../config/db.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { toMySqlDate, toMySqlDateTime } from '../../utils/datetime.js';
import { paginated, parsePagination } from '../../utils/pagination.js';
import * as repository from './appointments.repository.js';
import type {
  AppointmentChanges,
  AppointmentConsultationRow,
  AppointmentRow,
} from './appointments.repository.js';

/** Durée appliquée à une réservation en ligne (le formulaire public ne la demande pas). */
const PUBLIC_BOOKING_DURATION = 30;

/** Statuts considérés comme figés : on n'en sort qu'avec un motif et une habilitation. */
const LOCKED_STATUSES: readonly AppointmentStatus[] = ['COMPLETED', 'CANCELLED'];

/* -------------------------------------------------------------------------- */
/* Types d'entrée                                                             */
/* -------------------------------------------------------------------------- */

/** Query string de `GET /api/appointments` (déjà validée et convertie par Zod). */
export interface AppointmentListQuery {
  page: number;
  limit: number;
  search?: string;
  sort?: string;
  order: 'asc' | 'desc';
  status?: AppointmentStatus;
  type?: AppointmentType;
  doctorId?: number;
  patientId?: number;
  departmentId?: number;
  from?: string;
  to?: string;
}

/** Corps de `PATCH /api/appointments/:id` (sortie de `updateAppointmentSchema`). */
export interface UpdateAppointmentPayload {
  doctorId?: number;
  departmentId?: number | null;
  scheduledAt?: string;
  duration?: number;
  type?: AppointmentType;
  reason?: string;
  notes?: string;
  status?: AppointmentStatus;
}

/** Une journée de l'agenda. */
export interface CalendarDay {
  date: string;
  count: number;
  appointments: Appointment[];
}

/** Résultat d'une réservation en ligne. */
export interface PublicBookingResult {
  appointment: Appointment;
  patientCreated: boolean;
}

/* -------------------------------------------------------------------------- */
/* Conversions                                                                */
/* -------------------------------------------------------------------------- */

/** Convertit une ligne de la vue en `Appointment` exposé par l'API. */
export function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    patient_id: row.patient_id,
    patient_name: row.patient_name,
    doctor_id: row.doctor_id,
    doctor_name: row.doctor_name,
    department_id: row.department_id,
    department_name: row.department_name,
    scheduled_at: row.scheduled_at,
    duration: row.duration,
    status: row.status,
    type: row.type,
    reason: row.reason,
    notes: row.notes,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

/** Traduit la query string en filtres de repository. */
function toFilters(query: AppointmentListQuery): repository.AppointmentFilters {
  return {
    from: query.from,
    to: query.to,
    status: query.status,
    type: query.type,
    doctorId: query.doctorId,
    patientId: query.patientId,
    departmentId: query.departmentId,
    search: query.search,
  };
}

/** Complète un nombre sur deux chiffres. */
const pad = (value: number): string => String(value).padStart(2, '0');

/** Formate « JJ/MM/AAAA HH:MM » à partir d'une date MySQL locale. */
function formatDateTime(value: string): string {
  const date = new Date(value.replace(' ', 'T'));
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Formate un créneau « JJ/MM/AAAA HH:MM – HH:MM ». */
function formatSlot(scheduledAt: string, duration: number): string {
  const start = new Date(scheduledAt.replace(' ', 'T'));
  const end = new Date(start.getTime() + duration * 60_000);
  return `${formatDateTime(scheduledAt)} – ${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

/* -------------------------------------------------------------------------- */
/* Contrôles métier                                                           */
/* -------------------------------------------------------------------------- */

/** Vérifie l'existence du dossier patient (422). */
async function assertPatientExists(patientId: number): Promise<void> {
  if (!(await repository.patientExists(patientId))) {
    throw AppError.unprocessable(
      'Le patient sélectionné n’existe pas dans le dossier de la clinique.',
      'PATIENT_NOT_FOUND',
    );
  }
}

/** Vérifie l'existence du médecin (422) et renvoie son nom affichable. */
async function assertDoctorExists(doctorId: number): Promise<string> {
  const name = await repository.findDoctorName(doctorId);
  if (name === null) {
    throw AppError.unprocessable('Le médecin sélectionné n’existe pas.', 'DOCTOR_NOT_FOUND');
  }
  return name;
}

/** Un nouveau rendez-vous doit être planifié dans le futur (422). */
function assertScheduledInFuture(scheduledAt: string): void {
  const date = new Date(scheduledAt.replace(' ', 'T'));
  if (date.getTime() <= Date.now()) {
    throw AppError.unprocessable(
      'La date et l’heure du rendez-vous doivent être postérieures à maintenant.',
      'SCHEDULED_IN_PAST',
    );
  }
}

/**
 * Refuse un créneau déjà occupé par un autre rendez-vous du même médecin (409).
 * Le message reprend le nom du médecin et le créneau en conflit.
 */
async function assertSlotIsFree(options: {
  doctorId: number;
  scheduledAt: string;
  duration: number;
  excludeId?: number;
}): Promise<void> {
  const conflict = await repository.findOverlapping(options);
  if (!conflict) return;

  throw AppError.conflict(
    `Ce créneau est déjà réservé par un autre rendez-vous du ${conflict.doctor_name} ` +
      `(${formatSlot(conflict.scheduled_at, conflict.duration)}).`,
    'APPOINTMENT_SLOT_TAKEN',
  );
}

/**
 * Garde-fou de transition de statut : sortir d'un rendez-vous terminé ou
 * annulé exige la permission `appointment:update` **et** un motif.
 */
function assertStatusTransitionAllowed(
  current: AppointmentStatus,
  next: AppointmentStatus,
  reason: string | undefined,
  permissions: readonly string[],
): void {
  if (current === next) return;
  if (!LOCKED_STATUSES.includes(current)) return;

  if (!hasPermission(permissions, 'appointment:update')) {
    throw AppError.forbidden(
      'Un rendez-vous terminé ou annulé ne peut être modifié que par un utilisateur habilité.',
      'APPOINTMENT_STATUS_LOCKED',
    );
  }
  if (reason === undefined || reason.trim() === '') {
    throw AppError.unprocessable(
      'Un motif est obligatoire pour modifier le statut d’un rendez-vous terminé ou annulé.',
      'STATUS_REASON_REQUIRED',
    );
  }
}

/** Charge le rendez-vous ou lève un 404. */
async function getRowOrFail(id: number): Promise<AppointmentRow> {
  const row = await repository.findById(id);
  if (!row) {
    throw AppError.notFound('Rendez-vous introuvable.', 'APPOINTMENT_NOT_FOUND');
  }
  return row;
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                   */
/* -------------------------------------------------------------------------- */

/** Liste paginée des rendez-vous. */
export async function list(query: AppointmentListQuery): Promise<Paginated<Appointment>> {
  const pagination = parsePagination(query);
  const filters = toFilters(query);

  const [rows, total] = await Promise.all([
    repository.listAppointments({ filters, pagination, sort: query.sort, order: query.order }),
    repository.countAppointments(filters),
  ]);

  return paginated(rows.map(toAppointment), total, pagination);
}

/** Rendez-vous du jour, triés par heure. */
export async function today(): Promise<Appointment[]> {
  const day = toMySqlDate(new Date()) as string;
  const rows = await repository.findForDateRange(day, day, 'asc');
  return rows.map(toAppointment);
}

/** Bornes de la semaine courante (lundi → dimanche). */
function currentWeekRange(): { from: string; to: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = dimanche
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetToMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

  return {
    from: toMySqlDate(monday) as string,
    to: toMySqlDate(sunday) as string,
  };
}

/** Agenda groupé par jour sur une plage de dates (défaut : semaine courante). */
export async function calendar(from?: string, to?: string): Promise<CalendarDay[]> {
  const week = currentWeekRange();
  const start = toMySqlDate(from) ?? week.from;
  const end = toMySqlDate(to) ?? week.to;

  if (end < start) {
    throw AppError.badRequest(
      'La date de fin de la plage doit être postérieure ou égale à la date de début.',
      'INVALID_DATE_RANGE',
    );
  }

  const rows = await repository.findForDateRange(start, end, 'asc');

  // `Map` conserve l'ordre d'insertion : les journées restent chronologiques.
  const groups = new Map<string, Appointment[]>();
  for (const row of rows) {
    const appointment = toAppointment(row);
    const existing = groups.get(row.appointment_date);
    if (existing) existing.push(appointment);
    else groups.set(row.appointment_date, [appointment]);
  }

  return [...groups.entries()].map(([date, appointments]) => ({
    date,
    count: appointments.length,
    appointments,
  }));
}

/** Rendez-vous du patient connecté (403 pour tout autre profil). */
export async function mine(user: AuthUser): Promise<Appointment[]> {
  if (user.patientId === null) {
    throw AppError.forbidden(
      'Cette ressource est réservée aux comptes patients.',
      'NOT_A_PATIENT_ACCOUNT',
    );
  }

  const rows = await repository.findByPatient(user.patientId);
  return rows.map(toAppointment);
}

/** Détail d'un rendez-vous, accompagné de sa consultation éventuelle. */
export async function detail(
  id: number,
): Promise<Appointment & { consultation: AppointmentConsultationRow | null }> {
  const row = await getRowOrFail(id);
  const consultation = await repository.findConsultationForAppointment(id);
  return { ...toAppointment(row), consultation };
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                  */
/* -------------------------------------------------------------------------- */

/** Crée un rendez-vous (et la réunion Zoom si le type est `TELEMEDICINE`). */
export async function create(input: CreateAppointmentInput, user: AuthUser): Promise<Appointment> {
  const scheduledAt = toMySqlDateTime(input.scheduledAt);
  if (scheduledAt === null) {
    throw AppError.unprocessable(
      'La date et l’heure du rendez-vous sont invalides.',
      'INVALID_SCHEDULED_AT',
    );
  }

  await assertPatientExists(input.patientId);
  await assertDoctorExists(input.doctorId);
  assertScheduledInFuture(scheduledAt);
  await assertSlotIsFree({
    doctorId: input.doctorId,
    scheduledAt,
    duration: input.duration,
  });

  const appointmentId = await withTransaction(async (connection) => {
    const created = await repository.insertAppointment(
      {
        patientId: input.patientId,
        doctorId: input.doctorId,
        departmentId: input.departmentId ?? null,
        scheduledAt,
        duration: input.duration,
        status: 'PENDING',
        type: input.type,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        createdBy: user.id,
      },
      connection,
    );

    // Une téléconsultation s'accompagne toujours d'une demande de réunion Zoom.
    if (input.type === 'TELEMEDICINE') {
      await repository.insertMeeting(
        {
          appointmentId: created,
          patientId: input.patientId,
          doctorId: input.doctorId,
          reason: input.reason ?? 'Téléconsultation',
          preferredAt: scheduledAt,
          duration: input.duration,
          requestedBy: user.id,
        },
        connection,
      );
    }

    return created;
  });

  return toAppointment(await getRowOrFail(appointmentId));
}

/** Met à jour partiellement un rendez-vous (replanification comprise). */
export async function update(
  id: number,
  input: UpdateAppointmentPayload,
  user: AuthUser,
): Promise<Appointment> {
  const current = await getRowOrFail(id);
  const changes: AppointmentChanges = {};

  if (input.doctorId !== undefined) {
    await assertDoctorExists(input.doctorId);
    changes.doctor_id = input.doctorId;
  }
  if (input.departmentId !== undefined) {
    changes.department_id = input.departmentId;
  }
  if (input.scheduledAt !== undefined) {
    const scheduledAt = toMySqlDateTime(input.scheduledAt);
    if (scheduledAt === null) {
      throw AppError.unprocessable(
        'La date et l’heure du rendez-vous sont invalides.',
        'INVALID_SCHEDULED_AT',
      );
    }
    changes.scheduled_at = scheduledAt;
  }
  if (input.duration !== undefined) {
    changes.duration = input.duration;
  }
  if (input.type !== undefined) {
    changes.type = input.type;
  }
  if (input.status !== undefined) {
    assertStatusTransitionAllowed(current.status, input.status, input.reason, user.permissions);
    changes.status = input.status;
    if (input.status === 'CANCELLED') {
      // Le motif fourni devient le motif d'annulation, pas le motif de visite.
      const reason = input.reason?.trim();
      if (reason === undefined || reason === '') {
        throw AppError.unprocessable(
          'Un motif d’annulation est obligatoire pour annuler un rendez-vous.',
          'CANCELLED_REASON_REQUIRED',
        );
      }
      changes.cancelled_reason = reason;
    }
  }
  if (input.reason !== undefined && input.status !== 'CANCELLED') {
    changes.reason = input.reason;
  }
  if (input.notes !== undefined) {
    changes.notes = input.notes;
  }

  // Seuls le médecin, l'horaire ou la durée peuvent créer un chevauchement.
  if (
    changes.doctor_id !== undefined ||
    changes.scheduled_at !== undefined ||
    changes.duration !== undefined
  ) {
    await assertSlotIsFree({
      doctorId: changes.doctor_id ?? current.doctor_id,
      scheduledAt: changes.scheduled_at ?? current.scheduled_at,
      duration: changes.duration ?? current.duration,
      excludeId: id,
    });
  }

  await withTransaction(async (connection) => {
    await repository.updateAppointment(id, changes, connection);
    if (changes.status === 'CANCELLED') {
      await repository.cancelMeetingForAppointment(id, connection);
    }
  });

  return toAppointment(await getRowOrFail(id));
}

/** Change le statut d'un rendez-vous (les règles d'annulation s'appliquent). */
export async function updateStatus(
  id: number,
  payload: { status: AppointmentStatus; reason?: string },
  user: AuthUser,
): Promise<Appointment> {
  const current = await getRowOrFail(id);
  assertStatusTransitionAllowed(current.status, payload.status, payload.reason, user.permissions);

  const changes: AppointmentChanges = { status: payload.status };
  if (payload.status === 'CANCELLED') {
    const reason = payload.reason?.trim();
    if (reason === undefined || reason === '') {
      throw AppError.unprocessable(
        'Un motif d’annulation est obligatoire pour annuler un rendez-vous.',
        'CANCELLED_REASON_REQUIRED',
      );
    }
    changes.cancelled_reason = reason;
  }

  await withTransaction(async (connection) => {
    await repository.updateAppointment(id, changes, connection);
    if (payload.status === 'CANCELLED') {
      await repository.cancelMeetingForAppointment(id, connection);
    }
  });

  return toAppointment(await getRowOrFail(id));
}

/** Supprime un rendez-vous (409 s'il porte une consultation et que l'auteur n'y est pas habilité). */
export async function remove(id: number, user: AuthUser): Promise<void> {
  const current = await getRowOrFail(id);

  if (current.consultation_id !== null) {
    const consultations = await repository.countConsultations(id);
    if (consultations > 0 && !hasPermission(user.permissions, 'consultation:delete')) {
      throw AppError.conflict(
        'Ce rendez-vous porte une consultation : sa suppression exige la permission « consultation:delete ».',
        'APPOINTMENT_HAS_CONSULTATION',
      );
    }
  }

  await repository.deleteAppointment(id);
}

/**
 * Réservation en ligne (route publique).
 *
 * Le patient est retrouvé par email ou téléphone ; à défaut, un dossier
 * minimal est créé. Le rendez-vous est enregistré en `PENDING` et les
 * réceptionnistes reçoivent une notification.
 */
export async function publicBooking(input: PublicBookingInput): Promise<PublicBookingResult> {
  const scheduledAt = toMySqlDateTime(input.scheduledAt);
  if (scheduledAt === null) {
    throw AppError.unprocessable(
      'La date et l’heure demandées sont invalides.',
      'INVALID_SCHEDULED_AT',
    );
  }

  const doctorName = await assertDoctorExists(input.doctorId);
  const phone = input.phone ?? null;

  const result = await withTransaction(async (connection) => {
    // 1. Le créneau doit être libre avant toute création de dossier.
    const conflict = await repository.findOverlapping({
      doctorId: input.doctorId,
      scheduledAt,
      duration: PUBLIC_BOOKING_DURATION,
      connection,
    });
    if (conflict) {
      throw AppError.conflict(
        `Ce créneau est déjà réservé par un autre rendez-vous du ${conflict.doctor_name} ` +
          `(${formatSlot(conflict.scheduled_at, conflict.duration)}).`,
        'APPOINTMENT_SLOT_TAKEN',
      );
    }

    // 2. Patient existant (email ou téléphone) ou dossier minimal.
    let patientId = await repository.findPatientIdByEmailOrPhone(input.email, phone, connection);
    let patientCreated = false;

    if (patientId === null) {
      patientId = await repository.insertPatient(
        {
          firstName: input.firstName,
          lastName: input.lastName,
          // La date de naissance et le genre ne sont pas exigés du formulaire
          // public : on stocke des valeurs neutres, à compléter à l'accueil.
          birthDate: toMySqlDate(input.birthDate ?? null) ?? '1900-01-01',
          gender: input.gender ?? 'OTHER',
          email: input.email,
          phone,
        },
        connection,
      );
      patientCreated = true;
    }

    // 3. Rendez-vous en attente de confirmation par le secrétariat.
    const appointmentId = await repository.insertAppointment(
      {
        patientId,
        doctorId: input.doctorId,
        departmentId: null,
        scheduledAt,
        duration: PUBLIC_BOOKING_DURATION,
        status: 'PENDING',
        // Une prise de rendez-vous en ligne est toujours présentielle : la
        // téléconsultation passe par une demande de réunion dédiée.
        type: 'IN_PERSON',
        reason: input.reason,
        notes: null,
        createdBy: null,
      },
      connection,
    );

    // 4. Alerte des réceptionnistes (une notification par utilisateur).
    const receptionists = await repository.listReceptionistUserIds(connection);
    for (const userId of receptionists) {
      await repository.insertNotification(
        {
          userId,
          title: 'Nouvelle demande de rendez-vous en ligne',
          message:
            `${input.firstName} ${input.lastName} demande un rendez-vous avec ${doctorName} ` +
            `le ${formatSlot(scheduledAt, PUBLIC_BOOKING_DURATION)} (motif : ${input.reason}).`,
          type: 'INFO',
          link: `/appointments/${appointmentId}`,
        },
        connection,
      );
    }

    return { appointmentId, patientCreated };
  });

  return {
    appointment: toAppointment(await getRowOrFail(result.appointmentId)),
    patientCreated: result.patientCreated,
  };
}
