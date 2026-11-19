/**
 * Règles métier des spécialités médicales.
 *
 * Règles appliquées ici :
 *  - le nom d'une spécialité est unique (409 en cas de doublon) ;
 *  - une spécialité à laquelle des médecins sont rattachés ne peut pas être
 *    supprimée (409), la base refuserait de toute façon la suppression
 *    (`fk_doctors_specialty` en ON DELETE RESTRICT).
 * Aucune chaîne SQL dans ce fichier : tout passe par le repository.
 */

import type { Specialty } from '@mediclinic/shared';

import { AppError } from '../../utils/app-error.js';
import * as repository from './specialties.repository.js';
import type { SpecialtyRow } from './specialties.repository.js';

/** Spécialité exposée par l'API, enrichie des compteurs affichés dans la liste. */
export interface SpecialtyWithCounts extends Specialty {
  doctors_count: number;
  appointments_count: number;
}

/** Convertit une ligne SQL en objet exposé par l'API. */
export function toSpecialty(row: SpecialtyRow): SpecialtyWithCounts {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    created_at: String(row.created_at),
    doctors_count: Number(row.doctors_count ?? 0),
    appointments_count: Number(row.appointments_count ?? 0),
  };
}

/** Liste des spécialités, triée alphabétiquement par défaut. */
export async function list(params: {
  search?: string;
  sort?: string;
  order?: string;
}): Promise<SpecialtyWithCounts[]> {
  const rows = await repository.findAll(params);
  return rows.map(toSpecialty);
}

/**
 * Récupère une spécialité par son identifiant.
 * @throws AppError 404 si la spécialité n'existe pas.
 */
export async function getById(id: number): Promise<SpecialtyWithCounts> {
  const row = await repository.findById(id);
  if (!row) throw AppError.notFound('Cette spécialité est introuvable.', 'SPECIALTY_NOT_FOUND');
  return toSpecialty(row);
}

export interface CreateSpecialtyInput {
  name: string;
  description?: string;
}

/**
 * Crée une spécialité.
 * @throws AppError 409 si le nom est déjà utilisé.
 */
export async function create(input: CreateSpecialtyInput): Promise<SpecialtyWithCounts> {
  const existingId = await repository.findIdByName(input.name);
  if (existingId !== null) {
    throw AppError.conflict(
      `La spécialité « ${input.name} » existe déjà.`,
      'SPECIALTY_NAME_TAKEN',
      { name: input.name },
    );
  }

  const id = await repository.create({
    name: input.name,
    description: input.description ?? null,
  });
  return getById(id);
}

export interface UpdateSpecialtyInput {
  name?: string;
  description?: string;
}

/**
 * Met à jour partiellement une spécialité.
 * @throws AppError 404 si absente, 409 si le nouveau nom appartient à une autre.
 */
export async function update(
  id: number,
  input: UpdateSpecialtyInput,
): Promise<{ before: SpecialtyWithCounts; after: SpecialtyWithCounts }> {
  const before = await getById(id);

  if (input.name !== undefined) {
    const conflictId = await repository.findIdByName(input.name, id);
    if (conflictId !== null) {
      throw AppError.conflict(
        `La spécialité « ${input.name} » existe déjà.`,
        'SPECIALTY_NAME_TAKEN',
        { name: input.name },
      );
    }
  }

  await repository.update(id, { name: input.name, description: input.description });
  return { before, after: await getById(id) };
}

/**
 * Supprime une spécialité sans historique.
 * @throws AppError 404 si absente, 409 si des médecins y sont rattachés.
 */
export async function remove(id: number): Promise<SpecialtyWithCounts> {
  const specialty = await getById(id);
  const doctorsCount = await repository.countDoctors(id);

  if (doctorsCount > 0) {
    throw AppError.conflict(
      `Impossible de supprimer la spécialité « ${specialty.name} » : ${doctorsCount} médecin(s) y sont rattachés.`,
      'SPECIALTY_IN_USE',
      { doctors_count: doctorsCount },
    );
  }

  await repository.remove(id);
  return specialty;
}
