/**
 * Règles métier du module laboratoire.
 *
 * Deux responsabilités : tenir le catalogue des analyses (`lab_tests`) et faire
 * vivre les demandes (`lab_requests`) — y compris les règles de prescription
 * (un médecin ne prescrit que pour lui-même) et le cycle de vie du statut.
 *
 * Les entrées viennent en camelCase (`labTestId`, `resultText`) : la conversion
 * vers les colonnes snake_case est faite ici, jamais dans le contrôleur.
 */

import type { LabRequest, LabRequestStatus, LabTest, Paginated } from '@mediclinic/shared';

import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { buildSetClause } from '../../utils/http.js';
import { buildOrderBy, likePattern, paginated, type Pagination } from '../../utils/pagination.js';
import * as repository from './lab.repository.js';
import type { LabRequestRecord, LabTestRecord } from './lab.repository.js';

/* -------------------------------------------------------------------------- */
/* Entrées du service                                                          */
/* -------------------------------------------------------------------------- */

export interface LabRequestListFilters {
  /** Terme de recherche brut (nom du patient ou de l'analyse). */
  search?: string | undefined;
  status?: string | undefined;
  patientId?: number | undefined;
  doctorId?: number | undefined;
  sort?: string | undefined;
  order?: string | undefined;
}

/** Colonnes de tri autorisées (liste blanche). */
const SORTABLE_COLUMNS: Readonly<Record<string, string>> = {
  requested_at: 'lr.requested_at',
  status: 'lr.status',
  completed_at: 'lr.completed_at',
  patient_name: 'p.last_name',
};

/* -------------------------------------------------------------------------- */
/* Conversions ligne SQL → objet exposé                                        */
/* -------------------------------------------------------------------------- */

/** Convertit une ligne `lab_tests` en objet `LabTest`. */
export function toLabTest(record: LabTestRecord): LabTest {
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    // DECIMAL renvoyé en chaîne par le pilote, conformément au type partagé.
    price: String(record.price),
    turnaround_hours: record.turnaround_hours,
  };
}

/**
 * Convertit une ligne enrichie en objet `LabRequest`.
 * `created_at` n'existe pas sur la table : `v_patient_history` et le front
 * s'appuient sur `requested_at`, qui joue ce rôle.
 */
export function toLabRequest(record: LabRequestRecord): LabRequest {
  return {
    id: record.id,
    patient_id: record.patient_id,
    patient_name: record.patient_name,
    doctor_id: record.doctor_id,
    doctor_name: record.doctor_name,
    lab_test_id: record.lab_test_id,
    lab_test_name: record.lab_test_name,
    status: record.status,
    result_text: record.result_text,
    requested_at: String(record.requested_at),
    completed_at: record.completed_at === null ? null : String(record.completed_at),
  };
}

/* -------------------------------------------------------------------------- */
/* Catalogue des analyses                                                      */
/* -------------------------------------------------------------------------- */

/** Catalogue complet des analyses. */
export async function listTests(): Promise<LabTest[]> {
  const rows = await repository.listTests();
  return rows.map(toLabTest);
}

/** Charge une analyse du catalogue ou lève une 404. */
export async function getTestOrFail(id: number): Promise<LabTestRecord> {
  const record = await repository.findTestById(id);
  if (!record) {
    throw AppError.notFound('Analyse introuvable dans le catalogue.', 'LAB_TEST_NOT_FOUND');
  }
  return record;
}

/** Crée une analyse du catalogue (nom unique). */
export async function createTest(input: {
  name: string;
  category: string;
  price: number;
  turnaroundHours?: number | undefined;
}): Promise<LabTest> {
  const existing = await repository.findTestByName(input.name);
  if (existing) {
    throw AppError.conflict(
      `Une analyse nommée « ${input.name} » existe déjà dans le catalogue.`,
      'LAB_TEST_NAME_EXISTS',
    );
  }

  const id = await repository.createTest(input);
  return toLabTest(await getTestOrFail(id));
}

/** Met à jour partiellement une analyse du catalogue. */
export async function updateTest(
  id: number,
  input: {
    name?: string | undefined;
    category?: string | undefined;
    price?: number | undefined;
    turnaroundHours?: number | undefined;
  },
): Promise<LabTest> {
  if (input.name !== undefined) {
    const existing = await repository.findTestByName(input.name);
    if (existing && existing.id !== id) {
      throw AppError.conflict(
        `Une analyse nommée « ${input.name} » existe déjà dans le catalogue.`,
        'LAB_TEST_NAME_EXISTS',
      );
    }
  }

  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.category !== undefined) values.category = input.category;
  if (input.price !== undefined) values.price = input.price;
  if (input.turnaroundHours !== undefined) values.turnaround_hours = input.turnaroundHours;

  const { sql, params } = buildSetClause(values, repository.TEST_UPDATABLE_COLUMNS);
  await repository.updateTest(id, sql, params);
  return toLabTest(await getTestOrFail(id));
}

/* -------------------------------------------------------------------------- */
/* Demandes d'analyse                                                          */
/* -------------------------------------------------------------------------- */

/** Liste paginée des demandes, enrichie des noms patient / médecin / analyse. */
export async function listRequests(
  filters: LabRequestListFilters,
  pagination: Pagination,
): Promise<Paginated<LabRequest>> {
  const applied = {
    search:
      filters.search !== undefined && filters.search.length > 0
        ? likePattern(filters.search)
        : undefined,
    status: filters.status,
    patientId: filters.patientId,
    doctorId: filters.doctorId,
  };

  const orderBy = buildOrderBy(
    filters.sort,
    filters.order,
    SORTABLE_COLUMNS,
    'lr.requested_at',
    'desc',
  );

  const [rows, total] = await Promise.all([
    repository.listRequests(applied, orderBy, pagination.limit, pagination.offset),
    repository.countRequests(applied),
  ]);

  return paginated(rows.map(toLabRequest), total, pagination);
}

/** Charge une demande enrichie ou lève une 404. */
export async function getRequestOrFail(id: number): Promise<LabRequestRecord> {
  const record = await repository.findRequestById(id);
  if (!record) {
    throw AppError.notFound('Demande d’analyse introuvable.', 'LAB_REQUEST_NOT_FOUND');
  }
  return record;
}

/** Demandes d'un patient (le dossier doit exister). */
export async function listRequestsByPatient(patientId: number): Promise<LabRequest[]> {
  if (!(await repository.patientExists(patientId))) {
    throw AppError.notFound('Dossier patient introuvable.', 'PATIENT_NOT_FOUND');
  }

  const rows = await repository.listRequestsByPatient(patientId);
  return rows.map(toLabRequest);
}

/**
 * Crée une demande d'analyse.
 *
 * Un compte médecin ne peut prescrire que pour lui-même : le `doctorId` reçu
 * doit correspondre à son propre profil, sinon la demande est un abus de
 * délégation (un médecin prescrivant sous le nom d'un confrère).
 */
export async function createRequest(
  user: AuthUser,
  input: { patientId: number; doctorId: number; labTestId: number; notes?: string | undefined },
): Promise<LabRequest> {
  if (user.doctorId !== null && user.doctorId !== input.doctorId) {
    throw AppError.forbidden(
      'Un médecin ne peut prescrire une analyse que pour lui-même.',
      'DOCTOR_SELF_PRESCRIPTION_ONLY',
    );
  }

  if (!(await repository.patientExists(input.patientId))) {
    throw AppError.notFound('Dossier patient introuvable.', 'PATIENT_NOT_FOUND');
  }
  if (!(await repository.doctorExists(input.doctorId))) {
    throw AppError.notFound('Médecin introuvable.', 'DOCTOR_NOT_FOUND');
  }
  await getTestOrFail(input.labTestId);

  const id = await repository.createRequest(input);
  return toLabRequest(await getRequestOrFail(id));
}

/**
 * Met à jour une demande (statut, résultat).
 * Le passage à `COMPLETED` renseigne automatiquement `completed_at = NOW()`.
 */
export async function updateRequest(
  id: number,
  input: { status?: LabRequestStatus | undefined; resultText?: string | undefined },
): Promise<LabRequest> {
  const values: Record<string, unknown> = {};
  if (input.status !== undefined) values.status = input.status;
  if (input.resultText !== undefined) values.result_text = input.resultText;

  const { sql, params } = buildSetClause(values, ['status', 'result_text']);

  await repository.updateRequest(id, sql, params, input.status === 'COMPLETED');
  return toLabRequest(await getRequestOrFail(id));
}

/**
 * Supprime une demande : annulation logique si un résultat existe, suppression
 * physique sinon (une demande sans résultat n'a aucune valeur médicale).
 */
export async function deleteRequest(id: number): Promise<{ cancelled: boolean }> {
  const cancelled = await repository.cancelOrRemoveRequest(id);
  return { cancelled };
}
