/**
 * Contrôleurs HTTP du tableau de bord.
 * Aucune règle métier et aucun SQL ici : lecture de la requête, appel au
 * service, mise en forme de la réponse.
 */

import type { RequestHandler } from 'express';

import { asyncHandler } from '../../utils/http.js';
import { parsePagination } from '../../utils/pagination.js';
import * as dashboardService from './dashboard.service.js';

/**
 * GET /api/dashboard/stats
 * Indicateurs et graphiques de la page d'accueil (`DashboardPayload`).
 */
export const stats: RequestHandler = asyncHandler(async (_req, res) => {
  const payload = await dashboardService.getDashboardPayload();
  res.json({ data: payload });
});

/**
 * GET /api/dashboard/charts
 * Uniquement les séries des graphiques (rechargement partiel de l'écran).
 */
export const charts: RequestHandler = asyncHandler(async (_req, res) => {
  const data = await dashboardService.getCharts();
  res.json({ data });
});

/**
 * GET /api/dashboard/activity
 * Dernières actions journalisées.
 *
 * Sans paramètre de pagination, la réponse reste `{ data: [...] }` (les 20
 * dernières entrées) ; dès que `page` ou `limit` est fourni, l'enveloppe
 * complète `{ data, meta }` est renvoyée pour que le front puisse paginer.
 */
export const activity: RequestHandler = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  const result = await dashboardService.listActivity(pagination);

  const explicitPagination = req.query.page !== undefined || req.query.limit !== undefined;
  res.json(explicitPagination ? result : { data: result.data });
});
