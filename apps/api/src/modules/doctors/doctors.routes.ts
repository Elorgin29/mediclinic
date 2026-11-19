/**
 * Routes du module « médecins », montées sur `/api/doctors`.
 *
 * Ordre de déclaration important :
 *   1. `/public` — annuaire ouvert, sans authentification ;
 *   2. `/` — liste interne protégée par `doctor:read` ;
 *   3. `/:id/availability` — sous-ressource, avant `/:id` ; ouverte elle aussi
 *      car le parcours public de prise de rendez-vous l'appelle sans compte
 *      (`optionalAuthenticate` enrichit la requête pour un patient connecté) ;
 *   4. `/:id` — détail ;
 *   5. les écritures.
 * Sans cet ordre, Express interpréterait « public » comme un identifiant.
 *
 * La validation Zod des corps et des query strings est faite par le
 * contrôleur avec les schémas partagés `@mediclinic/shared` ; seuls les
 * paramètres de route sont validés ici.
 */

import { idSchema } from '@mediclinic/shared';
import { Router } from 'express';
import { z } from 'zod';

import { auditTrail } from '../../middlewares/audit.middleware.js';
import { authenticate, optionalAuthenticate } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/rbac.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import * as controller from './doctors.controller.js';

export const doctorsRouter = Router();

/** Paramètre de route `:id` converti en entier positif par le schéma partagé. */
const idParamsSchema = z.object({ id: idSchema });

/* -------------------------------------------------------------------------- */
/* Annuaire public — déclaré en premier pour primer sur `/:id`                 */
/* -------------------------------------------------------------------------- */

/** Annuaire public des médecins acceptant de nouveaux patients (sans jeton). */
doctorsRouter.get('/public', controller.listPublic);

/* -------------------------------------------------------------------------- */
/* Lectures protégées                                                          */
/* -------------------------------------------------------------------------- */

/** Liste paginée des médecins (filtres spécialité, département, recherche). */
doctorsRouter.get('/', authenticate, requirePermission('doctor:read'), controller.list);

/** Créneaux horaires d'un médecin pour une journée donnée. */
doctorsRouter.get(
  '/:id/availability',
  optionalAuthenticate,
  validate({ params: idParamsSchema }),
  controller.availability,
);

/** Fiche détaillée d'un médecin. */
doctorsRouter.get(
  '/:id',
  authenticate,
  requirePermission('doctor:read'),
  validate({ params: idParamsSchema }),
  controller.detail,
);

/* -------------------------------------------------------------------------- */
/* Écritures                                                                   */
/* -------------------------------------------------------------------------- */

/** Création d'un profil médecin (sur un compte existant ou avec son compte). */
doctorsRouter.post(
  '/',
  authenticate,
  requirePermission('doctor:create'),
  auditTrail('CREATE', 'doctor'),
  controller.create,
);

/** Mise à jour partielle d'un profil médecin. */
doctorsRouter.patch(
  '/:id',
  authenticate,
  requirePermission('doctor:update'),
  validate({ params: idParamsSchema }),
  auditTrail('UPDATE', 'doctor'),
  controller.update,
);

/** Suppression d'un profil sans historique (le compte est conservé). */
doctorsRouter.delete(
  '/:id',
  authenticate,
  requirePermission('doctor:delete'),
  validate({ params: idParamsSchema }),
  auditTrail('DELETE', 'doctor'),
  controller.remove,
);
