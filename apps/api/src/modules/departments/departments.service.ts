/**
 * Règles métier des départements de la clinique.
 *
 * Règles appliquées ici :
 *  - le nom d'un département est unique (409 en cas de doublon) ;
 *  - un chef de département désigné doit exister (422), et peut être retiré en
 *    passant explicitement `headDoctorId: null` ;
 *  - un département rattaché à des médecins, des rendez-vous ou des gardes ne
 *    peut pas être supprimé (409).
 * Aucune chaîne SQL dans ce fichier : tout passe par le repository.
 */

import type { Department } from '@mediclinic/shared';

import { AppError } from '../../utils/app-error.js';
import * as repository from './departments.repository.js';
import type { DepartmentRow } from './departments.repository.js';

/** Département exposé par l'API, avec le nom du chef et le nombre de médecins. */
export interface DepartmentWithHead extends Department {
  head_doctor_name: string | null;
  doctors_count: number;
}

/** Médecin listé dans la fiche d'un département. */
export interface DepartmentDoctor {
  id: number;
  full_name: string;
  specialty_name: string;
}

/** Détail d'un département : entête + médecins rattachés. */
export interface DepartmentDetail extends DepartmentWithHead {
  doctors: DepartmentDoctor[];
}

/** Convertit une ligne SQL en objet exposé par l'API. */
export function toDepartment(row: DepartmentRow): DepartmentWithHead {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    head_doctor_id: row.head_doctor_id,
    head_doctor_name: row.head_doctor_name,
    created_at: String(row.created_at),
    doctors_count: Number(row.doctors_count ?? 0),
  };
}

/** Liste des départements, triée alphabétiquement par défaut. */
export async function list(params: {
  search?: string;
  sort?: string;
  order?: string;
}): Promise<DepartmentWithHead[]> {
  const rows = await repository.findAll(params);
  return rows.map(toDepartment);
}

/**
 * Récupère un département par son identifiant.
 * @throws AppError 404 si le département n'existe pas.
 */
export async function getById(id: number): Promise<DepartmentWithHead> {
  const row = await repository.findById(id);
  if (!row) throw AppError.notFound('Ce département est introuvable.', 'DEPARTMENT_NOT_FOUND');
  return toDepartment(row);
}

/**
 * Détail complet : entête enrichie et liste des médecins du département.
 * @throws AppError 404 si le département n'existe pas.
 */
export async function getDetail(id: number): Promise<DepartmentDetail> {
  const department = await getById(id);
  const doctors = await repository.findDoctors(id);
  return { ...department, doctors };
}

/**
 * Vérifie qu'un chef de département désigné correspond bien à un médecin.
 * @throws AppError 422 si le médecin n'existe pas.
 */
async function assertHeadDoctorExists(headDoctorId: number): Promise<void> {
  const exists = await repository.doctorExists(headDoctorId);
  if (!exists) {
    throw AppError.unprocessable(
      'Le médecin désigné comme chef de département est introuvable.',
      'HEAD_DOCTOR_NOT_FOUND',
      { head_doctor_id: headDoctorId },
    );
  }
}

export interface CreateDepartmentInput {
  name: string;
  description?: string;
  headDoctorId?: number | null;
}

/**
 * Crée un département.
 * @throws AppError 409 si le nom est déjà utilisé, 422 si le chef est inconnu.
 */
export async function create(input: CreateDepartmentInput): Promise<DepartmentWithHead> {
  const existingId = await repository.findIdByName(input.name);
  if (existingId !== null) {
    throw AppError.conflict(
      `Le département « ${input.name} » existe déjà.`,
      'DEPARTMENT_NAME_TAKEN',
      { name: input.name },
    );
  }

  if (input.headDoctorId !== undefined && input.headDoctorId !== null) {
    await assertHeadDoctorExists(input.headDoctorId);
  }

  const id = await repository.create({
    name: input.name,
    description: input.description ?? null,
    headDoctorId: input.headDoctorId ?? null,
  });
  return getById(id);
}

export interface UpdateDepartmentInput {
  name?: string;
  description?: string;
  headDoctorId?: number | null;
}

/**
 * Met à jour partiellement un département (chef de département inclus).
 * @throws AppError 404 si absent, 409 si le nom appartient à un autre, 422 si le chef est inconnu.
 */
export async function update(
  id: number,
  input: UpdateDepartmentInput,
): Promise<{ before: DepartmentWithHead; after: DepartmentWithHead }> {
  const before = await getById(id);

  if (input.name !== undefined) {
    const conflictId = await repository.findIdByName(input.name, id);
    if (conflictId !== null) {
      throw AppError.conflict(
        `Le département « ${input.name} » existe déjà.`,
        'DEPARTMENT_NAME_TAKEN',
        { name: input.name },
      );
    }
  }

  if (input.headDoctorId !== undefined && input.headDoctorId !== null) {
    await assertHeadDoctorExists(input.headDoctorId);
  }

  await repository.update(id, {
    name: input.name,
    description: input.description,
    headDoctorId: input.headDoctorId,
  });
  return { before, after: await getById(id) };
}

/**
 * Supprime un département sans historique.
 * @throws AppError 404 si absent, 409 si des médecins, rendez-vous ou gardes y sont rattachés.
 */
export async function remove(id: number): Promise<DepartmentDetail> {
  const department = await getDetail(id);

  const [doctors, appointments, shifts] = await Promise.all([
    repository.countDoctors(id),
    repository.countAppointments(id),
    repository.countShifts(id),
  ]);

  if (doctors > 0 || appointments > 0 || shifts > 0) {
    throw AppError.conflict(
      `Impossible de supprimer le département « ${department.name} » : ` +
        `${doctors} médecin(s), ${appointments} rendez-vous et ${shifts} garde(s) y sont rattachés.`,
      'DEPARTMENT_IN_USE',
      { doctors_count: doctors, appointments_count: appointments, shifts_count: shifts },
    );
  }

  await repository.remove(id);
  return department;
}
