/**
 * Contrôleurs des paramètres de la clinique.
 *
 * Aucune règle métier ici : validation par le schéma partagé, appel du service,
 * mise en forme de la réponse.
 */

import { clinicSettingsSchema } from '@mediclinic/shared';
import type { RequestHandler } from 'express';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import { asyncHandler } from '../../utils/http.js';
import * as service from './settings.service.js';

/**
 * GET /api/settings
 * Paramètres courants. Aucun secret Zoom n'est renvoyé.
 */
export const read: RequestHandler = asyncHandler(async (_req, res) => {
  const settings = await service.getSettings();
  res.json({ data: settings });
});

/**
 * PATCH /api/settings
 * Met à jour les paramètres (écriture partielle, idempotente).
 */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const input = clinicSettingsSchema.parse(req.body);
  const settings = await service.updateSettings(input);

  // On ne journalise que les noms de champs modifiés : la valeur des secrets
  // n'a pas d'intérêt dans le journal d'audit.
  setAuditPayload(res, {
    resourceId: 1,
    newValue: { fields: Object.keys(input) },
  });

  res.json({ data: settings });
});
