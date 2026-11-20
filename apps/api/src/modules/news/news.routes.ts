/**
 * Routes du module « Actualités ».
 *
 * Ordre de déclaration impératif : `/public` et `/public/:slug` sont enregistrés
 * AVANT `/:id`, sinon Express interpréterait « public » comme un identifiant.
 *
 * Chaîne de middlewares systématique :
 *   authenticate → requirePermission → validate → auditTrail → contrôleur
 */

import { createNewsSchema, idSchema, updateNewsSchema } from '@mediclinic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './news.controller.js';

export const newsRouter = Router();

const idParamsSchema = z.object({ id: idSchema });
const slugParamsSchema = z.object({ slug: z.string().trim().min(1).max(200) });

/* -------------------------------------------------------------------------- */
/* Routes publiques (sans jeton)                                              */
/* -------------------------------------------------------------------------- */

/** Articles publiés, du plus récent au plus ancien. */
newsRouter.get('/public', controller.publicList);

/** Détail d'un article publié par son slug. */
newsRouter.get('/public/:slug', validate({ params: slugParamsSchema }), controller.publicBySlug);

/* -------------------------------------------------------------------------- */
/* Administration                                                             */
/* -------------------------------------------------------------------------- */

/** Liste paginée (brouillons inclus). */
newsRouter.get('/', authenticate, requirePermission('news:read'), controller.list);

/** Détail d'un article. */
newsRouter.get(
  '/:id',
  authenticate,
  requirePermission('news:read'),
  validate({ params: idParamsSchema }),
  controller.detail,
);

/** Création d'un article. */
newsRouter.post(
  '/',
  authenticate,
  requirePermission('news:create'),
  validate({ body: createNewsSchema }),
  auditTrail('CREATE', 'news'),
  controller.create,
);

/** Mise à jour partielle. */
newsRouter.patch(
  '/:id',
  authenticate,
  requirePermission('news:update'),
  validate({ params: idParamsSchema, body: updateNewsSchema }),
  auditTrail('UPDATE', 'news'),
  controller.update,
);

/** Suppression définitive. */
newsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('news:delete'),
  validate({ params: idParamsSchema }),
  auditTrail('DELETE', 'news'),
  controller.remove,
);
