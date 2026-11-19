/**
 * Règles métier du module patients.
 *
 * Le service convertit systématiquement les entrées camelCase de l'API
 * (`firstName`, `bloodGroup`, `emergencyContactName`...) vers les colonnes
 * snake_case de MySQL : les contrôleurs ne manipulent que des objets validés
 * et le repository ne connaît que des colonnes.
 */

import {
  type Appointment,
  type BloodGroup,
  type Consultation,
  type Gender,
  type Invoice,
  type Paginated,
  type Patient,
  type PatientHistory,
  type Prescription,
  type PrescriptionItem,
  type User,
} from '@mediclinic/shared';
import bcrypt from 'bcrypt';

import { env } from '../../config/env.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { compact, buildSetClause } from '../../utils/http.js';
import { buildOrderBy, likePattern, paginated, type Pagination } from '../../utils/pagination.js';
import * as repository from './patients.repository.js';
import type {
  HistoryEntryRecord,
  PatientAppointmentRecord,
  PatientConsultationRecord,
  PatientInvoiceRecord,
  PatientPrescriptionRecord,
  PatientRecord,
  PrescriptionItemRecord,
} from './patients.repository.js';

/* -------------------------------------------------------------------------- */
/* Entrées du service                                                          */
/* -------------------------------------------------------------------------- */

export interface PatientListFilters {
  search?: string | undefined;
  gender?: string | undefined;
  bloodGroup?: string | undefined;
  sort?: string | undefined;
  order?: string | undefined;
}

/**
 * Colonnes de tri autorisées (liste blanche) : la clé reçue du client est
 * traduite en expression SQL connue, jamais concaténée telle quelle.
 */
const SORTABLE_COLUMNS: Readonly<Record<string, string>> = {
  last_name: 'last_name',
  created_at: 'created_at',
  birth_date: 'birth_date',
};

/** Entrée de chronologie dérivée de la vue `v_patient_history`. */
export interface TimelineEntry {
  entry_type: string;
  event_date: string;
  entry_id: number;
  title: string;
  description: string | null;
}

/** Historique complet d'un dossier, augmenté de la chronologie de la vue. */
export interface PatientHistoryPayload extends PatientHistory {
  timeline: TimelineEntry[];
}

/* -------------------------------------------------------------------------- */
/* Conversions ligne SQL → objet exposé                                        */
/* -------------------------------------------------------------------------- */

/** Normalise une valeur textuelle optionnelle renvoyée par MySQL. */
function textOrNull(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** Convertit une ligne `patients` en objet `Patient` exposé par l'API. */
export function toPatient(record: PatientRecord): Patient {
  return {
    id: record.id,
    user_id: record.user_id,
    first_name: record.first_name,
    last_name: record.last_name,
    // DATE avec `dateStrings: true` : la valeur est déjà au format AAAA-MM-JJ.
    birth_date: String(record.birth_date),
    gender: record.gender as Gender,
    address: record.address,
    city: record.city,
    postal_code: record.postal_code,
    phone: record.phone,
    email: record.email,
    blood_group: (record.blood_group as BloodGroup | null) ?? null,
    allergies: record.allergies,
    medical_history: record.medical_history,
    emergency_contact_name: record.emergency_contact_name,
    emergency_contact_phone: record.emergency_contact_phone,
    insurance_number: record.insurance_number,
    created_at: String(record.created_at),
    updated_at: String(record.updated_at),
  };
}

/** Convertit une ligne de la vue des rendez-vous en objet `Appointment`. */
export function toAppointment(record: PatientAppointmentRecord): Appointment {
  const appointment: Appointment = {
    id: record.id,
    patient_id: record.patient_id,
    patient_name: record.patient_name,
    doctor_id: record.doctor_id,
    doctor_name: record.doctor_name,
    department_id: record.department_id,
    scheduled_at: String(record.scheduled_at),
    duration: record.duration,
    status: record.status as Appointment['status'],
    type: record.type as Appointment['type'],
    reason: record.reason,
    notes: record.notes,
    created_by: record.created_by,
    created_at: String(record.created_at),
  };
  if (record.department_name !== null) appointment.department_name = record.department_name;
  return appointment;
}

/** Convertit une ligne de consultation en objet `Consultation`. */
function toConsultation(record: PatientConsultationRecord): Consultation {
  return {
    id: record.id,
    appointment_id: record.appointment_id,
    doctor_id: record.doctor_id,
    doctor_name: record.doctor_name,
    patient_id: record.patient_id,
    patient_name: record.patient_name,
    diagnosis: record.diagnosis,
    notes: record.notes,
    follow_up_at: textOrNull(record.follow_up_at),
    created_at: String(record.created_at),
  };
}

/** Convertit une ligne de `prescription_items` en objet `PrescriptionItem`. */
function toPrescriptionItem(record: PrescriptionItemRecord): PrescriptionItem {
  return {
    id: record.id,
    prescription_id: record.prescription_id,
    medication_id: record.medication_id,
    medication_name: record.medication_name,
    dosage: record.dosage,
    frequency: record.frequency,
    duration: record.duration,
    instructions: record.instructions,
    quantity: record.quantity,
  };
}

/** Convertit une ligne de facture en objet `Invoice` (montants en chaîne). */
function toInvoice(record: PatientInvoiceRecord): Invoice {
  return {
    id: record.id,
    number: record.number,
    patient_id: record.patient_id,
    patient_name: record.patient_name,
    consultation_id: record.consultation_id,
    total_amount: String(record.total_amount),
    paid_amount: String(record.paid_amount),
    vat_rate: String(record.vat_rate),
    status: record.status as Invoice['status'],
    issued_at: String(record.issued_at),
    due_date: String(record.due_date),
    created_at: String(record.created_at),
  };
}

/** Convertit une ligne de la vue d'historique en entrée de chronologie. */
function toTimelineEntry(record: HistoryEntryRecord): TimelineEntry {
  return {
    entry_type: record.entry_type,
    event_date: String(record.event_date),
    entry_id: record.entry_id,
    title: record.title,
    description: record.description,
  };
}

/* -------------------------------------------------------------------------- */
/* Chargement et contrôle d'accès                                              */
/* -------------------------------------------------------------------------- */

/**
 * Charge un dossier patient ou lève une 404.
 * Aucun appelant ne doit réimplémenter ce contrôle.
 */
export async function getPatientOrFail(id: number): Promise<PatientRecord> {
  const record = await repository.findById(id);
  if (!record) {
    throw AppError.notFound('Dossier patient introuvable.', 'PATIENT_NOT_FOUND');
  }
  return record;
}

/**
 * Un compte patient n'accède qu'à son propre dossier.
 *
 * Le rôle PATIENT porte `patient:read` dans la matrice de permissions : sans ce
 * contrôle supplémentaire, il pourrait lire le dossier de n'importe qui. Les
 * membres du personnel (et tout compte disposant de `patient:manage`) gardent
 * l'accès global.
 */
export function assertCanAccessPatient(user: AuthUser, patientId: number): void {
  const isPatientOnly = user.roles.includes('PATIENT') && !user.permissions.includes('patient:manage');
  if (isPatientOnly && user.patientId !== patientId) {
    throw AppError.forbidden(
      'Vous ne pouvez accéder qu’à votre propre dossier médical.',
      'NOT_YOUR_PATIENT',
    );
  }
}

/**
 * Résout le dossier rattaché au compte connecté (routes `/me`).
 * @throws 403 `NOT_A_PATIENT` si le compte n'est pas un compte patient.
 */
export async function resolveOwnPatientId(user: AuthUser): Promise<number> {
  const patientId = user.patientId ?? (await repository.findIdByUserId(user.id));
  if (patientId === null) {
    throw AppError.forbidden('Ce compte n’est pas rattaché à un dossier patient.', 'NOT_A_PATIENT');
  }
  return patientId;
}

/* -------------------------------------------------------------------------- */
/* Liste paginée                                                               */
/* -------------------------------------------------------------------------- */

/** Liste paginée des patients avec recherche et filtres. */
export async function listPatients(
  filters: PatientListFilters,
  pagination: Pagination,
): Promise<Paginated<Patient>> {
  const applied = {
    // Le motif est échappé ici : les jokers `%` et `_` saisis sont neutralisés.
    search: filters.search !== undefined && filters.search.length > 0 ? likePattern(filters.search) : undefined,
    gender: filters.gender,
    bloodGroup: filters.bloodGroup,
  };

  const orderBy = buildOrderBy(filters.sort, filters.order, SORTABLE_COLUMNS, 'last_name', 'asc');

  const [rows, total] = await Promise.all([
    repository.list(applied, orderBy, pagination.limit, pagination.offset),
    repository.count(applied),
  ]);

  return paginated(rows.map(toPatient), total, pagination);
}

/* -------------------------------------------------------------------------- */
/* Création                                                                    */
/* -------------------------------------------------------------------------- */

export interface CreatePatientData {
  userId: number | null;
  values: Record<string, unknown>;
}

/**
 * Prépare la création d'un dossier patient.
 *
 * Si l'email fourni correspond déjà à un compte utilisateur, le dossier est
 * rattaché à ce compte (secrétariat qui complète un compte existant) au lieu
 * d'échouer sur la contrainte d'unicité. Un compte ne peut porter qu'un seul
 * dossier : le doublon est refusé en 409.
 */
export async function prepareCreate(input: {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  address?: string | undefined;
  city?: string | undefined;
  postalCode?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  bloodGroup?: string | undefined;
  allergies?: string | undefined;
  medicalHistory?: string | undefined;
  emergencyContactName?: string | undefined;
  emergencyContactPhone?: string | undefined;
  insuranceNumber?: string | undefined;
}): Promise<CreatePatientData> {
  let userId: number | null = null;

  if (input.email !== undefined && input.email.length > 0) {
    const existingUserId = await repository.findUserIdByEmail(input.email);
    if (existingUserId !== null) {
      const alreadyLinked = await repository.findIdByUserId(existingUserId);
      if (alreadyLinked !== null) {
        throw AppError.conflict(
          'Un dossier patient est déjà rattaché à ce compte utilisateur.',
          'PATIENT_ALREADY_LINKED',
        );
      }
      userId = existingUserId;
    }
  }

  return {
    userId,
    // `compact` retire les champs non fournis : l'insertion reste partielle.
    values: compact({
      user_id: userId,
      first_name: input.firstName,
      last_name: input.lastName,
      birth_date: input.birthDate,
      gender: input.gender,
      address: input.address,
      city: input.city,
      postal_code: input.postalCode,
      phone: input.phone,
      email: input.email !== undefined && input.email.length > 0 ? input.email : undefined,
      blood_group: input.bloodGroup,
      allergies: input.allergies,
      medical_history: input.medicalHistory,
      emergency_contact_name: input.emergencyContactName,
      emergency_contact_phone: input.emergencyContactPhone,
      insurance_number: input.insuranceNumber,
    }),
  };
}

/** Crée le dossier patient et renvoie l'enregistrement complet. */
export async function createPatient(data: CreatePatientData): Promise<Patient> {
  const id = await repository.create(data.values);
  return toPatient(await getPatientOrFail(id));
}

/* -------------------------------------------------------------------------- */
/* Mise à jour                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Convertit une entrée camelCase partielle en colonnes snake_case.
 * Les clés absentes (`undefined`) sont simplement ignorées : une mise à jour
 * partielle ne doit jamais écraser un champ non transmis par du `NULL`.
 */
function toColumnValues(input: Record<string, unknown>): Record<string, unknown> {
  const mapping: Readonly<Record<string, string>> = {
    firstName: 'first_name',
    lastName: 'last_name',
    birthDate: 'birth_date',
    gender: 'gender',
    address: 'address',
    city: 'city',
    postalCode: 'postal_code',
    phone: 'phone',
    email: 'email',
    bloodGroup: 'blood_group',
    allergies: 'allergies',
    medicalHistory: 'medical_history',
    emergencyContactName: 'emergency_contact_name',
    emergencyContactPhone: 'emergency_contact_phone',
    insuranceNumber: 'insurance_number',
  };

  const values: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(mapping)) {
    const value = input[field];
    if (value === undefined) continue;
    // Une chaîne vide est stockée en `NULL` : plus lisible en base que `''`.
    values[column] = typeof value === 'string' && value.length === 0 ? null : value;
  }
  return values;
}

/** Met à jour partiellement un dossier patient et renvoie l'état résultant. */
export async function updatePatient(
  id: number,
  input: Record<string, unknown>,
): Promise<Patient> {
  const values = toColumnValues(input);
  const { sql, params } = buildSetClause(values, repository.UPDATABLE_COLUMNS);

  await repository.update(id, sql, params);
  return toPatient(await getPatientOrFail(id));
}

/**
 * Met à jour le profil du patient connecté.
 * Le téléphone, lorsqu'il est fourni, est répercuté sur le compte `users`
 * afin que les deux référentiels restent cohérents (notifications, connexion).
 */
export async function updateOwnProfile(
  patient: PatientRecord,
  input: Record<string, unknown>,
): Promise<Patient> {
  const result = await updatePatient(patient.id, input);

  if (typeof input.phone === 'string' && input.phone.length > 0 && patient.user_id !== null) {
    await repository.updateLinkedAccountPhone(patient.user_id, input.phone);
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Suppression                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Supprime un dossier patient.
 * @throws 409 si un historique existe : les rendez-vous, consultations,
 *         factures et demandes d'analyse doivent être conservés.
 */
export async function deletePatient(id: number): Promise<void> {
  const volumes = await repository.countVolumes(id);

  // Les volumes sont détaillés dans le message : le secrétariat comprend
  // immédiatement ce qui bloque la suppression et sur quoi agir.
  const blocking: string[] = [];
  if (volumes.appointments > 0) blocking.push(`${volumes.appointments} rendez-vous`);
  if (volumes.consultations > 0) blocking.push(`${volumes.consultations} consultation(s)`);
  if (volumes.invoices > 0) blocking.push(`${volumes.invoices} facture(s)`);
  if (volumes.labRequests > 0) blocking.push(`${volumes.labRequests} demande(s) d’analyse`);

  if (blocking.length > 0) {
    throw AppError.conflict(
      `Suppression impossible : ce dossier comporte ${blocking.join(', ')}. ` +
        'Archivez le dossier plutôt que de le supprimer.',
      'PATIENT_HAS_HISTORY',
    );
  }

  await repository.remove(id);
}

/* -------------------------------------------------------------------------- */
/* Historique                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Dossier médical consolidé : patient, rendez-vous, consultations, ordonnances
 * (avec leurs lignes), factures, plus la chronologie issue de la vue
 * `v_patient_history`.
 */
export async function getPatientHistory(patientId: number): Promise<PatientHistoryPayload> {
  const record = await getPatientOrFail(patientId);

  const [appointments, consultations, prescriptions, items, invoices, history] = await Promise.all([
    // Le dossier détaillé liste les rendez-vous les plus récents ; la
    // chronologie complète, elle, reste intégralement issue de la vue.
    repository.listAppointments(patientId, 500, 0),
    repository.listConsultations(patientId),
    repository.listPrescriptions(patientId),
    repository.listPrescriptionItems(patientId),
    repository.listInvoices(patientId),
    repository.listHistoryEntries(patientId),
  ]);

  // Les lignes sont regroupées par ordonnance pour éviter une requête par ligne.
  const itemsByPrescription = new Map<number, PrescriptionItem[]>();
  for (const item of items) {
    const bucket = itemsByPrescription.get(item.prescription_id) ?? [];
    bucket.push(toPrescriptionItem(item));
    itemsByPrescription.set(item.prescription_id, bucket);
  }

  const prescriptionList: Prescription[] = prescriptions.map((row: PatientPrescriptionRecord) => ({
    id: row.id,
    consultation_id: row.consultation_id,
    doctor_id: row.doctor_id,
    doctor_name: row.doctor_name,
    issued_at: String(row.issued_at),
    status: row.status as Prescription['status'],
    items: itemsByPrescription.get(row.id) ?? [],
  }));

  return {
    patient: toPatient(record),
    appointments: appointments.map(toAppointment),
    consultations: consultations.map(toConsultation),
    prescriptions: prescriptionList,
    invoices: invoices.map(toInvoice),
    timeline: history.map(toTimelineEntry),
  };
}

/* -------------------------------------------------------------------------- */
/* Rendez-vous du patient                                                      */
/* -------------------------------------------------------------------------- */

/** Rendez-vous paginés d'un patient (vue `v_appointment_details`). */
export async function listPatientAppointments(
  patientId: number,
  pagination: Pagination,
): Promise<Paginated<Appointment>> {
  const [rows, total] = await Promise.all([
    repository.listAppointments(patientId, pagination.limit, pagination.offset),
    repository.countAppointments(patientId),
  ]);

  return paginated(rows.map(toAppointment), total, pagination);
}

/* -------------------------------------------------------------------------- */
/* Compte portail                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Crée un compte portail pour un dossier patient existant et lui attribue le
 * rôle PATIENT. Le mot de passe est haché ici : aucune donnée sensible ne
 * transite vers le repository.
 */
export async function createPortalAccount(
  patient: PatientRecord,
  password: string,
): Promise<User> {
  if (patient.user_id !== null) {
    throw AppError.conflict(
      'Ce patient possède déjà un compte portail.',
      'PATIENT_ACCOUNT_EXISTS',
    );
  }

  const email = patient.email;
  if (email === null || email.length === 0) {
    throw AppError.badRequest(
      'Renseignez d’abord un email sur le dossier patient avant de créer un compte.',
      'PATIENT_EMAIL_REQUIRED',
    );
  }

  const existingUserId = await repository.findUserIdByEmail(email);
  if (existingUserId !== null) {
    throw AppError.conflict(
      'Un compte utilisateur existe déjà avec cet email.',
      'EMAIL_ALREADY_USED',
    );
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const userId = await repository.createPortalAccount({
    patientId: patient.id,
    email,
    passwordHash,
    firstName: patient.first_name,
    lastName: patient.last_name,
    phone: patient.phone,
  });

  const created = await repository.findUserWithRoles(userId);
  if (!created) {
    throw AppError.internal('Le compte portail a été créé mais reste introuvable.', 'USER_NOT_FOUND');
  }

  return toUser(created);
}

/** Convertit une ligne utilisateur (rôles agrégés) en objet `User`. */
function toUser(record: repository.UserRecord): User {
  return {
    id: record.id,
    email: record.email,
    first_name: record.first_name,
    last_name: record.last_name,
    phone: record.phone,
    is_active: Boolean(record.is_active),
    last_login_at: textOrNull(record.last_login_at),
    created_at: String(record.created_at),
    roles: splitList(record.roles),
    permissions: splitList(record.permissions),
    patient_id: record.patient_id,
    doctor_id: record.doctor_id,
  };
}

/** Découpe un `GROUP_CONCAT` en tableau. */
function splitList(value: string | null): string[] {
  return value ? value.split(',').filter((item) => item.length > 0) : [];
}
