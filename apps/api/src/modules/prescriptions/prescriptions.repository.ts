/**
 * Accès aux données des ordonnances et de leur dispensation.
 *
 * Trois règles structurelles gouvernent ce fichier :
 *  1. Les lectures s'appuient sur la vue `v_prescription_details` : les
 *     jointures patient / médecin / spécialité y sont déjà réalisées, ce qui
 *     évite de les réécrire à chaque fois.
 *  2. La dispensation n'écrit JAMAIS `medications.stock_quantity` : elle insère
 *     des lignes dans `stock_movements` et laisse les triggers de
 *     `001_init.sql` mettre le stock à jour.
 *  3. Les écritures composites (ordonnance + lignes, remplacement de lignes)
 *     sont transactionnelles : une ordonnance sans ligne n'a aucun sens
 *     médical.
 *
 * Toutes les requêtes sont préparées (`?`) ; aucune valeur client n'est
 * concaténée dans le SQL. Les fonctions acceptent une connexion de transaction
 * facultative, afin que le service reste seul maître des frontières
 * transactionnelles (aucune transaction imbriquée).
 */

import type { PrescriptionStatus } from '@mediclinic/shared';
import type { PoolConnection } from 'mysql2/promise';

import type { Row } from '../../config/db.js';
import {
  execute,
  executeWith,
  query,
  queryOne,
  withTransaction,
} from '../../config/db.js';
import { likePattern } from '../../utils/pagination.js';

/* -------------------------------------------------------------------------- */
/* Lignes SQL                                                                  */
/* -------------------------------------------------------------------------- */

/** Ligne de la vue `v_prescription_details`. */
export interface PrescriptionRow extends Row {
  id: number;
  consultation_id: number;
  doctor_id: number;
  issued_at: string;
  status: PrescriptionStatus;
  appointment_id: number;
  patient_id: number;
  patient_name: string;
  doctor_name: string;
  specialty_name: string;
  items_count: number;
  total_quantity: number;
}

/** Ligne de `prescription_items` jointe au catalogue des médicaments. */
export interface PrescriptionItemRow extends Row {
  id: number;
  prescription_id: number;
  medication_id: number;
  medication_name: string;
  unit: string;
  price: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
  quantity: number;
}

/** Consultation à l'origine d'une ordonnance (contrôle d'accès et propriétaire). */
export interface ConsultationForPrescriptionRow extends Row {
  id: number;
  doctor_id: number;
  appointment_id: number;
  patient_id: number;
}

/**
 * Médicament lu pour la dispensation.
 * `stock_quantity` est en lecture seule : il reflète l'état produit par les
 * triggers, jamais une valeur calculée par l'application.
 */
export interface DispenseMedicationRow extends Row {
  id: number;
  name: string;
  unit: string;
  stock_quantity: number;
}

/** Destinataire de l'email de dispensation (l'email peut être absent). */
export interface PatientContactRow extends Row {
  email: string | null;
  patient_name: string;
}

/** Ligne d'ordonnance à écrire (déjà normalisée en colonnes snake_case). */
export interface PrescriptionItemInput {
  medicationId: number;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
  quantity: number;
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Colonnes exposées en lecture.
 * Contrat explicite avec `002_views.sql` : la vue peut évoluer sans que le
 * service ne reçoive de colonnes inattendues.
 */
const PRESCRIPTION_COLUMNS = `
  v.id,
  v.consultation_id,
  v.doctor_id,
  v.issued_at,
  v.status,
  v.appointment_id,
  v.patient_id,
  v.patient_name,
  v.doctor_name,
  v.specialty_name,
  v.items_count,
  v.total_quantity
`;

/** Filtres de liste des ordonnances. */
export interface PrescriptionFilters {
  doctorId?: number;
  patientId?: number;
  status?: PrescriptionStatus;
  /** Date de début (incluse) au format `AAAA-MM-JJ`. */
  from?: string;
  /** Date de fin (incluse) au format `AAAA-MM-JJ`. */
  to?: string;
  /** Recherche libre sur le patient, le médecin ou la spécialité. */
  search?: string;
}

/** Construit la clause `WHERE` commune à la liste et au comptage. */
function buildFilters(filters: PrescriptionFilters): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.doctorId !== undefined) {
    conditions.push('v.doctor_id = ?');
    params.push(filters.doctorId);
  }
  if (filters.patientId !== undefined) {
    conditions.push('v.patient_id = ?');
    params.push(filters.patientId);
  }
  if (filters.status !== undefined) {
    conditions.push('v.status = ?');
    params.push(filters.status);
  }
  if (filters.from !== undefined && filters.from.length > 0) {
    // `issued_at` est un DATETIME : on compare des dates pour que la borne
    // haute inclue toute la journée.
    conditions.push('DATE(v.issued_at) >= ?');
    params.push(filters.from);
  }
  if (filters.to !== undefined && filters.to.length > 0) {
    conditions.push('DATE(v.issued_at) <= ?');
    params.push(filters.to);
  }
  if (filters.search !== undefined && filters.search.trim().length > 0) {
    const pattern = likePattern(filters.search.trim());
    conditions.push('(v.patient_name LIKE ? OR v.doctor_name LIKE ? OR v.specialty_name LIKE ?)');
    params.push(pattern, pattern, pattern);
  }

  return {
    where: conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

/** Liste paginée des ordonnances (vue `v_prescription_details`). */
export async function findPrescriptions(options: {
  filters: PrescriptionFilters;
  orderBy: string;
  limit: number;
  offset: number;
}): Promise<PrescriptionRow[]> {
  const { where, params } = buildFilters(options.filters);

  return query<PrescriptionRow>(
    `SELECT ${PRESCRIPTION_COLUMNS}
     FROM v_prescription_details v
     ${where}
     ORDER BY ${options.orderBy}, v.id DESC
     LIMIT ? OFFSET ?`,
    [...params, options.limit, options.offset],
  );
}

/** Nombre total d'ordonnances correspondant aux filtres. */
export async function countPrescriptions(filters: PrescriptionFilters): Promise<number> {
  const { where, params } = buildFilters(filters);
  const row = await queryOne<Row & { total: number }>(
    `SELECT COUNT(*) AS total FROM v_prescription_details v ${where}`,
    params,
  );
  return Number(row?.total ?? 0);
}

/** Une ordonnance (vue), sans ses lignes. */
export async function findPrescriptionById(id: number): Promise<PrescriptionRow | null> {
  return queryOne<PrescriptionRow>(
    `SELECT ${PRESCRIPTION_COLUMNS} FROM v_prescription_details v WHERE v.id = ?`,
    [id],
  );
}

/** Colonnes des lignes d'ordonnance, médicament dénommé. */
const ITEM_COLUMNS = `
  pi.id,
  pi.prescription_id,
  pi.medication_id,
  m.name AS medication_name,
  m.unit,
  m.price,
  pi.dosage,
  pi.frequency,
  pi.duration,
  pi.instructions,
  pi.quantity
`;

/** Lignes d'une ordonnance, dans l'ordre de saisie. */
export async function findItems(prescriptionId: number): Promise<PrescriptionItemRow[]> {
  return query<PrescriptionItemRow>(
    `SELECT ${ITEM_COLUMNS}
     FROM prescription_items pi
     JOIN medications m ON m.id = pi.medication_id
     WHERE pi.prescription_id = ?
     ORDER BY pi.id ASC`,
    [prescriptionId],
  );
}

/**
 * Lignes de plusieurs ordonnances en une seule requête.
 * Évite le N+1 lors de l'affichage d'une liste d'ordonnances.
 */
export async function findItemsByPrescriptionIds(
  prescriptionIds: readonly number[],
): Promise<PrescriptionItemRow[]> {
  if (prescriptionIds.length === 0) return [];

  // Les marqueurs `?` sont générés à partir du nombre d'identifiants (eux-mêmes
  // passés en paramètres) : aucune valeur n'entre dans la chaîne SQL.
  const placeholders = prescriptionIds.map(() => '?').join(', ');

  return query<PrescriptionItemRow>(
    `SELECT ${ITEM_COLUMNS}
     FROM prescription_items pi
     JOIN medications m ON m.id = pi.medication_id
     WHERE pi.prescription_id IN (${placeholders})
     ORDER BY pi.prescription_id ASC, pi.id ASC`,
    [...prescriptionIds],
  );
}

/** Consultation de rattachement, avec son médecin et son patient. */
export async function findConsultationForPrescription(
  consultationId: number,
): Promise<ConsultationForPrescriptionRow | null> {
  return queryOne<ConsultationForPrescriptionRow>(
    `SELECT c.id, c.doctor_id, c.appointment_id, a.patient_id
     FROM consultations c
     JOIN appointments a ON a.id = c.appointment_id
     WHERE c.id = ?`,
    [consultationId],
  );
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/** Insère les lignes d'une ordonnance sur une connexion de transaction. */
async function insertItems(
  connection: PoolConnection,
  prescriptionId: number,
  items: readonly PrescriptionItemInput[],
): Promise<void> {
  for (const item of items) {
    await executeWith(
      connection,
      `INSERT INTO prescription_items
         (prescription_id, medication_id, dosage, frequency, duration, instructions, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        prescriptionId,
        item.medicationId,
        item.dosage,
        item.frequency,
        item.duration,
        item.instructions,
        item.quantity,
      ],
    );
  }
}

/**
 * Crée une ordonnance et ses lignes dans une même transaction.
 * Une ordonnance sans ligne serait inutilisable en pharmacie : l'échec d'une
 * insertion de ligne annule donc l'en-tête.
 *
 * @returns l'identifiant de l'ordonnance créée.
 */
export async function createPrescription(
  values: { consultationId: number; doctorId: number },
  items: readonly PrescriptionItemInput[],
): Promise<number> {
  return withTransaction(async (connection) => {
    const result = await executeWith(
      connection,
      'INSERT INTO prescriptions (consultation_id, doctor_id) VALUES (?, ?)',
      [values.consultationId, values.doctorId],
    );
    const prescriptionId = result.insertId;

    await insertItems(connection, prescriptionId, items);
    return prescriptionId;
  });
}

/** Change le statut d'une ordonnance (émission, dispensation, annulation). */
export async function updatePrescriptionStatus(
  id: number,
  status: PrescriptionStatus,
  connection?: PoolConnection,
): Promise<void> {
  const sql = 'UPDATE prescriptions SET status = ? WHERE id = ?';

  if (connection) {
    await executeWith(connection, sql, [status, id]);
    return;
  }
  await execute(sql, [status, id]);
}

/** Supprime puis réinsère les lignes d'une ordonnance. */
async function doReplaceItems(
  connection: PoolConnection,
  prescriptionId: number,
  items: readonly PrescriptionItemInput[],
): Promise<void> {
  await executeWith(connection, 'DELETE FROM prescription_items WHERE prescription_id = ?', [
    prescriptionId,
  ]);
  await insertItems(connection, prescriptionId, items);
}

/**
 * Remplace toutes les lignes d'une ordonnance (DELETE + INSERT).
 *
 * Sans connexion fournie, une transaction est ouverte ici : entre le DELETE et
 * le dernier INSERT, l'ordonnance ne doit jamais apparaître vide.
 */
export async function replaceItems(
  prescriptionId: number,
  items: readonly PrescriptionItemInput[],
  connection?: PoolConnection,
): Promise<void> {
  if (connection) {
    await doReplaceItems(connection, prescriptionId, items);
    return;
  }

  await withTransaction(async (conn) => {
    await doReplaceItems(conn, prescriptionId, items);
  });
}

/** Supprime physiquement une ordonnance (les lignes suivent en cascade). */
export async function deletePrescription(id: number): Promise<void> {
  await execute('DELETE FROM prescriptions WHERE id = ?', [id]);
}

/* -------------------------------------------------------------------------- */
/* Dispensation                                                                */
/* -------------------------------------------------------------------------- */

/** Un médicament destiné à la dispensation (contrôle unitaire). */
export async function findMedicationForDispense(
  medicationId: number,
): Promise<DispenseMedicationRow | null> {
  return queryOne<DispenseMedicationRow>(
    'SELECT id, name, unit, stock_quantity FROM medications WHERE id = ?',
    [medicationId],
  );
}

/**
 * Plusieurs médicaments en une seule requête, pour vérifier le stock AVANT
 * toute écriture. Le contrôle est agrégé : une seule requête, pas une par
 * ligne d'ordonnance.
 */
export async function findMedicationsForDispense(
  medicationIds: readonly number[],
): Promise<DispenseMedicationRow[]> {
  if (medicationIds.length === 0) return [];

  const placeholders = medicationIds.map(() => '?').join(', ');

  return query<DispenseMedicationRow>(
    `SELECT id, name, unit, stock_quantity
     FROM medications
     WHERE id IN (${placeholders})`,
    [...medicationIds],
  );
}

/**
 * Insère un mouvement de stock : c'est la SEULE façon de faire varier
 * `medications.stock_quantity`. Le trigger `trg_stock_movement_after_insert`
 * applique la variation ; `trg_stock_movement_before_insert` refuse une sortie
 * supérieure au stock disponible (SQLSTATE 45000 → HTTP 409).
 *
 * `connection` permet d'inscrire le mouvement dans la transaction de
 * dispensation : soit toutes les lignes sortent du stock, soit aucune.
 */
export async function insertStockMovement(
  params: {
    medicationId: number;
    type: 'IN' | 'OUT';
    quantity: number;
    reason: string;
    userId: number;
  },
  connection?: PoolConnection,
): Promise<number> {
  const sql = `INSERT INTO stock_movements (medication_id, type, quantity, reason, user_id)
               VALUES (?, ?, ?, ?, ?)`;
  const values = [
    params.medicationId,
    params.type,
    params.quantity,
    params.reason,
    params.userId,
  ];

  if (connection) {
    const result = await executeWith(connection, sql, values);
    return result.insertId;
  }

  const result = await execute(sql, values);
  return result.insertId;
}

/** Coordonnées du patient, nécessaires à l'email de dispensation. */
export async function findPatientEmail(patientId: number): Promise<PatientContactRow | null> {
  return queryOne<PatientContactRow>(
    `SELECT p.email, CONCAT(p.first_name, ' ', p.last_name) AS patient_name
     FROM patients p
     WHERE p.id = ?`,
    [patientId],
  );
}
