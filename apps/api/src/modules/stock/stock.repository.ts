/**
 * Accès aux données transversales du stock.
 *
 * Ce module ne fait que LIRE : toute variation de stock s'écrit via un
 * `stock_movements`, dont l'insertion est portée par le module medications
 * (route `POST /api/medications/:id/adjust-stock`).
 *
 * Toutes les requêtes sont préparées (`?`).
 */

import type { Row } from '../../config/db.js';
import { query, queryOne } from '../../config/db.js';

/* -------------------------------------------------------------------------- */
/* Lignes SQL                                                                  */
/* -------------------------------------------------------------------------- */

/** Mouvement de stock enrichi du médicament et de l'auteur du mouvement. */
export interface MovementDetailRow extends Row {
  id: number;
  medication_id: number;
  type: 'IN' | 'OUT';
  quantity: number;
  reason: string;
  user_id: number;
  created_at: string;
  medication_name: string;
  medication_unit: string;
  user_name: string;
}

/** Ligne de la vue `v_low_stock_medications`. */
export interface LowStockRow extends Row {
  id: number;
  name: string;
  category: string;
  unit: string;
  price: string;
  stock_quantity: number;
  alert_threshold: number;
  expiry_date: string | null;
  supplier: string | null;
  missing_quantity: number;
  is_expired: number;
  expires_soon: number;
}

/** Ligne de `medications` utilisée pour les alertes de péremption. */
export interface MedicationRow extends Row {
  id: number;
  name: string;
  category: string;
  unit: string;
  price: string;
  stock_quantity: number;
  alert_threshold: number;
  expiry_date: string | null;
  supplier: string | null;
  created_at: string;
  updated_at: string;
  is_low_stock: number;
}

/** Indicateurs agrégés du stock. */
export interface StockSummaryRow extends Row {
  total_references: number;
  total_units: number | null;
  stock_value: string | null;
  low_stock_count: number;
  expired_count: number;
  movements_this_month: number;
}

/* -------------------------------------------------------------------------- */
/* Requêtes                                                                    */
/* -------------------------------------------------------------------------- */

/** Colonnes communes à toutes les lectures de mouvement. */
const MOVEMENT_COLUMNS = `
  sm.id,
  sm.medication_id,
  sm.type,
  sm.quantity,
  sm.reason,
  sm.user_id,
  sm.created_at,
  m.name AS medication_name,
  m.unit AS medication_unit,
  CONCAT(u.first_name, ' ', u.last_name) AS user_name
`;

const MOVEMENT_JOINS = `
  FROM stock_movements sm
  JOIN medications m ON m.id = sm.medication_id
  JOIN users u       ON u.id = sm.user_id
`;

/**
 * Filtres de la liste des mouvements.
 * Les fragments SQL sont construits ici, à partir de valeurs passées en
 * marqueurs `?` : aucun contenu client n'est concaténé.
 */
export interface MovementFilters {
  medicationId?: number;
  type?: 'IN' | 'OUT';
  userId?: number;
  from?: string;
  to?: string;
  orderBy: string;
  limit: number;
  offset: number;
}

/** Construit la clause WHERE et les paramètres associés. */
function buildMovementWhere(filters: {
  medicationId?: number;
  type?: 'IN' | 'OUT';
  userId?: number;
  from?: string;
  to?: string;
}): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.medicationId !== undefined) {
    conditions.push('sm.medication_id = ?');
    params.push(filters.medicationId);
  }
  if (filters.type !== undefined) {
    conditions.push('sm.type = ?');
    params.push(filters.type);
  }
  if (filters.userId !== undefined) {
    conditions.push('sm.user_id = ?');
    params.push(filters.userId);
  }
  if (filters.from !== undefined && filters.from.length > 0) {
    conditions.push('sm.created_at >= ?');
    params.push(filters.from);
  }
  if (filters.to !== undefined && filters.to.length > 0) {
    conditions.push('sm.created_at <= ?');
    params.push(filters.to);
  }

  return {
    where: conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

/** Liste paginée de tous les mouvements de stock. */
export async function findMovements(
  filters: MovementFilters,
): Promise<{ rows: MovementDetailRow[]; total: number }> {
  const { where, params } = buildMovementWhere(filters);

  const rows = await query<MovementDetailRow>(
    `SELECT ${MOVEMENT_COLUMNS}
     ${MOVEMENT_JOINS}
     ${where}
     ORDER BY ${filters.orderBy}
     LIMIT ? OFFSET ?`,
    [...params, filters.limit, filters.offset],
  );

  // Le total est compté sans jointure : c'est inutile et plus coûteux ici.
  const totalRow = await queryOne<Row & { total: number }>(
    `SELECT COUNT(*) AS total FROM stock_movements sm ${where}`,
    params,
  );

  return { rows, total: Number(totalRow?.total ?? 0) };
}

/** Un mouvement de stock précis (avec médicament et auteur). */
export async function findMovementById(id: number): Promise<MovementDetailRow | null> {
  return queryOne<MovementDetailRow>(
    `SELECT ${MOVEMENT_COLUMNS} ${MOVEMENT_JOINS} WHERE sm.id = ?`,
    [id],
  );
}

/** Alertes de stock bas (vue `v_low_stock_medications`). */
export async function findLowStock(): Promise<LowStockRow[]> {
  return query<LowStockRow>(
    `SELECT id, name, category, unit, price, stock_quantity, alert_threshold,
            expiry_date, supplier, missing_quantity, is_expired, expires_soon
     FROM v_low_stock_medications
     ORDER BY missing_quantity DESC, name ASC`,
  );
}

/** Médicaments dont la péremption survient dans les 30 prochains jours. */
export async function findExpiringSoon(): Promise<MedicationRow[]> {
  return query<MedicationRow>(
    `SELECT m.id, m.name, m.category, m.unit, m.price, m.stock_quantity,
            m.alert_threshold, m.expiry_date, m.supplier, m.created_at, m.updated_at,
            (m.stock_quantity <= m.alert_threshold) AS is_low_stock
     FROM medications m
     WHERE m.expiry_date IS NOT NULL
       AND m.expiry_date >= CURDATE()
       AND m.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
     ORDER BY m.expiry_date ASC, m.name ASC`,
  );
}

/** Médicaments déjà périmés. */
export async function findExpired(): Promise<MedicationRow[]> {
  return query<MedicationRow>(
    `SELECT m.id, m.name, m.category, m.unit, m.price, m.stock_quantity,
            m.alert_threshold, m.expiry_date, m.supplier, m.created_at, m.updated_at,
            (m.stock_quantity <= m.alert_threshold) AS is_low_stock
     FROM medications m
     WHERE m.expiry_date IS NOT NULL AND m.expiry_date < CURDATE()
     ORDER BY m.expiry_date ASC, m.name ASC`,
  );
}

/** Indicateurs agrégés du stock (une seule ligne). */
export async function findSummary(): Promise<StockSummaryRow | null> {
  return queryOne<StockSummaryRow>(
    `SELECT
       (SELECT COUNT(*) FROM medications)                                  AS total_references,
       (SELECT COALESCE(SUM(stock_quantity), 0) FROM medications)          AS total_units,
       (SELECT COALESCE(SUM(stock_quantity * price), 0) FROM medications)  AS stock_value,
       (SELECT COUNT(*) FROM medications WHERE stock_quantity <= alert_threshold)
                                                                           AS low_stock_count,
       (SELECT COUNT(*) FROM medications
         WHERE expiry_date IS NOT NULL AND expiry_date < CURDATE())        AS expired_count,
       (SELECT COUNT(*) FROM stock_movements
         WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
           AND created_at < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH))
                                                                           AS movements_this_month`,
  );
}
