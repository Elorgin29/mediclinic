/**
 * Contrôleurs HTTP du module « Actualités ».
 *
 * Les routes publiques (`/public`) ne nécessitent aucun jeton et ne renvoient
 * que des articles publiés ; les autres routes sont protégées par les
 * permissions `news:*`.
 */

import { newsQuerySchema } from '@mediclinic/shared';
import type { Request, RequestHandler } from 'express';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import type { AuthUser } from '../../types/auth.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler, parseIdParam } from '../../utils/http.js';
import { parsePagination } from '../../utils/pagination.js';
import * as service from './news.service.js';

/** Récupère l'utilisateur authentifié (garanti par `authenticate`). */
function requireUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
  return req.user;
}

/** GET /api/news/public — articles publiés pour le site public. */
export const publicList: RequestHandler = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query);
  res.json({ data: await service.listPublished(pagination.limit) });
});

/** GET /api/news/public/:slug — détail d'un article publié. */
export const publicBySlug: RequestHandler = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug ?? '');
  res.json({ data: await service.getPublishedBySlug(slug) });
});

/** GET /api/news — liste d'administration, brouillons inclus. */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const query = newsQuerySchema.parse(req.query);
  const pagination = parsePagination(query);

  const result = await service.list(
    {
      status: query.status,
      category: query.category,
      search: query.search,
      sort: query.sort,
      order: query.order,
    },
    pagination,
  );
  res.json(result);
});

/** GET /api/news/:id — article complet. */
export const detail: RequestHandler = asyncHandler(async (req, res) => {
  res.json({ data: await service.getById(parseIdParam(req)) });
});

/** POST /api/news — création d'un article. */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const article = await service.create(req.body as service.CreateNewsInput, user.id);

  setAuditPayload(res, {
    action: 'CREATE',
    resource: 'news',
    resourceId: article.id,
    newValue: { slug: article.slug, title: article.title, status: article.status },
  });
  res.status(201).json({ data: article });
});

/** PATCH /api/news/:id — mise à jour partielle. */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const { before, after } = await service.update(id, req.body as service.UpdateNewsInput);

  setAuditPayload(res, {
    action: 'UPDATE',
    resource: 'news',
    resourceId: id,
    oldValue: { title: before.title, status: before.status },
    newValue: { title: after.title, status: after.status },
  });
  res.json({ data: after });
});

/** DELETE /api/news/:id — suppression définitive. */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const article = await service.remove(id);

  setAuditPayload(res, {
    action: 'DELETE',
    resource: 'news',
    resourceId: id,
    oldValue: { slug: article.slug, title: article.title },
  });
  res.status(204).send();
});
