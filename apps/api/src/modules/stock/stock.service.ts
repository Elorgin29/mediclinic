/**
 * Règles métier de la vue transversale du stock.
 *
 * Ce module ne fait que LIRE : toute variation de `medications.stock_quantity`
 * s'écrit via un `stock_movements` (module medications pour l'ajustement
 * manuel, module prescriptions pour la dispensation). Aucune fonction de ce
 * fichier ne modifie le stock.
 *
 * Les agrégats DECIMAL sont renvoyés en chaîne par le pilote (voir
 * CONVENTIONS.md §5) : leur conversion en nombre est faite ici, à un seul
 * endroit, pour que le front reçoive toujours des `number`.
 */

import type {
  Medication,
  StockMovement,
  StockMovementType,
} from '@mediclinic/shared';

import { AppError } from '../../utils/app-error.js';
import { buildOrderBy, type Pagination } from '../../utils/pagination.js';
import * as repository from './stock.repository.js';
import type {
  LowStockRow,
  MedicationRow,
  MovementDetailRow,
} from './stock.repository.js';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Filtres normalisés de `GET /api/stock/movements`. */
export interface MovementQuery {
  page: number;
  limit: number;
  sort?: string;
  order?: 'asc' | 'desc';
  medicationId?: number;
  type?: StockMovementType;
  from?: string;
  to?: string;
}

/** Médicament en alerte de stock, enrichi des indicateurs de la vue. */
export interface StockAlertMedication extends Medication {
  missing_quantity: number;
  is_expired: boolean;
  expires_soon: boolean;
}

/** Alertes consolidées du stock. */
export interface StockAlerts {
  lowStock: StockAlertMedication[];
  expiringSoon: Medication[];
  expired: Medication[];
}

/** Indicateurs agrégés affichés sur le tableau de bord du stock. */
export interface StockSummary {
  totalReferences: number;
  totalUnits: number;
  stockValue: number;
  lowStockCount: number;
  expiredCount: number;
  movementsThisMonth: number;
}

/* -------------------------------------------------------------------------- */
/* Tri                                                                        */
/* -------------------------------------------------------------------------- */

/** Colonnes de tri autorisées (liste blanche : aucune expression client). */
const MOVEMENT_SORTABLE_COLUMNS: Readonly<Record<string, string>> = {
  created_at: 'sm.created_at',
  type: 'sm.type',
  quantity: 'sm.quantity',
  medication_name: 'm.name',
};

/* -------------------------------------------------------------------------- */
/* Conversions ligne SQL → objet exposé                                       */
/* -------------------------------------------------------------------------- */

/**
 * Convertit une ligne `medications` en objet partagé `Medication`.
 * `is_low_stock` est calculé en SQL, jamais deviné en JS.
 */
export function toMedication(row: MedicationRow): Medication {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    // DECIMAL renvoyé en chaîne par le pilote, conformément au type partagé.
    price: String(row.price),
    stock_quantity: row.stock_quantity,
    alert_threshold: row.alert_threshold,
    expiry_date: row.expiry_date,
    supplier: row.supplier,
    is_low_stock: Boolean(row.is_low_stock),
    created_at: String(row.created_at),
  };
}

/** Convertit une ligne de `v_low_stock_medications` en médicament en alerte. */
export function toStockAlert(row: LowStockRow): StockAlertMedication {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    price: String(row.price),
    stock_quantity: row.stock_quantity,
    alert_threshold: row.alert_threshold,
    expiry_date: row.expiry_date,
    supplier: row.supplier,
    is_low_stock: true,
    missing_quantity: row.missing_quantity,
    is_expired: Boolean(row.is_expired),
    expires_soon: Boolean(row.expires_soon),
    // La vue ne projette pas `created_at` : champ facultatif du type partagé.
    created_at: '',
  };
}

/**
 * Convertit un mouvement enrichi en objet partagé `StockMovement`.
 * L'unité du médicament est ajoutée : elle n'existe pas dans le type partagé
 * mais évite au front un second appel pour l'afficher.
 */
export function toMovement(row: MovementDetailRow): StockMovement & { medication_unit: string } {
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
    medication_unit: row.medication_unit,
  };
}

/* -------------------------------------------------------------------------- */
/* Lectures                                                                   */
/* -------------------------------------------------------------------------- */

/** Liste paginée de tous les mouvements de stock, filtres compris. */
export async function listMovements(
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
    from: filters.from,
    to: filters.to,
    orderBy,
    limit: pagination.limit,
    offset: pagination.offset,
  });

  return { data: rows.map(toMovement), total };
}

/** Un mouvement de stock précis, ou 404. */
export async function getMovement(id: number): Promise<StockMovement> {
  const row = await repository.findMovementById(id);
  if (!row) {
    throw AppError.notFound('Mouvement de stock introuvable.', 'MOVEMENT_NOT_FOUND');
  }
  return toMovement(row);
}

/**
 * Alertes consolidées : stock bas (vue `v_low_stock_medications`), péremption
 * dans les 30 jours et médicaments déjà périmés.
 * Les trois requêtes sont indépendantes : elles partent en parallèle.
 */
export async function getAlerts(): Promise<StockAlerts> {
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

/**
 * Indicateurs agrégés du stock.
 * Toutes les valeurs sont converties avec `Number(...)` : les agrégats DECIMAL
 * (`stock_value`) arrivent en chaîne, les `COALESCE` peuvent renvoyer `NULL`.
 */
export async function getSummary(): Promise<StockSummary> {
  const row = await repository.findSummary();

  return {
    totalReferences: Number(row?.total_references ?? 0),
    totalUnits: Number(row?.total_units ?? 0),
    stockValue: Number(row?.stock_value ?? 0),
    lowStockCount: Number(row?.low_stock_count ?? 0),
    expiredCount: Number(row?.expired_count ?? 0),
    movementsThisMonth: Number(row?.movements_this_month ?? 0),
  };
}
