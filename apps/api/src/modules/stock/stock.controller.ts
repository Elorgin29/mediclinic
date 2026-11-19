/**
 * Contrôleurs HTTP de la vue transversale du stock.
 *
 * Aucune règle métier ici : lecture de la requête validée, appel au service et
 * mise en forme de la réponse. Les listes passent par `paginated(...)` ; les
 * objets uniques sont renvoyés sous `{ data }`.
 */

import { stockQuerySchema } from '@mediclinic/shared';
import type { RequestHandler } from 'express';

import { asyncHandler, parseIdParam } from '../../utils/http.js';
import { paginated, parsePagination } from '../../utils/pagination.js';
import * as service from './stock.service.js';

/**
 * GET /api/stock/movements
 * Historique paginé des mouvements, filtrable par médicament, type et période.
 */
export const listMovements: RequestHandler = asyncHandler(async (req, res) => {
  const query = stockQuerySchema.parse(req.query);
  const pagination = parsePagination(query);

  const { data, total } = await service.listMovements(
    {
      page: pagination.page,
      limit: pagination.limit,
      sort: query.sort,
      order: query.order,
      medicationId: query.medicationId,
      type: query.type,
      from: query.from,
      to: query.to,
    },
    pagination,
  );

  res.json(paginated(data, total, pagination));
});

/**
 * GET /api/stock/movements/:id
 * Un mouvement précis, avec le médicament et l'auteur.
 */
export const getMovement: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  res.json({ data: await service.getMovement(id) });
});

/**
 * GET /api/stock/alerts
 * Alertes consolidées : stock bas, péremption proche et médicaments périmés.
 */
export const alerts: RequestHandler = asyncHandler(async (_req, res) => {
  res.json({ data: await service.getAlerts() });
});

/**
 * GET /api/stock/summary
 * Indicateurs agrégés (références, unités, valeur, alertes, mouvements du mois).
 */
export const summary: RequestHandler = asyncHandler(async (_req, res) => {
  res.json({ data: await service.getSummary() });
});
