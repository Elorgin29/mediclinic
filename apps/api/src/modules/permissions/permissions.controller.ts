/**
 * Contrôleurs HTTP des permissions.
 *
 * Ce référentiel est en lecture seule : les modifications se font par la
 * matrice des rôles (`PUT /api/roles/:id/permissions`).
 */

import {
  PERMISSION_ACTION_LABELS_FR,
  PERMISSION_RESOURCE_LABELS_FR,
  type Permission,
  type PermissionAction,
  type PermissionResource,
} from '@mediclinic/shared';
import type { RequestHandler } from 'express';

import { asyncHandler } from '../../utils/http.js';
import * as service from './permissions.service.js';

/**
 * GET /api/permissions
 * Référentiel complet des permissions (77 entrées).
 */
export const list: RequestHandler = asyncHandler(async (_req, res) => {
  const permissions = await service.listPermissions();
  res.json({ data: permissions });
});

/**
 * GET /api/permissions/grouped
 * Permissions regroupées par ressource, pour l'écran d'administration du RBAC.
 */
export const grouped: RequestHandler = asyncHandler(async (_req, res) => {
  const groups = await service.listGrouped();
  res.json({ data: groups });
});

/**
 * GET /api/permissions/matrix
 * Matrice rôle → permissions, avec les libellés français prêts à afficher.
 */
export const matrix: RequestHandler = asyncHandler(async (_req, res) => {
  const payload = await service.getMatrix();
  res.json({
    data: {
      ...payload,
      actionLabels: PERMISSION_ACTION_LABELS_FR,
      resourceLabels: PERMISSION_RESOURCE_LABELS_FR,
    },
  });
});

/** Réexport utilitaire pour les types consommés par le front. */
export type { Permission, PermissionAction, PermissionResource };
