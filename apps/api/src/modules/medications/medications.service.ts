/**
 * Règles métier du catalogue de médicaments et des alertes de stock.
 *
 * Deux invariants structurels gouvernent ce service :
 *  1. `medications.stock_quantity` n'est jamais écrite : le stock ne bouge
 *     qu'en insérant un `stock_movements` (les triggers de 001_init.sql font
 *     le reste). C'est pourquoi la création d'un médicament avec un stock
 *     initial insère AUSSI un mouvement `IN` « Stock initial ».
 *  2. Toute lecture du stock après une écriture est refaite en base : le
 *     service ne devine jamais la valeur produite par un trigger.
 */

import {
  buildOrderBy,
  type Pagination,
} from '../../utils/pagination.js';
import type { Medication, StockMovement, StockMovementType } from '@mediclinic/shared';
import { createMedicationSchema, updateMedicationSchema } from '@mediclinic/shared';
import type { z } from 'zod';

import { AppError } from '../../utils/app-error.js';
import { buildSetClause } from '../../utils/http.js';
import { toMySqlDate } from '../../utils/datetime.js';
import * as repository from './medications.repository.js';
import type {
  LowStockRow,
  MedicationRow,
  StockMovementDetailRow,
} from './medications.repository.js';

/** Filtres normalisés de la liste des médicaments (issus de la query string). */
export interface MedicationQuery {
  page: number;
  limit: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  category?: string;
  lowStock?: boolean;
  expiringSoon?: boolean;
  expired?: boolean;
}

/** Aucune donnée sensible : uniquement les colonnes du catalogue. */
const SORTABLE_COLUMNS: Readonly<Record<string, string>> = {
  name: 'm.name',
  category: 'm.category',
  price: 'm.price',
  stock_quantity: 'm.stock_quantity',
  expiry_date: 'm.expiry_date',
  created_at: 'm.created_at',
};

const MOVEMENT_SORTABLE_COLUMNS: Readonly<Record<string, string>> = {
  created_at: 'sm.created_at',
  type: 'sm.type',
  quantity: 'sm.quantity',
};

/* -------------------------------------------------------------------------- */
/* Conversions ligne SQL → objet exposé                                        */
/* -------------------------------------------------------------------------- */

/** Convertit une ligne `medications` en objet d'API (`is_low_stock` calculé). */
export function toMedication(row: MedicationRow): Medication {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    price: row.price,
    stock_quantity: row.stock_quantity,
    alert_threshold: row.alert_threshold,
    expiry_date: row.expiry_date,
    supplier: row.supplier,
    is_low_stock: Boolean(row.is_low_stock),
    created_at: String(row.created_at),
  };
}

/** Médicament en alerte, enrichi des informations de la vue de stock. */
export interface StockAlertMedication extends Medication {
  missing_quantity: number;
  is_expired: boolean;
  expires_soon: boolean;
}

/** Convertit une ligne de `v_low_stock_medications` en alerte d'API. */
export function toStockAlert(row: LowStockRow): StockAlertMedication {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    price: row.price,
    stock_quantity: row.stock_quantity,
    alert_threshold: row.alert_threshold,
    expiry_date: row.expiry_date,
    supplier: row.supplier,
    is_low_stock: true,
    missing_quantity: row.missing_quantity,
    is_expired: Boolean(row.is_expired),
    expires_soon: Boolean(row.expires_soon),
    created_at: '',
  };
}

/** Convertit un mouvement de stock en objet d'API (nom du médicament inclus). */
export function toMovement(row: StockMovementDetailRow): StockMovement {
  return {
    id: row.id,
    medication_id: row.medication_id,
    medication_name: row.medication_name,
    type: row.type,
    quantity: row.quantity,
    reason: row.reason,
    user_id: row.user_id,
    user_name: row.user_name,
    created_at: String(row.created_at),
  };
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                   */
/* -------------------------------------------------------------------------- */

/** Liste paginée des médicaments avec filtres et champ calculé `is_low_stock`. */
export async function listMedications(
  filters: MedicationQuery,
  pagination: Pagination,
): Promise<{ data: Medication[]; total: number }> {
  const orderBy = buildOrderBy(
    filters.sort,
    filters.order,
    SORTABLE_COLUMNS,
    'm.name',
    'asc',
  );

  const { rows, total } = await repository.findMedications({
    search: filters.search,
    category: filters.category,
    lowStock: filters.lowStock,
    expiringSoon: filters.expiringSoon,
    expired: filters.expired,
    orderBy,
    limit: pagination.limit,
    offset: pagination.offset,
  });

  return { data: rows.map(toMedication), total };
}

/** Catégories distinctes du catalogue. */
export async function listCategories(): Promise<string[]> {
  return repository.findCategories();
}

/** Alertes de stock : vue `v_low_stock_medications`. */
export async function listLowStock(): Promise<StockAlertMedication[]> {
  const rows = await repository.findLowStock();
  return rows.map(toStockAlert);
}

/** Fiche détaillée d'un médicament, accompagnée de ses derniers mouvements. */
export async function getMedication(
  id: number,
): Promise<{ medication: Medication; movements: StockMovement[] }> {
  const row = await repository.findMedicationById(id);
  if (!row) {
    throw AppError.notFound('Médicament introuvable.', 'MEDICATION_NOT_FOUND');
  }

  const movements = await repository.findRecentMovements(id, 10);
  return { medication: toMedication(row), movements: movements.map(toMovement) };
}

/**
 * Crée un médicament.
 *
 * Le stock initial n'est jamais écrit dans `medications` : il est injecté sous
 * forme de mouvement `IN` « Stock initial », afin que les triggers restent la
 * seule source de vérité du stock.
 *
 * @throws AppError 409 si le couple `(name, unit)` existe déjà.
 */
export async function createMedication(
  input: z.infer<typeof createMedicationSchema>,
  userId: number,
): Promise<Medication> {
  const existing = await repository.findMedicationByNameAndUnit(input.name, input.unit);
  if (existing) {
    throw AppError.conflict(
      `Le médicament « ${input.name} » (${input.unit}) existe déjà dans le catalogue.`,
      'MEDICATION_ALREADY_EXISTS',
    );
  }

  const id = await repository.createMedication(
    {
      name: input.name,
      category: input.category,
      unit: input.unit,
      price: String(input.price),
      alertThreshold: input.alertThreshold,
      expiryDate: toMySqlDate(input.expiryDate ?? null),
      supplier: input.supplier ?? null,
    },
    input.stockQuantity,
    userId,
  );

  // Relecture : la valeur de `stock_quantity` est produite par le trigger.
  const created = await repository.findMedicationById(id);
  if (!created) {
    throw AppError.internal('Le médicament créé est introuvable après insertion.');
  }
  return toMedication(created);
}

/**
 * Met à jour un médicament (mise à jour partielle).
 *
 * `stockQuantity` est explicitement refusé : toute variation de stock doit
 * passer par `POST /api/medications/:id/adjust-stock`, sinon le journal des
 * mouvements cesserait d'être la source de vérité.
 */
export async function updateMedication(
  id: number,
  input: z.infer<typeof updateMedicationSchema>,
): Promise<Medication> {
  const current = await repository.findMedicationById(id);
  if (!current) {
    throw AppError.notFound('Médicament introuvable.', 'MEDICATION_NOT_FOUND');
  }

  if (input.stockQuantity !== undefined) {
    throw AppError.conflict(
      'La quantité en stock ne peut pas être modifiée directement. Utilisez POST /api/medications/:id/adjust-stock pour enregistrer une entrée ou une sortie.',
      'STOCK_QUANTITY_READ_ONLY',
    );
  }

  // Unicité (name, unit) : vérifiée avant l'UPDATE pour renvoyer un message clair.
  if (input.name !== undefined || input.unit !== undefined) {
    const name = input.name ?? current.name;
    const unit = input.unit ?? current.unit;
    const duplicate = await repository.findMedicationByNameAndUnit(name, unit, id);
    if (duplicate) {
      throw AppError.conflict(
        `Le médicament « ${name} » (${unit}) existe déjà dans le catalogue.`,
        'MEDICATION_ALREADY_EXISTS',
      );
    }
  }

  const values: Record<string, unknown> = {
    name: input.name,
    category: input.category,
    unit: input.unit,
    price: input.price === undefined ? undefined : String(input.price),
    alert_threshold: input.alertThreshold,
    expiry_date:
      input.expiryDate === undefined ? undefined : toMySqlDate(input.expiryDate),
    supplier: input.supplier,
  };

  const { sql, params } = buildSetClause(values, repository.MEDICATION_EDITABLE_COLUMNS);
  await repository.updateMedication(id, sql, params);

  const updated = await repository.findMedicationById(id);
  if (!updated) {
    throw AppError.internal('Le médicament mis à jour est introuvable.');
  }
  return toMedication(updated);
}

/**
 * Supprime un médicament.
 *
 * Les lignes d'ordonnance et les mouvements de stock constituent un historique
 * comptable et médical : la suppression est refusée dès qu'ils existent.
 *
 * @throws AppError 409 si un historique référence le médicament.
 */
export async function deleteMedication(id: number): Promise<void> {
  const current = await repository.findMedicationById(id);
  if (!current) {
    throw AppError.notFound('Médicament introuvable.', 'MEDICATION_NOT_FOUND');
  }

  const prescriptionItems = await repository.countPrescriptionItems(id);
  if (prescriptionItems > 0) {
    throw AppError.conflict(
      `Ce médicament est référencé par ${prescriptionItems} ligne(s) d’ordonnance : la suppression est impossible.`,
      'MEDICATION_REFERENCED',
    );
  }

  const movements = await repository.countMovements(id);
  if (movements > 0) {
    throw AppError.conflict(
      `Ce médicament possède ${movements} mouvement(s) de stock : la suppression effacerait son historique. Archivez-le plutôt.`,
      'MEDICATION_REFERENCED',
    );
  }

  await repository.deleteMedication(id);
}

/* -------------------------------------------------------------------------- */
/* Stock                                                                       */
/* -------------------------------------------------------------------------- */

/** Résultat d'un ajustement de stock : le mouvement créé et l'état relu. */
export interface StockAdjustmentResult {
  movement: StockMovement;
  medication: Medication;
}

/**
 * Enregistre une entrée ou une sortie de stock.
 *
 * Le stock disponible est vérifié AVANT l'écriture pour renvoyer un message
 * explicite ; le trigger `trg_stock_movement_before_insert` reste toutefois le
 * garde-fou transactionnel (SQLSTATE 45000 → HTTP 409).
 *
 * @throws AppError 409 si la sortie dépasse le stock disponible.
 */
export async function adjustStock(
  id: number,
  input: { type: StockMovementType; quantity: number; reason: string },
  userId: number,
): Promise<StockAdjustmentResult> {
  const medication = await repository.findMedicationById(id);
  if (!medication) {
    throw AppError.notFound('Médicament introuvable.', 'MEDICATION_NOT_FOUND');
  }

  if (input.type === 'OUT' && input.quantity > medication.stock_quantity) {
    throw AppError.conflict(
      `Stock insuffisant : ${medication.stock_quantity} ${medication.unit}(s) disponible(s) pour une sortie de ${input.quantity}.`,
      'INSUFFICIENT_STOCK',
      {
        available: medication.stock_quantity,
        requested: input.quantity,
        unit: medication.unit,
      },
    );
  }

  const movementId = await repository.insertStockMovement({
    medicationId: id,
    type: input.type,
    quantity: input.quantity,
    reason: input.reason,
    userId,
  });

  // Le stock vient d'être modifié par trigger : on relit l'état réel.
  const refreshed = await repository.findMedicationById(id);
  const movement = await repository.findMovementById(movementId);

  if (!refreshed || !movement) {
    throw AppError.internal('Le mouvement de stock enregistré est introuvable.');
  }

  return { movement: toMovement(movement), medication: toMedication(refreshed) };
}

/** Historique paginé des mouvements d'un médicament. */
export async function listMovementsForMedication(
  id: number,
  pagination: Pagination,
): Promise<{ data: StockMovement[]; total: number }> {
  const medication = await repository.findMedicationById(id);
  if (!medication) {
    throw AppError.notFound('Médicament introuvable.', 'MEDICATION_NOT_FOUND');
  }

  const { rows, total } = await repository.findMovementsByMedication(
    id,
    pagination.limit,
    pagination.offset,
  );
  return { data: rows.map(toMovement), total };
}

/* -------------------------------------------------------------------------- */
/* Vue transversale du stock (utilisée par /api/stock)                         */
/* -------------------------------------------------------------------------- */

/** Filtres normalisés de la liste des mouvements. */
export interface MovementQuery {
  page: number;
  limit: number;
  sort?: string;
  order?: 'asc' | 'desc';
  medicationId?: number;
  type?: StockMovementType;
  userId?: number;
  from?: string;
  to?: string;
}

/** Tous les mouvements de stock, filtres et pagination compris. */
export async function listAllMovements(
  filters: MovementQuery,
  pagination: Pagination,
): Promise<{ data: StockMovement[]; total: number }> {
  const orderBy = buildOrderBy(
    filters.sort,
    filters.order,
    MOVEMENT_SORTABLE_COLUMNS,
    'sm.created_at',
    'desc',
  );

  const { rows, total } = await repository.findMovements({
    medicationId: filters.medicationId,
    type: filters.type,
    userId: filters.userId,
    from: filters.from,
    to: filters.to,
    orderBy,
    limit: pagination.limit,
    offset: pagination.offset,
  });

  return { data: rows.map(toMovement), total };
}

/** Un mouvement de stock précis. */
export async function getMovement(id: number): Promise<StockMovement> {
  const row = await repository.findMovementById(id);
  if (!row) {
    throw AppError.notFound('Mouvement de stock introuvable.', 'MOVEMENT_NOT_FOUND');
  }
  return toMovement(row);
}

/** Alertes consolidées : stock bas, péremption proche, périmés. */
export async function getStockAlerts(): Promise<{
  lowStock: StockAlertMedication[];
  expiringSoon: Medication[];
  expired: Medication[];
}> {
  const [lowStock, expiringSoon, expired] = await Promise.all([
    repository.findLowStock(),
    repository.findExpiringSoon(),
    repository.findExpired(),
  ]);

  return {
    lowStock: lowStock.map(toStockAlert),
    expiringSoon: expiringSoon.map(toMedication),
    expired: expired.map(toMedication),
  };
}

/** Indicateurs agrégés du stock (valeurs numériques pour les graphiques). */
export async function getStockSummary(): Promise<{
  totalReferences: number;
  totalUnits: number;
  stockValue: number;
  lowStockCount: number;
  expiredCount: number;
  movementsThisMonth: number;
}> {
  const row = await repository.findStockSummary();

  // Les DECIMAL sont renvoyés en chaîne par le pilote : on ne convertit en
  // nombre qu'ici, dans un agrégat de statistiques.
  return {
    totalReferences: Number(row?.total_references ?? 0),
    totalUnits: Number(row?.total_units ?? 0),
    stockValue: Number(row?.stock_value ?? 0),
    lowStockCount: Number(row?.low_stock_count ?? 0),
    expiredCount: Number(row?.expired_count ?? 0),
    movementsThisMonth: Number(row?.movements_this_month ?? 0),
  };
}
