/**
 * Accès aux données du module « consultations ».
 *
 * Toutes les requêtes préparées (`?`) du module sont regroupées ici : ni le
 * service ni le contrôleur ne contiennent de chaîne SQL. Les lectures passent
 * par la vue `v_consultation_details` (jointures rendez-vous / patient /
 * médecin / spécialité déjà réalisées dans `002_views.sql`) ; les écritures
 * portent sur la table `consultations`.
 *
 * La contrainte `uq_consultations_appointment` garantit la relation 1–1 entre
 * un rendez-vous et son compte-rendu : `existsForAppointment` permet au service
 * de produire un 409 explicite avant que MySQL ne renvoie `ER_DUP_ENTRY`.
 *
 * Les fonctions acceptent une connexion de transaction facultative : le
 * service reste seul maître des frontières transactionnelles.
 */

import type { AppointmentStatus, AppointmentType, PrescriptionStatus } from '@mediclinic/shared';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';

import type { Row } from '../../config/db.js';
import { execute, executeWith, query, queryWith } from '../../config/db.js';
import { buildSetClause } from '../../utils/http.js';
import { whereClause } from '../../utils/pagination.js';

/* -------------------------------------------------------------------------- */
/* Lignes                                                                     */
/* -------------------------------------------------------------------------- */

/** Ligne de la vue `v_consultation_details` telle que consommée par l'API. */
export interface ConsultationRow extends Row {
  id: number;
  appointment_id: number;
  doctor_id: number;
  diagnosis: string;
  notes: string | null;
  follow_up_at: string | null;
  created_at: string;
  patient_id: number;
  patient_name: string;
  patient_birth_date: string;
  doctor_name: string;
  specialty_name: string;
  prescriptions_count: number;
  invoices_count: number;
}

/** Ligne de détail : la vue complétée du créneau et du type de rendez-vous. */
export interface ConsultationDetailRow extends ConsultationRow {
  scheduled_at: string;
  appointment_type: AppointmentType;
}

/** Ligne d'ordonnance jointe à sa ligne et au médicament prescrit. */
export interface ConsultationPrescriptionItemRow extends Row {
  prescription_id: number;
  consultation_id: number;
  doctor_id: number;
  prescription_status: PrescriptionStatus;
  issued_at: string;
  item_id: number;
  medication_id: number;
  medication_name: string;
  unit: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  instructions: string | null;
}

/** Rendez-vous minimal nécessaire aux contrôles métier d'une consultation. */
export interface ConsultationAppointmentRow extends Row {
  id: number;
  patient_id: number;
  doctor_id: number;
  status: AppointmentStatus;
  scheduled_at: string;
  type: AppointmentType;
}

/* -------------------------------------------------------------------------- */
/* Filtres et projections                                                     */
/* -------------------------------------------------------------------------- */

/** Filtres de la liste paginée. `search` est un motif `LIKE` déjà échappé. */
export interface ConsultationFilters {
  doctorId?: number;
  patientId?: number;
  /** Borne basse incluse, au format `AAAA-MM-JJ` (date de la consultation). */
  from?: string;
  /** Borne haute incluse, au format `AAAA-MM-JJ`. */
  to?: string;
  /** Motif `LIKE` déjà échappé par `likePattern`, ou `undefined`. */
  search?: string;
}

/**
 * Colonnes de tri autorisées.
 * Le client ne transmet qu'une **clé** ; l'expression SQL correspondante est
 * choisie ici, ce qui interdit toute injection par le paramètre `sort`.
 */
export const CONSULTATION_SORT_COLUMNS: Readonly<Record<string, string>> = {
  created_at: 'v.created_at',
  follow_up_at: 'v.follow_up_at',
  patient_name: 'v.patient_name',
  doctor_name: 'v.doctor_name',
  specialty_name: 'v.specialty_name',
};

/** Colonnes lues dans la vue : contrat explicite avec `002_views.sql`. */
const CONSULTATION_COLUMNS = `
  v.id,
  v.appointment_id,
  v.doctor_id,
  v.diagnosis,
  v.notes,
  v.follow_up_at,
  v.created_at,
  v.patient_id,
  v.patient_name,
  v.patient_birth_date,
  v.doctor_name,
  v.specialty_name,
  v.prescriptions_count,
  v.invoices_count
`;

/** Colonnes de détail : la vue et les informations du rendez-vous d'origine. */
const CONSULTATION_DETAIL_COLUMNS = `
  ${CONSULTATION_COLUMNS},
  v.scheduled_at,
  v.appointment_type
`;

/** Construit la clause `WHERE` commune à la liste et au comptage. */
function buildFilters(filters: ConsultationFilters): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.from !== undefined) {
    clauses.push('DATE(v.created_at) >= ?');
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    clauses.push('DATE(v.created_at) <= ?');
    params.push(filters.to);
  }
  if (filters.doctorId !== undefined) {
    clauses.push('v.doctor_id = ?');
    params.push(filters.doctorId);
  }
  if (filters.patientId !== undefined) {
    clauses.push('v.patient_id = ?');
    params.push(filters.patientId);
  }
  if (filters.search !== undefined && filters.search.trim() !== '') {
    // Le motif couvre le nom du patient et le diagnostic : c'est la recherche
    // attendue par l'écran « Consultations » (retrouver un compte-rendu).
    clauses.push(`(v.patient_name LIKE ? ESCAPE '\\\\' OR v.diagnosis LIKE ? ESCAPE '\\\\')`);
    params.push(filters.search, filters.search);
  }

  return { where: whereClause(clauses), params };
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                   */
/* -------------------------------------------------------------------------- */

/** Liste paginée des consultations (vue `v_consultation_details`). */
export async function findConsultations(options: {
  filters: ConsultationFilters;
  /** Clause `ORDER BY` déjà validée par la liste blanche du service. */
  orderBy: string;
  limit: number;
  offset: number;
}): Promise<ConsultationRow[]> {
  const { where, params } = buildFilters(options.filters);

  return query<ConsultationRow>(
    `SELECT ${CONSULTATION_COLUMNS}
     FROM v_consultation_details v
     ${where}
     ORDER BY ${options.orderBy}, v.id DESC
     LIMIT ? OFFSET ?`,
    [...params, options.limit, options.offset],
  );
}

/** Nombre total de consultations correspondant aux filtres (requête dédiée). */
export async function countConsultations(filters: ConsultationFilters): Promise<number> {
  const { where, params } = buildFilters(filters);
  const row = await queryOneTotal(
    `SELECT COUNT(*) AS total FROM v_consultation_details v ${where}`,
    params,
  );
  return row;
}

/** Comptage générique renvoyant un entier sûr. */
async function queryOneTotal(sql: string, params: readonly unknown[]): Promise<number> {
  const rows = await query<Row & { total: number }>(sql, params);
  return Number(rows[0]?.total ?? 0);
}

/** Détail d'une consultation : la vue complétée des données du rendez-vous. */
export async function findConsultationById(
  id: number,
  connection?: PoolConnection,
): Promise<ConsultationDetailRow | null> {
  const rows = await selectRows<ConsultationDetailRow>(
    `SELECT ${CONSULTATION_DETAIL_COLUMNS}
     FROM v_consultation_details v
     WHERE v.id = ?`,
    [id],
    connection,
  );
  return rows[0] ?? null;
}

/** Consultations d'un patient, de la plus récente à la plus ancienne. */
export async function findConsultationsByPatient(
  patientId: number,
  connection?: PoolConnection,
): Promise<ConsultationRow[]> {
  return selectRows<ConsultationRow>(
    `SELECT ${CONSULTATION_COLUMNS}
     FROM v_consultation_details v
     WHERE v.patient_id = ?
     ORDER BY v.created_at DESC, v.id DESC`,
    [patientId],
    connection,
  );
}

/**
 * Ordonnances d'une consultation, lignes comprises.
 * Une seule requête joint `prescriptions`, `prescription_items` et
 * `medications` : le service regroupe ensuite les lignes par ordonnance sans
 * requête supplémentaire (pas de N+1).
 */
export async function findPrescriptionsForConsultation(
  consultationId: number,
  connection?: PoolConnection,
): Promise<ConsultationPrescriptionItemRow[]> {
  return selectRows<ConsultationPrescriptionItemRow>(
    `SELECT
       pr.id            AS prescription_id,
       pr.consultation_id,
       pr.doctor_id,
       pr.status        AS prescription_status,
       pr.issued_at,
       pi.id            AS item_id,
       pi.medication_id,
       m.name           AS medication_name,
       m.unit,
       pi.dosage,
       pi.frequency,
       pi.duration,
       pi.quantity,
       pi.instructions
     FROM prescriptions pr
     JOIN prescription_items pi ON pi.prescription_id = pr.id
     JOIN medications m         ON m.id = pi.medication_id
     WHERE pr.consultation_id = ?
     ORDER BY pr.issued_at DESC, pr.id DESC, pi.id ASC`,
    [consultationId],
    connection,
  );
}

/** Rendez-vous minimal d'une consultation (contrôles métier). */
export async function findAppointmentForConsultation(
  appointmentId: number,
  connection?: PoolConnection,
): Promise<ConsultationAppointmentRow | null> {
  const rows = await selectRows<ConsultationAppointmentRow>(
    `SELECT id, patient_id, doctor_id, status, scheduled_at, type
     FROM appointments
     WHERE id = ?`,
    [appointmentId],
    connection,
  );
  return rows[0] ?? null;
}

/** Un rendez-vous possède-t-il déjà une consultation ? (contrainte UNIQUE). */
export async function existsForAppointment(
  appointmentId: number,
  connection?: PoolConnection,
): Promise<boolean> {
  const rows = await selectRows<Row & { id: number }>(
    'SELECT id FROM consultations WHERE appointment_id = ? LIMIT 1',
    [appointmentId],
    connection,
  );
  return rows.length > 0;
}

/* -------------------------------------------------------------------------- */
/* Écritures                                                                  */
/* -------------------------------------------------------------------------- */

/** Champs d'une nouvelle consultation (snake_case, prêts pour l'INSERT). */
export interface NewConsultation {
  appointmentId: number;
  doctorId: number;
  diagnosis: string;
  notes: string | null;
  /** `AAAA-MM-JJ` ou `null`. */
  followUpAt: string | null;
}

/** Champs modifiables d'une consultation (clés = colonnes SQL). */
export type ConsultationChanges = {
  diagnosis?: string;
  notes?: string | null;
  follow_up_at?: string | null;
};

/** Liste blanche des colonnes modifiables : tout autre champ est ignoré. */
const CONSULTATION_UPDATE_COLUMNS = ['diagnosis', 'notes', 'follow_up_at'] as const;

/** Crée une consultation et renvoie son identifiant. */
export async function createConsultation(
  values: NewConsultation,
  connection?: PoolConnection,
): Promise<number> {
  const result = await write(
    `INSERT INTO consultations (appointment_id, doctor_id, diagnosis, notes, follow_up_at)
     VALUES (?, ?, ?, ?, ?)`,
    [values.appointmentId, values.doctorId, values.diagnosis, values.notes, values.followUpAt],
    connection,
  );
  return result.insertId;
}

/** Applique une mise à jour partielle à une consultation. */
export async function updateConsultation(
  id: number,
  values: ConsultationChanges,
  connection?: PoolConnection,
): Promise<void> {
  const { sql, params } = buildSetClause(values, CONSULTATION_UPDATE_COLUMNS);
  await write(`UPDATE consultations SET ${sql} WHERE id = ?`, [...params, id], connection);
}

/** Supprime définitivement une consultation. */
export async function deleteConsultation(id: number, connection?: PoolConnection): Promise<void> {
  await write('DELETE FROM consultations WHERE id = ?', [id], connection);
}

/**
 * Passe le rendez-vous d'une consultation à `COMPLETED`.
 * L'appel est fait dans la transaction de création : un rendez-vous ne peut
 * pas être marqué terminé si le compte-rendu n'a pas été écrit.
 */
export async function markAppointmentCompleted(
  appointmentId: number,
  connection?: PoolConnection,
): Promise<void> {
  await write(
    `UPDATE appointments SET status = 'COMPLETED' WHERE id = ?`,
    [appointmentId],
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
