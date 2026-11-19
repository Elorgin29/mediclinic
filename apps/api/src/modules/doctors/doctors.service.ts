/**
 * Règles métier des médecins.
 *
 * Règles appliquées ici :
 *  - le numéro d'ordre est unique et un compte utilisateur ne peut porter qu'un
 *    seul profil médecin (409) ;
 *  - un profil peut être créé sur un compte existant (`userId`) ou en créant le
 *    compte dans la même transaction (email + mot de passe + identité), avec
 *    attribution automatique du rôle DOCTOR ;
 *  - un médecin ayant des rendez-vous ou des consultations n'est pas supprimable
 *    (409) : son historique doit rester consultable ; le compte utilisateur,
 *    lui, n'est jamais supprimé ;
 *  - la suppression d'un profil n'entraîne jamais celle du compte.
 * Aucune chaîne SQL dans ce fichier : tout passe par le repository.
 */

import { type Doctor, type DoctorPublic, type Paginated } from '@mediclinic/shared';

import { AppError } from '../../utils/app-error.js';
import { addMinutes, nowSql, toMySqlDate } from '../../utils/datetime.js';
import { paginated, type Pagination } from '../../utils/pagination.js';
import { hashPassword } from '../auth/auth.service.js';
import * as repository from './doctors.repository.js';
import type { DoctorRow } from './doctors.repository.js';

/* -------------------------------------------------------------------------- */
/* Conversions                                                                 */
/* -------------------------------------------------------------------------- */

/** Convertit une ligne de la vue `v_doctor_directory` en objet `Doctor`. */
export function toDoctor(row: DoctorRow): Doctor {
  return {
    id: row.doctor_id,
    user_id: row.user_id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    specialty_id: row.specialty_id,
    specialty_name: row.specialty_name,
    department_id: row.department_id,
    department_name: row.department_name,
    license_number: row.license_number,
    // DECIMAL : le pilote renvoie une chaîne, on la conserve telle quelle.
    consultation_fee: row.consultation_fee,
    bio: row.bio,
    is_accepting_patients: Boolean(row.is_accepting_patients),
    created_at: String(row.created_at),
  };
}

/** Convertit une ligne de la vue en fiche d'annuaire public. */
export function toDoctorPublic(row: DoctorRow): DoctorPublic {
  return {
    id: row.doctor_id,
    first_name: row.first_name,
    last_name: row.last_name,
    specialty_name: row.specialty_name,
    department_name: row.department_name,
    bio: row.bio,
    consultation_fee: row.consultation_fee,
  };
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

export interface DoctorListQuery {
  specialtyId?: number;
  departmentId?: number;
  accepting?: boolean;
  search?: string;
  sort?: string;
  order?: string;
}

/** Liste paginée des médecins (filtres : spécialité, département, annuaire, recherche). */
export async function list(
  query: DoctorListQuery,
  pagination: Pagination,
): Promise<Paginated<Doctor>> {
  const filters: repository.DoctorFilters = {
    specialtyId: query.specialtyId,
    departmentId: query.departmentId,
    accepting: query.accepting,
    search: query.search,
  };

  const [rows, total] = await Promise.all([
    repository.findAll({
      filters,
      sort: query.sort,
      order: query.order,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    repository.count(filters),
  ]);

  return paginated(rows.map(toDoctor), total, pagination);
}

/** Annuaire public : médecins actifs acceptant de nouveaux patients. */
export async function listPublicDirectory(params: {
  specialtyId?: number;
  search?: string;
}): Promise<DoctorPublic[]> {
  const rows = await repository.findPublicDirectory(params);
  return rows.map(toDoctorPublic);
}

/** Fiche médecin enrichie de deux statistiques d'activité. */
export interface DoctorDetail extends Doctor {
  /** Rendez-vous à venir, hors annulés et absences. */
  upcoming_appointments: number;
  /** Consultations déjà enregistrées. */
  completed_consultations: number;
}

/**
 * Récupère un médecin par son identifiant.
 * @throws AppError 404 si le médecin n'existe pas.
 */
export async function getById(id: number): Promise<Doctor> {
  const row = await repository.findById(id);
  if (!row) throw AppError.notFound('Ce médecin est introuvable.', 'DOCTOR_NOT_FOUND');
  return toDoctor(row);
}

/**
 * Détail complet d'un médecin et statistiques simples d'activité.
 * @throws AppError 404 si le médecin n'existe pas.
 */
export async function getDetail(id: number): Promise<DoctorDetail> {
  const doctor = await getById(id);
  const [upcoming, completed] = await Promise.all([
    repository.countUpcomingAppointments(id),
    repository.countConsultations(id),
  ]);

  return { ...doctor, upcoming_appointments: upcoming, completed_consultations: completed };
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

export interface CreateDoctorInput {
  /** Compte utilisateur existant auquel rattacher le profil. */
  userId?: number;
  specialtyId: number;
  departmentId?: number | null;
  licenseNumber: string;
  consultationFee: number;
  bio?: string;
  isAcceptingPatients?: boolean;
  /** Voie « création du compte simultanée ». */
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/** Vérifie qu'une spécialité existe. */
async function assertSpecialtyExists(specialtyId: number): Promise<void> {
  if (!(await repository.specialtyExists(specialtyId))) {
    throw AppError.unprocessable('La spécialité indiquée est introuvable.', 'SPECIALTY_NOT_FOUND', {
      specialty_id: specialtyId,
    });
  }
}

/** Vérifie qu'un département existe (un département null est accepté). */
async function assertDepartmentExists(departmentId: number): Promise<void> {
  if (!(await repository.departmentExists(departmentId))) {
    throw AppError.unprocessable('Le département indiqué est introuvable.', 'DEPARTMENT_NOT_FOUND', {
      department_id: departmentId,
    });
  }
}

/**
 * Crée un profil médecin, sur un compte existant ou en créant le compte.
 * @throws AppError 409 si le numéro d'ordre ou le compte est déjà utilisé,
 *         422 si une référence (spécialité, département) est inconnue.
 */
export async function create(input: CreateDoctorInput): Promise<Doctor> {
  await assertSpecialtyExists(input.specialtyId);

  if (input.departmentId !== undefined && input.departmentId !== null) {
    await assertDepartmentExists(input.departmentId);
  }

  const existingLicense = await repository.findIdByLicenseNumber(input.licenseNumber);
  if (existingLicense !== null) {
    throw AppError.conflict(
      `Le numéro d'ordre « ${input.licenseNumber} » est déjà utilisé par un autre médecin.`,
      'LICENSE_NUMBER_TAKEN',
      { license_number: input.licenseNumber },
    );
  }

  const values: repository.DoctorProfileValues = {
    specialtyId: input.specialtyId,
    departmentId: input.departmentId ?? null,
    licenseNumber: input.licenseNumber,
    consultationFee: input.consultationFee,
    bio: input.bio ?? null,
    isAcceptingPatients: input.isAcceptingPatients ?? true,
  };

  let doctorId: number;

  if (input.userId !== undefined) {
    // Voie 1 : le compte utilisateur existe déjà (créé par l'administration).
    const account = await repository.findUserAccount(input.userId);
    if (!account) {
      throw AppError.unprocessable('Le compte utilisateur indiqué est introuvable.', 'USER_ACCOUNT_NOT_FOUND', {
        user_id: input.userId,
      });
    }

    const existingProfile = await repository.findIdByUserId(input.userId);
    if (existingProfile !== null) {
      throw AppError.conflict(
        'Ce compte utilisateur possède déjà un profil médecin.',
        'DOCTOR_PROFILE_EXISTS',
        { user_id: input.userId, doctor_id: existingProfile },
      );
    }

    doctorId = await repository.createProfile(input.userId, values);
  } else {
    // Voie 2 : le compte est créé dans la même transaction que le profil.
    if (
      input.email === undefined ||
      input.password === undefined ||
      input.firstName === undefined ||
      input.lastName === undefined
    ) {
      throw AppError.badRequest(
        'Indiquez soit « userId », soit l’email, le mot de passe, le prénom et le nom du médecin.',
        'DOCTOR_ACCOUNT_INCOMPLETE',
      );
    }

    const existingUser = await repository.findUserIdByEmail(input.email);
    if (existingUser !== null) {
      throw AppError.conflict('Un compte existe déjà avec cet email.', 'EMAIL_ALREADY_USED', {
        email: input.email,
      });
    }

    const created = await repository.createAccountWithProfile(
      {
        email: input.email,
        passwordHash: await hashPassword(input.password),
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
      },
      values,
    );
    doctorId = created.doctorId;
  }

  return getById(doctorId);
}

export interface UpdateDoctorInput {
  specialtyId?: number;
  departmentId?: number | null;
  licenseNumber?: string;
  consultationFee?: number;
  bio?: string;
  isAcceptingPatients?: boolean;
}

/**
 * Met à jour partiellement un profil médecin (le compte lié n'est pas modifiable ici).
 * @throws AppError 404 si absent, 409 si le numéro d'ordre appartient à un autre,
 *         422 si la spécialité ou le département est inconnu.
 */
export async function update(
  id: number,
  input: UpdateDoctorInput,
): Promise<{ before: Doctor; after: Doctor }> {
  const before = await getById(id);

  if (input.specialtyId !== undefined) {
    await assertSpecialtyExists(input.specialtyId);
  }
  if (input.departmentId !== undefined && input.departmentId !== null) {
    await assertDepartmentExists(input.departmentId);
  }
  if (input.licenseNumber !== undefined) {
    const conflictId = await repository.findIdByLicenseNumber(input.licenseNumber, id);
    if (conflictId !== null) {
      throw AppError.conflict(
        `Le numéro d'ordre « ${input.licenseNumber} » est déjà utilisé par un autre médecin.`,
        'LICENSE_NUMBER_TAKEN',
        { license_number: input.licenseNumber },
      );
    }
  }

  await repository.update(id, {
    specialtyId: input.specialtyId,
    departmentId: input.departmentId,
    licenseNumber: input.licenseNumber,
    consultationFee: input.consultationFee,
    bio: input.bio,
    isAcceptingPatients: input.isAcceptingPatients,
  });

  return { before, after: await getById(id) };
}

/**
 * Supprime le profil médecin sans historique.
 * @throws AppError 404 si absent, 409 si des rendez-vous ou des consultations
 *         y sont rattachés (le message indique les deux compteurs).
 */
export async function remove(id: number): Promise<Doctor> {
  const doctor = await getById(id);

  const [appointments, consultations] = await Promise.all([
    repository.countAppointments(id),
    repository.countConsultations(id),
  ]);

  if (appointments > 0 || consultations > 0) {
    throw AppError.conflict(
      `Impossible de supprimer le profil du Dr ${doctor.first_name} ${doctor.last_name} : ` +
        `${appointments} rendez-vous et ${consultations} consultation(s) y sont rattachés. ` +
        'Désactivez plutôt son compte utilisateur.',
      'DOCTOR_IN_USE',
      { appointments_count: appointments, consultations_count: consultations },
    );
  }

  await repository.remove(id);
  return doctor;
}

/* -------------------------------------------------------------------------- */
/* Disponibilités                                                              */
/* -------------------------------------------------------------------------- */

/** Créneau de 30 minutes proposé à la prise de rendez-vous. */
export interface AvailabilitySlot {
  start: string;
  end: string;
  available: boolean;
}

export interface DoctorAvailability {
  date: string;
  doctorId: number;
  slots: AvailabilitySlot[];
}

/** Ouverture de la clinique (heure locale) et granularité des créneaux. */
const OPENING_HOUR = 8;
const CLOSING_HOUR = 18;
const SLOT_MINUTES = 30;

/** Formate un nombre de minutes depuis minuit en `'HH:MM:00'`. */
function formatTime(minutesFromMidnight: number): string {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

/**
 * Calcule les créneaux d'une journée.
 *
 * La grille complète 08:00–18:00 est renvoyée, chaque créneau portant son
 * indicateur `available` : un créneau est indisponible s'il chevauche un
 * rendez-vous actif du médecin (statut autre que CANCELLED / NO_SHOW) ou s'il
 * est déjà passé. Conserver les créneaux indisponibles permet au front de les
 * griser plutôt que de les faire disparaître.
 *
 * @throws AppError 404 si le médecin n'existe pas.
 */
export async function getAvailability(doctorId: number, date: string): Promise<DoctorAvailability> {
  await getById(doctorId);

  const normalizedDate = toMySqlDate(date);
  if (normalizedDate === null) {
    throw AppError.badRequest('La date demandée est invalide.', 'INVALID_DATE');
  }

  const dayStart = `${normalizedDate} 00:00:00`;
  const nextDay = new Date(`${normalizedDate}T00:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);
  const dayEnd = `${toMySqlDate(nextDay) as string} 00:00:00`;

  const busy = await repository.findBusySlots(doctorId, dayStart, dayEnd);
  const occupied = busy.map((row) => ({
    start: String(row.scheduled_at),
    end: addMinutes(row.scheduled_at, row.duration),
  }));

  const now = nowSql();
  const slots: AvailabilitySlot[] = [];

  for (
    let minutes = OPENING_HOUR * 60;
    minutes + SLOT_MINUTES <= CLOSING_HOUR * 60;
    minutes += SLOT_MINUTES
  ) {
    const start = `${normalizedDate} ${formatTime(minutes)}`;
    const end = `${normalizedDate} ${formatTime(minutes + SLOT_MINUTES)}`;
    // Chevauchement : le rendez-vous commence avant la fin du créneau et
    // se termine après son début.
    const overlaps = occupied.some((slot) => slot.start < end && slot.end > start);
    slots.push({ start, end, available: !overlaps && start > now });
  }

  return { date: normalizedDate, doctorId, slots };
}
