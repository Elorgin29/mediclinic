/**
 * Règles métier du module « consultations ».
 *
 * Points d'attention :
 *  - une consultation est indissociable de son rendez-vous : elle en reprend le
 *    médecin, et le rendez-vous passe à `COMPLETED` dans la même transaction ;
 *  - la relation est 1–1 (contrainte `uq_consultations_appointment`) : un second
 *    compte-rendu sur le même rendez-vous est refusé en 409 avec un message
 *    explicite, plutôt que de laisser MySQL renvoyer `ER_DUP_ENTRY` ;
 *  - un rendez-vous annulé ne peut pas recevoir de consultation (422) ;
 *  - les entrées arrivent en camelCase (`appointmentId`, `followUpAt`) : la
 *    conversion vers les colonnes snake_case est faite ici, jamais dans le
 *    contrôleur ni dans le repository.
 */

import {
  type Consultation,
  type Paginated,
  type Prescription,
  type PrescriptionItem,
} from '@mediclinic/shared';

import { withTransaction } from '../../config/db.js';
import { AppError } from '../../utils/app-error.js';
import { toMySqlDate } from '../../utils/datetime.js';
import { buildOrderBy, paginated, type Pagination } from '../../utils/pagination.js';
import * as repository from './consultations.repository.js';
import type {
  ConsultationChanges,
  ConsultationDetailRow,
  ConsultationFilters,
  ConsultationPrescriptionItemRow,
  ConsultationRow,
} from './consultations.repository.js';

/* -------------------------------------------------------------------------- */
/* Types d'entrée et de sortie                                                */
/* -------------------------------------------------------------------------- */

/** Query string de `GET /api/consultations` (déjà validée et convertie par Zod). */
export interface ConsultationListQuery extends ConsultationFilters {
  sort?: string | undefined;
  order?: 'asc' | 'desc' | undefined;
}

/** Corps de `POST /api/consultations` (sortie de `createConsultationSchema`). */
export interface CreateConsultationPayload {
  appointmentId: number;
  diagnosis: string;
  notes?: string | undefined;
  followUpAt?: string | undefined;
}

/** Corps de `PATCH /api/consultations/:id` (sortie de `updateConsultationSchema`). */
export interface UpdateConsultationPayload {
  diagnosis?: string | undefined;
  notes?: string | undefined;
  followUpAt?: string | null | undefined;
}

/**
 * Consultation exposée par l'API : le type partagé complété des agrégats de la
 * vue (spécialité, nombre d'ordonnances et de factures), afin que les écrans de
 * liste n'aient aucune requête supplémentaire à faire.
 */
export interface ConsultationView extends Consultation {
  specialty_name: string;
  patient_birth_date: string;
  prescriptions_count: number;
  invoices_count: number;
}

/** Ligne d'ordonnance complétée de l'unité de délivrance du catalogue. */
export interface ConsultationPrescriptionItem extends PrescriptionItem {
  unit: string;
}

/** Ordonnance d'une consultation, lignes détaillées. */
export interface ConsultationPrescription extends Omit<Prescription, 'items'> {
  items: ConsultationPrescriptionItem[];
}

/** Détail d'une consultation : vue, créneau du rendez-vous et ordonnances. */
export interface ConsultationDetail extends ConsultationView {
  scheduled_at: string;
  appointment_type: ConsultationDetailRow['appointment_type'];
  prescriptions: ConsultationPrescription[];
}

/* -------------------------------------------------------------------------- */
/* Conversions                                                                */
/* -------------------------------------------------------------------------- */

/** Normalise une valeur textuelle optionnelle renvoyée par MySQL. */
function textOrNull(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** Convertit une ligne de la vue en objet exposé par l'API. */
export function toConsultation(row: ConsultationRow): ConsultationView {
  return {
    id: row.id,
    appointment_id: row.appointment_id,
    doctor_id: row.doctor_id,
    doctor_name: row.doctor_name,
    patient_id: row.patient_id,
    patient_name: row.patient_name,
    diagnosis: row.diagnosis,
    notes: row.notes,
    // DATE avec `dateStrings: true` : la valeur est déjà au format AAAA-MM-JJ.
    follow_up_at: textOrNull(row.follow_up_at),
    created_at: String(row.created_at),
    specialty_name: row.specialty_name,
    patient_birth_date: String(row.patient_birth_date),
    prescriptions_count: Number(row.prescriptions_count ?? 0),
    invoices_count: Number(row.invoices_count ?? 0),
  };
}

/** Convertit une ligne de détail en objet exposé par l'API. */
function toConsultationDetail(
  row: ConsultationDetailRow,
): Omit<ConsultationDetail, 'prescriptions'> {
  return {
    ...toConsultation(row),
    scheduled_at: String(row.scheduled_at),
    appointment_type: row.appointment_type,
  };
}

/**
 * Regroupe les lignes jointes en ordonnances complètes.
 * Les lignes arrivent déjà triées par ordonnance puis par identifiant de ligne :
 * `Map` conserve cet ordre, l'API renvoie donc les ordonnances les plus récentes
 * en premier sans tri supplémentaire.
 */
function toPrescriptions(rows: ConsultationPrescriptionItemRow[]): ConsultationPrescription[] {
  const byPrescription = new Map<number, ConsultationPrescription>();

  for (const row of rows) {
    let prescription = byPrescription.get(row.prescription_id);
    if (!prescription) {
      prescription = {
        id: row.prescription_id,
        consultation_id: row.consultation_id,
        doctor_id: row.doctor_id,
        issued_at: String(row.issued_at),
        status: row.prescription_status,
        items: [],
      };
      byPrescription.set(row.prescription_id, prescription);
    }

    const item: ConsultationPrescriptionItem = {
      id: row.item_id,
      prescription_id: row.prescription_id,
      medication_id: row.medication_id,
      medication_name: row.medication_name,
      // L'unité de délivrance vient du catalogue : elle ne figure pas sur la
      // ligne d'ordonnance mais conditionne l'affichage pharmacie.
      unit: row.unit,
      dosage: row.dosage,
      frequency: row.frequency,
      duration: row.duration,
      instructions: row.instructions,
      quantity: Number(row.quantity ?? 0),
    };
    prescription.items.push(item);
  }

  return [...byPrescription.values()];
}

/* -------------------------------------------------------------------------- */
/* Chargement et contrôle d'accès                                             */
/* -------------------------------------------------------------------------- */

/**
 * Charge une consultation ou lève une 404.
 * Aucun appelant ne doit réimplémenter ce contrôle.
 */
export async function getConsultationOrFail(id: number): Promise<ConsultationDetailRow> {
  const row = await repository.findConsultationById(id);
  if (!row) {
    throw AppError.notFound('Consultation introuvable.', 'CONSULTATION_NOT_FOUND');
  }
  return row;
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                   */
/* -------------------------------------------------------------------------- */

/** Liste paginée des consultations (vue `v_consultation_details`). */
export async function list(
  query: ConsultationListQuery,
  pagination: Pagination,
): Promise<Paginated<ConsultationView>> {
  const filters: ConsultationFilters = {
    ...(query.doctorId === undefined ? {} : { doctorId: query.doctorId }),
    ...(query.patientId === undefined ? {} : { patientId: query.patientId }),
    ...(query.from === undefined ? {} : { from: toMySqlDate(query.from) ?? undefined }),
    ...(query.to === undefined ? {} : { to: toMySqlDate(query.to) ?? undefined }),
    // Le motif est déjà échappé par le contrôleur (`likePattern`) : les jokers
    // saisis par l'utilisateur restent neutralisés.
    ...(query.search === undefined ? {} : { search: query.search }),
  };

  const orderBy = buildOrderBy(
    query.sort,
    query.order,
    repository.CONSULTATION_SORT_COLUMNS,
    'v.created_at',
    'desc',
  );

  const [rows, total] = await Promise.all([
    repository.findConsultations({
      filters,
      orderBy,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    repository.countConsultations(filters),
  ]);

  return paginated(rows.map(toConsultation), total, pagination);
}

/** Détail d'une consultation, ordonnances (lignes comprises) incluses. */
export async function detail(id: number): Promise<ConsultationDetail> {
  const row = await getConsultationOrFail(id);
  const prescriptionRows = await repository.findPrescriptionsForConsultation(id);

  return {
    ...toConsultationDetail(row),
    prescriptions: toPrescriptions(prescriptionRows),
  };
}

/** Consultations d'un patient, de la plus récente à la plus ancienne. */
export async function listByPatient(patientId: number): Promise<ConsultationView[]> {
  const rows = await repository.findConsultationsByPatient(patientId);
  return rows.map(toConsultation);
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Crée la consultation d'un rendez-vous.
 *
 * Le rendez-vous est verrouillé par sa ligne dans la transaction : le passage à
 * `COMPLETED` et l'écriture du compte-rendu sont atomiques, aucune consultation
 * ne peut exister sur un rendez-vous resté en attente.
 */
export async function create(input: CreateConsultationPayload): Promise<ConsultationDetail> {
  const followUpAt = input.followUpAt === undefined ? null : toMySqlDate(input.followUpAt);
  if (input.followUpAt !== undefined && followUpAt === null) {
    throw AppError.unprocessable(
      'La date de suivi transmise est invalide.',
      'INVALID_FOLLOW_UP_DATE',
    );
  }

  const consultationId = await withTransaction(async (connection) => {
    const appointment = await repository.findAppointmentForConsultation(
      input.appointmentId,
      connection,
    );
    if (!appointment) {
      throw AppError.notFound(
        'Le rendez-vous associé à cette consultation est introuvable.',
        'APPOINTMENT_NOT_FOUND',
      );
    }

    // La contrainte UNIQUE ne doit pas être la première à parler : le message
    // métier indique quel rendez-vous porte déjà un compte-rendu.
    if (await repository.existsForAppointment(appointment.id, connection)) {
      throw AppError.conflict(
        `Le rendez-vous n° ${appointment.id} possède déjà une consultation : ` +
          'modifiez le compte-rendu existant plutôt que d’en créer un second.',
        'CONSULTATION_ALREADY_EXISTS',
      );
    }

    if (appointment.status === 'CANCELLED') {
      throw AppError.unprocessable(
        'Impossible de saisir une consultation sur un rendez-vous annulé.',
        'APPOINTMENT_CANCELLED',
      );
    }

    const created = await repository.createConsultation(
      {
        appointmentId: appointment.id,
        // Le médecin de la consultation est toujours celui du rendez-vous :
        // le lien clinique ne peut pas être détourné par le client.
        doctorId: appointment.doctor_id,
        diagnosis: input.diagnosis,
        notes: input.notes ?? null,
        followUpAt,
      },
      connection,
    );

    await repository.markAppointmentCompleted(appointment.id, connection);

    return created;
  });

  return detail(consultationId);
}

/** Met à jour partiellement une consultation (diagnostic, notes, suivi). */
export async function update(
  id: number,
  input: UpdateConsultationPayload,
): Promise<ConsultationDetail> {
  await getConsultationOrFail(id);

  const changes: ConsultationChanges = {};
  if (input.diagnosis !== undefined) changes.diagnosis = input.diagnosis;
  if (input.notes !== undefined) changes.notes = input.notes;
  if (input.followUpAt !== undefined) {
    // `null` efface explicitement la date de suivi ; une valeur la remplace.
    if (input.followUpAt === null) {
      changes.follow_up_at = null;
    } else {
      const followUpAt = toMySqlDate(input.followUpAt);
      if (followUpAt === null) {
        throw AppError.unprocessable(
          'La date de suivi transmise est invalide.',
          'INVALID_FOLLOW_UP_DATE',
        );
      }
      changes.follow_up_at = followUpAt;
    }
  }

  if (Object.keys(changes).length === 0) {
    throw AppError.badRequest('Aucun champ valide à mettre à jour.', 'NOTHING_TO_UPDATE');
  }

  await repository.updateConsultation(id, changes);
  return detail(id);
}

/** Supprime une consultation (les ordonnances suivent en cascade). */
export async function remove(id: number): Promise<void> {
  await getConsultationOrFail(id);
  await repository.deleteConsultation(id);
}
