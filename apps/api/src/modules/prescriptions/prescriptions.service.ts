/**
 * Règles métier des ordonnances et de leur dispensation.
 *
 * Deux invariants structurels gouvernent ce service :
 *  1. La dispensation n'écrit JAMAIS `medications.stock_quantity` : elle insère
 *     un `stock_movements` de type `OUT` par ligne d'ordonnance, et les triggers
 *     de `001_init.sql` font évoluer le stock. Le trigger reste la garantie
 *     ultime (SQLSTATE 45000 → HTTP 409) ; la vérification préalable en une
 *     seule requête agrégée sert uniquement à produire un message exploitable.
 *  2. Toute lecture du stock après écriture est refaite en base : le service ne
 *     devine jamais la valeur produite par un trigger.
 *
 * Les entrées viennent en camelCase (`consultationId`, `medicationId`) ; la
 * conversion vers les colonnes snake_case est faite ici, jamais dans le
 * contrôleur.
 */

import type {
  CreatePrescriptionInput,
  Paginated,
  Prescription,
  PrescriptionItem,
  PrescriptionStatus,
} from '@mediclinic/shared';

import { withTransaction } from '../../config/db.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { sendMail, prescriptionDispensedEmail } from '../../utils/email.service.js';
import { buildOrderBy, type Pagination } from '../../utils/pagination.js';
import * as repository from './prescriptions.repository.js';
import type {
  ConsultationForPrescriptionRow,
  DispenseMedicationRow,
  PrescriptionItemInput,
  PrescriptionItemRow,
  PrescriptionRow,
} from './prescriptions.repository.js';

/* -------------------------------------------------------------------------- */
/* Types d'entrée et de sortie                                                 */
/* -------------------------------------------------------------------------- */

/** Query string de `GET /api/prescriptions` (déjà validée et convertie par Zod). */
export interface PrescriptionQuery {
  page: number;
  limit: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  doctorId?: number;
  patientId?: number;
  status?: PrescriptionStatus;
  from?: string;
  to?: string;
}

/** Corps de `POST /api/prescriptions` (sortie de `createPrescriptionSchema`). */
export type CreatePrescriptionPayload = CreatePrescriptionInput;

/** Corps de `PATCH /api/prescriptions/:id` : statut et/ou lignes de remplacement. */
export interface UpdatePrescriptionPayload {
  status?: PrescriptionStatus;
  items?: Array<{
    medicationId: number;
    dosage: string;
    frequency: string;
    duration: string;
    instructions?: string;
    quantity: number;
  }>;
}

/**
 * Ligne d'ordonnance exposée par l'API : le type partagé `PrescriptionItem`
 * enrichi de l'unité et du prix courants du catalogue, utiles à l'affichage
 * (le front n'a alors pas à recroiser avec la liste des médicaments).
 */
export interface PrescriptionItemDetail extends PrescriptionItem {
  unit: string;
  price: string;
}

/**
 * Ordonnance exposée par l'API : le type partagé `Prescription` enrichi des
 * colonnes de la vue (`specialty_name`, `items_count`, `total_quantity`).
 */
export interface PrescriptionDetail extends Prescription {
  consultation_id: number;
  appointment_id: number;
  patient_id: number;
  specialty_name: string;
  items_count: number;
  total_quantity: number;
}

/** Ligne de dispensation manquante, renvoyée en détail d'une 409. */
export interface MissingStock {
  medicationId: number;
  name: string;
  requested: number;
  available: number;
}

/* -------------------------------------------------------------------------- */
/* Tri                                                                         */
/* -------------------------------------------------------------------------- */

/** Colonnes de tri autorisées (liste blanche : aucune expression client). */
const SORTABLE_COLUMNS: Readonly<Record<string, string>> = {
  issued_at: 'v.issued_at',
  status: 'v.status',
  patient_name: 'v.patient_name',
  doctor_name: 'v.doctor_name',
  specialty_name: 'v.specialty_name',
  items_count: 'v.items_count',
};

/* -------------------------------------------------------------------------- */
/* Conversions ligne SQL → objet exposé                                        */
/* -------------------------------------------------------------------------- */

/** Convertit une ligne de la vue en ordonnance d'API (sans ses lignes). */
export function toPrescription(
  row: PrescriptionRow,
  items: PrescriptionItemDetail[] = [],
): PrescriptionDetail {
  return {
    id: row.id,
    consultation_id: row.consultation_id,
    doctor_id: row.doctor_id,
    doctor_name: row.doctor_name,
    patient_id: row.patient_id,
    patient_name: row.patient_name,
    issued_at: String(row.issued_at),
    status: row.status,
    appointment_id: row.appointment_id,
    specialty_name: row.specialty_name,
    items_count: Number(row.items_count ?? items.length),
    total_quantity: Number(row.total_quantity ?? 0),
    items,
  };
}

/** Convertit une ligne de `prescription_items` en objet d'API. */
export function toPrescriptionItem(row: PrescriptionItemRow): PrescriptionItemDetail {
  return {
    id: row.id,
    prescription_id: row.prescription_id,
    medication_id: row.medication_id,
    medication_name: row.medication_name,
    dosage: row.dosage,
    frequency: row.frequency,
    duration: row.duration,
    instructions: row.instructions,
    quantity: row.quantity,
    // Champs d'affichage supplémentaires (unité et prix courants du catalogue).
    unit: row.unit,
    price: row.price,
  };
}

/** Normalise une ligne d'entrée (camelCase) en colonnes d'écriture. */
function toItemInput(item: {
  medicationId: number;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string | undefined;
  quantity: number;
}): PrescriptionItemInput {
  return {
    medicationId: item.medicationId,
    dosage: item.dosage,
    frequency: item.frequency,
    duration: item.duration,
    instructions: item.instructions === undefined || item.instructions === '' ? null : item.instructions,
    quantity: item.quantity,
  };
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/** Regroupe des lignes par identifiant d'ordonnance (évite le N+1). */
function groupItemsByPrescription(
  rows: readonly PrescriptionItemRow[],
): Map<number, PrescriptionItemDetail[]> {
  const grouped = new Map<number, PrescriptionItemDetail[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.prescription_id) ?? [];
    bucket.push(toPrescriptionItem(row));
    grouped.set(row.prescription_id, bucket);
  }
  return grouped;
}

/**
 * Liste paginée des ordonnances.
 * Les lignes de toutes les ordonnances de la page sont chargées en une seule
 * requête, puis réparties par identifiant.
 */
export async function listPrescriptions(
  filters: PrescriptionQuery,
  pagination: Pagination,
): Promise<Paginated<PrescriptionDetail>> {
  const orderBy = buildOrderBy(
    filters.sort,
    filters.order,
    SORTABLE_COLUMNS,
    'v.issued_at',
    'desc',
  );

  const applied: repository.PrescriptionFilters = {
    doctorId: filters.doctorId,
    patientId: filters.patientId,
    status: filters.status,
    from: filters.from,
    to: filters.to,
    search: filters.search,
  };

  const [rows, total] = await Promise.all([
    repository.findPrescriptions({
      filters: applied,
      orderBy,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    repository.countPrescriptions(applied),
  ]);

  const itemsByPrescription = groupItemsByPrescription(
    await repository.findItemsByPrescriptionIds(rows.map((row) => row.id)),
  );

  return {
    data: rows.map((row) => toPrescription(row, itemsByPrescription.get(row.id) ?? [])),
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pagination.limit),
    },
  };
}

/**
 * Charge une ordonnance (vue) ou lève une 404.
 * Exporté car le contrôleur en a besoin pour appliquer la règle « un médecin ne
 * prescrit que pour ses propres consultations » avant l'appel au service.
 */
export async function getPrescriptionOrFail(id: number): Promise<PrescriptionRow> {
  const row = await repository.findPrescriptionById(id);
  if (!row) {
    throw AppError.notFound('Ordonnance introuvable.', 'PRESCRIPTION_NOT_FOUND');
  }
  return row;
}

/** Ordonnance complète, lignes comprises. */
export async function getPrescription(id: number): Promise<PrescriptionDetail> {
  const row = await getPrescriptionOrFail(id);
  const items = await repository.findItems(id);
  return toPrescription(row, items.map(toPrescriptionItem));
}

/** Ordonnances d'un patient (404 si le patient n'a aucun dossier). */
export async function listPrescriptionsByPatient(
  patientId: number,
  pagination: Pagination,
  sort?: string,
  order?: 'asc' | 'desc',
): Promise<Paginated<PrescriptionDetail>> {
  return listPrescriptions(
    { page: pagination.page, limit: pagination.limit, patientId, sort, order },
    pagination,
  );
}

/** Consultation de rattachement, ou 404. */
export async function getConsultationOrFail(
  consultationId: number,
): Promise<ConsultationForPrescriptionRow> {
  const consultation = await repository.findConsultationForPrescription(consultationId);
  if (!consultation) {
    throw AppError.notFound('Consultation introuvable.', 'CONSULTATION_NOT_FOUND');
  }
  return consultation;
}

/**
 * Vérifie que tous les médicaments demandés existent.
 * Le message d'erreur liste les identifiants inconnus : le prescripteur peut
 * ainsi corriger sa saisie sans deviner lequel est en cause.
 */
function assertMedicationsExist(
  requestedIds: readonly number[],
  found: readonly DispenseMedicationRow[],
): void {
  const known = new Set(found.map((row) => row.id));
  const unknown = [...new Set(requestedIds)].filter((id) => !known.has(id));

  if (unknown.length > 0) {
    throw AppError.unprocessable(
      `Médicament(s) introuvable(s) dans le catalogue : ${unknown.join(', ')}.`,
      'MEDICATION_NOT_FOUND',
      { medicationIds: unknown },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Création                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Crée une ordonnance et ses lignes (transaction).
 *
 * `doctor_id` est TOUJOURS celui de la consultation : il n'est jamais repris du
 * corps de la requête, ce qui empêche d'attribuer une ordonnance à un confrère.
 * Le contrôle « un médecin ne prescrit que pour lui-même » est appliqué par le
 * contrôleur, qui a connaissance de l'utilisateur connecté.
 */
export async function createPrescription(
  input: CreatePrescriptionPayload,
): Promise<PrescriptionDetail> {
  const consultation = await getConsultationOrFail(input.consultationId);

  const items = input.items.map(toItemInput);
  const medications = await repository.findMedicationsForDispense(
    items.map((item) => item.medicationId),
  );
  assertMedicationsExist(
    items.map((item) => item.medicationId),
    medications,
  );

  const id = await repository.createPrescription(
    { consultationId: consultation.id, doctorId: consultation.doctor_id },
    items,
  );

  return getPrescription(id);
}

/* -------------------------------------------------------------------------- */
/* Dispensation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Dispense une ordonnance : contrôle du stock, passage à `DISPENSED`, sortie de
 * stock par ligne, puis notification du patient.
 *
 * Le contrôle de stock est agrégé (une seule requête pour tous les médicaments
 * de l'ordonnance) et précède toute écriture : en cas de manque, aucune ligne
 * n'est enregistrée. La transaction garantit ensuite l'atomicité ; le trigger
 * `trg_stock_movement_before_insert` reste le garde-fou ultime et son
 * SQLSTATE 45000 est traduit en 409 par le middleware d'erreurs.
 *
 * L'email ne doit jamais faire échouer la dispensation : il est envoyé après le
 * commit, dans un `try/catch` silencieux.
 */
export async function dispensePrescription(
  id: number,
  user: AuthUser,
): Promise<PrescriptionDetail> {
  const prescription = await getPrescriptionOrFail(id);

  if (prescription.status === 'DISPENSED') {
    throw AppError.conflict(
      'Cette ordonnance a déjà été dispensée.',
      'PRESCRIPTION_ALREADY_DISPENSED',
    );
  }
  if (prescription.status === 'CANCELLED') {
    throw AppError.conflict(
      'Cette ordonnance est annulée : elle ne peut pas être dispensée.',
      'PRESCRIPTION_CANCELLED',
    );
  }

  const items = await repository.findItems(id);
  if (items.length === 0) {
    throw AppError.conflict(
      'Cette ordonnance ne contient aucun médicament : la dispensation est impossible.',
      'PRESCRIPTION_EMPTY',
    );
  }

  // Quantités cumulées par médicament : un même produit peut figurer sur deux
  // lignes (posologies différentes), le stock doit être comparé au total.
  const requestedByMedication = new Map<number, number>();
  for (const item of items) {
    requestedByMedication.set(
      item.medication_id,
      (requestedByMedication.get(item.medication_id) ?? 0) + item.quantity,
    );
  }
  const medicationIds = [...requestedByMedication.keys()];
  const medications = await repository.findMedicationsForDispense(medicationIds);
  assertMedicationsExist(medicationIds, medications);

  const stockByMedication = new Map(medications.map((row) => [row.id, row]));
  const missing: MissingStock[] = [];
  for (const [medicationId, requested] of requestedByMedication) {
    const medication = stockByMedication.get(medicationId);
    // `assertMedicationsExist` garantit la présence ; la garde satisfait
    // `noUncheckedIndexedAccess`.
    if (!medication) continue;
    if (medication.stock_quantity < requested) {
      missing.push({
        medicationId,
        name: medication.name,
        requested,
        available: medication.stock_quantity,
      });
    }
  }

  if (missing.length > 0) {
    const details = missing
      .map((entry) => `${entry.name} (demandé : ${entry.requested}, disponible : ${entry.available})`)
      .join(', ');
    throw AppError.conflict(
      `Stock insuffisant pour dispenser cette ordonnance : ${details}.`,
      'INSUFFICIENT_STOCK',
      { missing },
    );
  }

  await withTransaction(async (connection) => {
    await repository.updatePrescriptionStatus(id, 'DISPENSED', connection);

    // Une ligne d'ordonnance = un mouvement de stock : le trigger décrémente
    // `medications.stock_quantity` et refuse tout dépassement.
    for (const item of items) {
      await repository.insertStockMovement(
        {
          medicationId: item.medication_id,
          type: 'OUT',
          quantity: item.quantity,
          reason: `Dispensation ordonnance #${id}`,
          userId: user.id,
        },
        connection,
      );
    }
  });

  // Relecture : le statut et le stock viennent d'être modifiés en base.
  const dispensed = await getPrescription(id);
  await notifyPatient(dispensed, items.length);

  return dispensed;
}

/**
 * Préviens le patient que son ordonnance est prête.
 * Toute erreur est absorbée : une panne SMTP ne doit pas invalider une
 * dispensation déjà validée en base.
 */
async function notifyPatient(
  prescription: PrescriptionDetail,
  medicationCount: number,
): Promise<void> {
  try {
    const contact = await repository.findPatientEmail(prescription.patient_id);
    const email = contact?.email;
    if (!email) return;

    const mail = prescriptionDispensedEmail({
      patientName: contact?.patient_name ?? prescription.patient_name,
      prescriptionId: prescription.id,
      medicationCount,
    });

    await sendMail({ ...mail, to: email });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ordonnance #${prescription.id}] notification du patient impossible :`,
      error,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Mise à jour et suppression                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Met à jour une ordonnance : changement de statut et/ou remplacement des
 * lignes (transaction DELETE + INSERT côté repository).
 *
 * Le passage à `DISPENSED` est refusé ici : seule la route de dispensation
 * enregistre les mouvements de stock correspondants.
 */
export async function updatePrescription(
  id: number,
  input: UpdatePrescriptionPayload,
): Promise<PrescriptionDetail> {
  const current = await getPrescriptionOrFail(id);

  if (input.status === undefined && input.items === undefined) {
    throw AppError.badRequest(
      'Aucun champ à mettre à jour : fournissez un statut ou des lignes d’ordonnance.',
      'NOTHING_TO_UPDATE',
    );
  }

  if (input.status === 'DISPENSED' && current.status !== 'DISPENSED') {
    throw AppError.conflict(
      'Utilisez POST /api/prescriptions/:id/dispense pour dispenser une ordonnance : cette action met le stock à jour.',
      'DISPENSE_REQUIRES_STOCK_MOVEMENT',
    );
  }

  let items: PrescriptionItemInput[] | undefined;
  if (input.items !== undefined) {
    items = input.items.map(toItemInput);
    const medications = await repository.findMedicationsForDispense(
      items.map((item) => item.medicationId),
    );
    assertMedicationsExist(
      items.map((item) => item.medicationId),
      medications,
    );
  }

  if (items === undefined) {
    // Simple changement de statut : une seule écriture, pas de transaction.
    await repository.updatePrescriptionStatus(id, input.status as PrescriptionStatus);
  } else if (input.status === undefined) {
    await repository.replaceItems(id, items);
  } else {
    await withTransaction(async (connection) => {
      await repository.updatePrescriptionStatus(id, input.status as PrescriptionStatus, connection);
      await repository.replaceItems(id, items, connection);
    });
  }

  return getPrescription(id);
}

/**
 * Supprime une ordonnance.
 *
 * Une ordonnance déjà dispensée a consommé du stock : la suppression physique
 * effacerait la trace de cette sortie. Elle est donc annulée logiquement
 * (`CANCELLED`) ; les autres sont réellement supprimées.
 */
export async function deletePrescription(id: number): Promise<{ cancelled: boolean }> {
  const prescription = await getPrescriptionOrFail(id);

  if (prescription.status === 'DISPENSED') {
    await repository.updatePrescriptionStatus(id, 'CANCELLED');
    return { cancelled: true };
  }

  await repository.deletePrescription(id);
  return { cancelled: false };
}

/* -------------------------------------------------------------------------- */
/* Utilitaires exposés au contrôleur                                          */
/* -------------------------------------------------------------------------- */

/**
 * Applique la règle « un médecin ne prescrit que pour ses propres
 * consultations ».
 *
 * Le contrôle appartient au contrôleur (il seul connaît `req.user`), mais la
 * comparaison est centralisée ici pour rester lisible et testable.
 */
export function assertDoctorCanPrescribe(
  user: AuthUser,
  consultation: ConsultationForPrescriptionRow,
): void {
  if (user.doctorId !== null && user.doctorId !== consultation.doctor_id) {
    throw AppError.forbidden(
      'Vous ne pouvez créer une ordonnance que pour vos propres consultations.',
      'DOCTOR_NOT_OWNER_OF_CONSULTATION',
    );
  }
}
