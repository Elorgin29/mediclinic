/**
 * Contrôleurs HTTP du catalogue de médicaments.
 * Aucune règle métier ici : extraction des données de la requête, appel au
 * service et mise en forme de la réponse.
 */

import {
  adjustStockSchema,
  createMedicationSchema,
  updateMedicationSchema,
} from '@mediclinic/shared';
import type { RequestHandler } from 'express';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler, parseBooleanQuery, parseIdParam } from '../../utils/http.js';
import { paginated, parsePagination } from '../../utils/pagination.js';
import * as service from './medications.service.js';

/** Valeur booléenne de query string, `undefined` si le paramètre est absent. */
function booleanFilter(value: unknown): boolean | undefined {
  return parseBooleanQuery(value);
}

/**
 * GET /api/medications
 * Liste paginée : recherche (nom, fournisseur), catégorie, stock bas,
 * péremption proche ou passée.
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const pagination = parsePagination(query);

  const { data, total } = await service.listMedications(
    {
      page: pagination.page,
      limit: pagination.limit,
      search: typeof query.search === 'string' ? query.search : undefined,
      sort: typeof query.sort === 'string' ? query.sort : undefined,
      order: query.order === 'asc' ? 'asc' : query.order === 'desc' ? 'desc' : undefined,
      category: typeof query.category === 'string' ? query.category : undefined,
      lowStock: booleanFilter(query.lowStock),
      expiringSoon: booleanFilter(query.expiringSoon),
      expired: booleanFilter(query.expired),
    },
    pagination,
  );

  res.json(paginated(data, total, pagination));
});

/**
 * GET /api/medications/categories
 * Catégories distinctes, pour alimenter les filtres du front.
 */
export const categories: RequestHandler = asyncHandler(async (_req, res) => {
  const data = await service.listCategories();
  res.json({ data });
});

/**
 * GET /api/medications/low-stock
 * Médicaments dont le stock est inférieur ou égal au seuil d'alerte
 * (vue `v_low_stock_medications`).
 */
export const lowStock: RequestHandler = asyncHandler(async (_req, res) => {
  const data = await service.listLowStock();
  res.json({ data });
});

/**
 * GET /api/medications/:id
 * Fiche détaillée d'un médicament + ses 10 derniers mouvements de stock.
 */
export const getById: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const { medication, movements } = await service.getMedication(id);
  res.json({ data: { ...medication, movements } });
});

/**
 * POST /api/medications
 * Crée un médicament ; le stock initial éventuel devient un mouvement `IN`.
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');

  const input = createMedicationSchema.parse(req.body);
  const medication = await service.createMedication(input, req.user.id);

  setAuditPayload(res, {
    action: 'CREATE',
    resource: 'medication',
    resourceId: medication.id,
    newValue: { name: medication.name, unit: medication.unit, stock_quantity: medication.stock_quantity },
  });

  res.status(201).json({ data: medication });
});

/**
 * PATCH /api/medications/:id
 * Met à jour la fiche. La quantité en stock est refusée (409) : elle ne change
 * que par un mouvement de stock.
 */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const input = updateMedicationSchema.parse(req.body);
  const medication = await service.updateMedication(id, input);

  setAuditPayload(res, {
    action: 'UPDATE',
    resource: 'medication',
    resourceId: id,
    newValue: input,
  });

  res.json({ data: medication });
});

/**
 * DELETE /api/medications/:id
 * Suppression physique refusée dès qu'un historique (ordonnance ou mouvement)
 * référence le médicament.
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  await service.deleteMedication(id);

  setAuditPayload(res, { action: 'DELETE', resource: 'medication', resourceId: id });
  res.status(204).send();
});

/**
 * POST /api/medications/:id/adjust-stock
 * Enregistre une entrée ou une sortie de stock et renvoie l'état relu.
 */
export const adjustStock: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');

  const id = parseIdParam(req);
  const input = adjustStockSchema.parse(req.body);
  const result = await service.adjustStock(id, input, req.user.id);

  setAuditPayload(res, {
    action: 'STOCK_ADJUST',
    resource: 'stock',
    resourceId: result.movement.id,
    newValue: {
      medication_id: id,
      type: input.type,
      quantity: input.quantity,
      reason: input.reason,
      stock_quantity: result.medication.stock_quantity,
    },
  });

  res.status(201).json({ data: result });
});

/**
 * GET /api/medications/:id/movements
 * Historique paginé des mouvements de stock du médicament.
 */
export const movements: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const pagination = parsePagination(req.query);
  const { data, total } = await service.listMovementsForMedication(id, pagination);
  res.json(paginated(data, total, pagination));
});
