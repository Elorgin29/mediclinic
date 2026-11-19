/**
 * Accès aux données des médicaments et de leur stock.
 *
 * Règle structurelle : `medications.stock_quantity` est maintenue par les
 * triggers de `001_init.sql`. Elle n'apparaît donc JAMAIS dans une clause
 * `INSERT` ou `SET` de ce fichier : le stock n'évolue qu'en insérant une ligne
 * dans `stock_movements`.
 *
 * Toutes les requêtes sont préparées (`?`) ; aucune valeur client n'est
 * concaténée dans le SQL.
 */

import type { Row } from '../../config/db.js';
import { execute, executeWith, query, queryOne, withTransaction } from '../../config/db.js';

/* -------------------------------------------------------------------------- */
/* Lignes SQL                                                                  */
/* -------------------------------------------------------------------------- */

/** Ligne brute de la table `medications`. */
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

/** Ligne de la vue `v_low_stock_medications` (vue = médicament + alertes). */
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

/** Mouvement de stock brut. */
export interface StockMovementRow extends Row {
  id: number;
  medication_id: number;
  type: 'IN' | 'OUT';
  quantity: number;
  reason: string;
  user_id: number;
  created_at: string;
}

/** Mouvement de stock enrichi du médicament et de l'auteur. */
export interface StockMovementDetailRow extends StockMovementRow {
  medication_name: string;
  user_name: string;
}

/* -------------------------------------------------------------------------- */
/* Listes et écritures                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Colonnes exposées en lecture.
 * `is_low_stock` est calculé en SQL pour rester cohérent avec la vue
 * `v_low_stock_medications` et éviter toute divergence côté application.
 * `stock_quantity` reste en lecture seule : jamais dans une écriture.
 */
const MEDICATION_COLUMNS = `
  m.id,
  m.name,
  m.category,
  m.unit,
  m.price,
  m.stock_quantity,
  m.alert_threshold,
  m.expiry_date,
  m.supplier,
  m.created_at,
  m.updated_at,
  (m.stock_quantity <= m.alert_threshold) AS is_low_stock
`;

/** Colonnes modifiables par `PATCH /api/medications/:id` (liste blanche). */
export const MEDICATION_EDITABLE_COLUMNS = [
  'name',
  'category',
  'unit',
  'price',
  'alert_threshold',
  'expiry_date',
  'supplier',
] as const;

export interface MedicationListFilters {
  /** Recherche libre (nom ou fournisseur). */
  search?: string;
  category?: string;
  /** `stock_quantity <= alert_threshold`. */
  lowStock?: boolean;
  /** Péremption dans les 30 prochains jours. */
  expiringSoon?: boolean;
  /** Déjà périmé. */
  expired?: boolean;
  orderBy: string;
  limit: number;
  offset: number;
}

export interface MedicationInput {
  name: string;
  category: string;
  unit: string;
  price: string;
  alertThreshold: number;
  expiryDate: string | null;
  supplier: string | null;
}

/** Récupère un médicament par son identifiant. */
export async function findMedicationById(id: number): Promise<MedicationRow | null> {
  return queryOne<MedicationRow>(
    `SELECT ${MEDICATION_COLUMNS} FROM medications m WHERE m.id = ?`,
    [id],
  );
}

/** Recherche un doublon sur la contrainte unique `(name, unit)`. */
export async function findMedicationByNameAndUnit(
  name: string,
  unit: string,
  excludeId?: number,
): Promise<MedicationRow | null> {
  // Le filtre d'exclusion n'est ajouté qu'à la mise à jour : la structure de
  // la requête reste ainsi entièrement statique.
  const excludeClause = excludeId === undefined ? '' : 'AND m.id <> ?';
  const params: unknown[] = excludeId === undefined ? [name, unit] : [name, unit, excludeId];

  return queryOne<MedicationRow>(
    `SELECT ${MEDICATION_COLUMNS}
     FROM medications m
     WHERE m.name = ? AND m.unit = ? ${excludeClause}`,
    params,
  );
}

/** Liste paginée des médicaments, avec le champ calculé `is_low_stock`. */
export async function findMedications(
  filters: MedicationListFilters,
): Promise<{ rows: MedicationRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.search !== undefined && filters.search.length > 0) {
    conditions.push('(m.name LIKE ? OR m.supplier LIKE ?)');
    const pattern = `%${filters.search}%`;
    params.push(pattern, pattern);
  }
  if (filters.category !== undefined && filters.category.length > 0) {
    conditions.push('m.category = ?');
    params.push(filters.category);
  }
  if (filters.lowStock === true) {
    conditions.push('m.stock_quantity <= m.alert_threshold');
  }
  if (filters.expiringSoon === true) {
    conditions.push(
      'm.expiry_date IS NOT NULL AND m.expiry_date >= CURDATE() AND m.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)',
    );
  }
  if (filters.expired === true) {
    conditions.push('m.expiry_date IS NOT NULL AND m.expiry_date < CURDATE()');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await query<MedicationRow>(
    `SELECT ${MEDICATION_COLUMNS}
     FROM medications m
     ${where}
     ORDER BY ${filters.orderBy}
     LIMIT ? OFFSET ?`,
    [...params, filters.limit, filters.offset],
  );

  const totalRow = await queryOne<Row & { total: number }>(
    `SELECT COUNT(*) AS total FROM medications m ${where}`,
    params,
  );

  return { rows, total: Number(totalRow?.total ?? 0) };
}

/** Catégories distinctes, pour alimenter les filtres du front. */
export async function findCategories(): Promise<string[]> {
  const rows = await query<Row & { category: string }>(
    'SELECT DISTINCT category FROM medications ORDER BY category ASC',
  );
  return rows.map((row) => row.category);
}

/** Alertes de stock (vue `v_low_stock_medications`). */
export async function findLowStock(): Promise<LowStockRow[]> {
  return query<LowStockRow>(
    `SELECT id, name, category, unit, price, stock_quantity, alert_threshold,
            expiry_date, supplier, missing_quantity, is_expired, expires_soon
     FROM v_low_stock_medications
     ORDER BY missing_quantity DESC, name ASC`,
  );
}

/** Médicaments dont la péremption tombe dans les 30 prochains jours. */
export async function findExpiringSoon(): Promise<MedicationRow[]> {
  return query<MedicationRow>(
    `SELECT ${MEDICATION_COLUMNS}
     FROM medications m
     WHERE m.expiry_date IS NOT NULL
       AND m.expiry_date >= CURDATE()
       AND m.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
     ORDER BY m.expiry_date ASC`,
  );
}

/** Médicaments déjà périmés. */
export async function findExpired(): Promise<MedicationRow[]> {
  return query<MedicationRow>(
    `SELECT ${MEDICATION_COLUMNS}
     FROM medications m
     WHERE m.expiry_date IS NOT NULL AND m.expiry_date < CURDATE()
     ORDER BY m.expiry_date ASC`,
  );
}

/**
 * Crée un médicament.
 *
 * `stock_quantity` n'est pas écrit : la colonne prend sa valeur par défaut
 * (0) puis le stock initial est injecté via un mouvement `IN`, exactement
 * comme pour toute autre entrée de stock. Si `initialQuantity` est fourni,
 * les deux écritures ont lieu dans la même transaction : un échec du mouvement
 * annule la création, ce qui évite un catalogue désynchronisé.
 */
export async function createMedication(
  input: MedicationInput,
  initialQuantity: number,
  userId: number,
): Promise<number> {
  return withTransaction(async (connection) => {
    const result = await executeWith(
      connection,
      `INSERT INTO medications (name, category, unit, price, alert_threshold, expiry_date, supplier)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name,
        input.category,
        input.unit,
        input.price,
        input.alertThreshold,
        input.expiryDate,
        input.supplier,
      ],
    );
    const medicationId = result.insertId;

    if (initialQuantity > 0) {
      await executeWith(
        connection,
        `INSERT INTO stock_movements (medication_id, type, quantity, reason, user_id)
         VALUES (?, 'IN', ?, ?, ?)`,
        [medicationId, initialQuantity, 'Stock initial', userId],
      );
    }

    return medicationId;
  });
}

/** Met à jour les colonnes autorisées d'un médicament. */
export async function updateMedication(
  id: number,
  setClauseSql: string,
  params: unknown[],
): Promise<void> {
  await execute(`UPDATE medications SET ${setClauseSql} WHERE id = ?`, [...params, id]);
}

/** Nombre de lignes d'ordonnance référençant un médicament. */
export async function countPrescriptionItems(medicationId: number): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    'SELECT COUNT(*) AS total FROM prescription_items WHERE medication_id = ?',
    [medicationId],
  );
  return Number(row?.total ?? 0);
}

/** Supprime un médicament (aucun historique ne doit le référencer). */
export async function deleteMedication(id: number): Promise<void> {
  await execute('DELETE FROM medications WHERE id = ?', [id]);
}

/* -------------------------------------------------------------------------- */
/* Mouvements de stock                                                         */
/* -------------------------------------------------------------------------- */

/** Insère un mouvement de stock : c'est la SEULE façon de faire varier le stock. */
export async function insertStockMovement(params: {
  medicationId: number;
  type: 'IN' | 'OUT';
  quantity: number;
  reason: string;
  userId: number;
}): Promise<number> {
  const result = await execute(
    `INSERT INTO stock_movements (medication_id, type, quantity, reason, user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [params.medicationId, params.type, params.quantity, params.reason, params.userId],
  );
  return result.insertId;
}

/** Un mouvement de stock enrichi du médicament et de l'utilisateur. */
export async function findMovementById(id: number): Promise<StockMovementDetailRow | null> {
  return queryOne<StockMovementDetailRow>(
    `SELECT sm.id, sm.medication_id, sm.type, sm.quantity, sm.reason, sm.user_id, sm.created_at,
            m.name AS medication_name,
            CONCAT(u.first_name, ' ', u.last_name) AS user_name
     FROM stock_movements sm
     JOIN medications m ON m.id = sm.medication_id
     JOIN users u       ON u.id = sm.user_id
     WHERE sm.id = ?`,
    [id],
  );
}

/** Nombre de mouvements enregistrés pour un médicament. */
export async function countMovements(medicationId: number): Promise<number> {
  const row = await queryOne<Row & { total: number }>(
    'SELECT COUNT(*) AS total FROM stock_movements WHERE medication_id = ?',
    [medicationId],
  );
  return Number(row?.total ?? 0);
}

/** Historique paginé des mouvements d'un médicament. */
export async function findMovementsByMedication(
  medicationId: number,
  limit: number,
  offset: number,
): Promise<{ rows: StockMovementDetailRow[]; total: number }> {
  const rows = await query<StockMovementDetailRow>(
    `SELECT sm.id, sm.medication_id, sm.type, sm.quantity, sm.reason, sm.user_id, sm.created_at,
            m.name AS medication_name,
            CONCAT(u.first_name, ' ', u.last_name) AS user_name
     FROM stock_movements sm
     JOIN medications m ON m.id = sm.medication_id
     JOIN users u       ON u.id = sm.user_id
     WHERE sm.medication_id = ?
     ORDER BY sm.created_at DESC, sm.id DESC
     LIMIT ? OFFSET ?`,
    [medicationId, limit, offset],
  );

  return { rows, total: await countMovements(medicationId) };
}

/** Derniers mouvements d'un médicament (fiche détaillée). */
export async function findRecentMovements(
  medicationId: number,
  limit: number,
): Promise<StockMovementDetailRow[]> {
  return query<StockMovementDetailRow>(
    `SELECT sm.id, sm.medication_id, sm.type, sm.quantity, sm.reason, sm.user_id, sm.created_at,
            m.name AS medication_name,
            CONCAT(u.first_name, ' ', u.last_name) AS user_name
     FROM stock_movements sm
     JOIN medications m ON m.id = sm.medication_id
     JOIN users u       ON u.id = sm.user_id
     WHERE sm.medication_id = ?
     ORDER BY sm.created_at DESC, sm.id DESC
     LIMIT ?`,
    [medicationId, limit],
  );
}

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

/** Construit la clause WHERE commune aux mouvements (liste et comptage). */
function movementWhere(filters: Omit<MovementFilters, 'orderBy' | 'limit' | 'offset'>): {
  sql: string;
  params: unknown[];
} {
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
  if (filters.from !== undefined) {
    conditions.push('sm.created_at >= ?');
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    conditions.push('sm.created_at <= ?');
    params.push(filters.to);
  }

  return {
    sql: conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

/** Nombre de mouvements correspondant aux filtres. */
export async function countMovementsFiltered(
  filters: Omit<MovementFilters, 'orderBy' | 'limit' | 'offset'>,
): Promise<number> {
  const where = movementWhere(filters);
  const row = await queryOne<Row & { total: number }>(
    `SELECT COUNT(*) AS total FROM stock_movements sm ${where.sql}`,
    where.params,
  );
  return Number(row?.total ?? 0);
}

/** Liste paginée de tous les mouvements de stock (avec médicament et auteur). */
export async function findMovements(
  filters: MovementFilters,
): Promise<{ rows: StockMovementDetailRow[]; total: number }> {
  const where = movementWhere(filters);

  const rows = await query<StockMovementDetailRow>(
    `SELECT sm.id, sm.medication_id, sm.type, sm.quantity, sm.reason, sm.user_id, sm.created_at,
            m.name AS medication_name,
            CONCAT(u.first_name, ' ', u.last_name) AS user_name
     FROM stock_movements sm
     JOIN medications m ON m.id = sm.medication_id
     JOIN users u       ON u.id = sm.user_id
     ${where.sql}
     ORDER BY ${filters.orderBy}
     LIMIT ? OFFSET ?`,
    [...where.params, filters.limit, filters.offset],
  );

  return { rows, total: await countMovementsFiltered(filters) };
}

/** Indicateurs agrégés du stock (une seule ligne). */
export async function findStockSummary(): Promise<
  (Row & {
    total_references: number;
    total_units: number;
    stock_value: string | number;
    low_stock_count: number;
    expired_count: number;
    movements_this_month: number;
  }) | null
> {
  return queryOne(
    `SELECT
       COUNT(*) AS total_references,
       COALESCE(SUM(stock_quantity), 0) AS total_units,
       COALESCE(SUM(stock_quantity * price), 0) AS stock_value,
       COALESCE(SUM(CASE WHEN stock_quantity <= alert_threshold THEN 1 ELSE 0 END), 0) AS low_stock_count,
       COALESCE(SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date < CURDATE() THEN 1 ELSE 0 END), 0)
         AS expired_count,
       (SELECT COUNT(*) FROM stock_movements
         WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS movements_this_month
     FROM medications`,
  );
}

/** Vérifie l'existence d'un utilisateur (auteur d'un mouvement). */
export async function findUserId(id: number): Promise<number | null> {
  const row = await queryOne<Row & { id: number }>('SELECT id FROM users WHERE id = ?', [id]);
  return row?.id ?? null;
}
