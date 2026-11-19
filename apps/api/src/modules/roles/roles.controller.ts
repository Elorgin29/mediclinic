/**
 * Contrôleurs HTTP du module des rôles.
 *
 * Aucune règle métier et aucun SQL ici : lecture de la requête (déjà validée
 * par le middleware `validate`), appel au service, enrichissement de la piste
 * d'audit et mise en forme de la réponse.
 */

import type { CreateRoleInput, UpdateRoleInput } from '@mediclinic/shared';
import type { RequestHandler } from 'express';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import { asyncHandler, parseIdParam } from '../../utils/http.js';
import * as service from './roles.service.js';

/**
 * GET /api/roles
 * Tous les rôles, avec leur nombre d'utilisateurs et de permissions.
 */
export const list: RequestHandler = asyncHandler(async (_req, res) => {
  const data = await service.listRoles();
  res.json({ data });
});

/**
 * GET /api/roles/:id
 * Détail d'un rôle et liste complète de ses permissions.
 */
export const getById: RequestHandler = asyncHandler(async (req, res) => {
  const data = await service.getRole(parseIdParam(req));
  res.json({ data });
});

/**
 * GET /api/roles/:id/permissions
 * Permissions d'un rôle, sous forme d'objets complets.
 */
export const permissions: RequestHandler = asyncHandler(async (req, res) => {
  const data = await service.getRolePermissions(parseIdParam(req));
  res.json({ data });
});

/**
 * POST /api/roles
 * Crée un rôle personnalisé (409 si le code ou le nom est déjà pris).
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  const data = await service.createRole(req.body as CreateRoleInput);

  setAuditPayload(res, {
    action: 'CREATE',
    resource: 'role',
    resourceId: data.id,
    newValue: {
      code: data.code,
      name: data.name,
      description: data.description,
      permissionIds: data.permissions.map((permission) => permission.id),
    },
  });

  res.status(201).json({ data });
});

/**
 * PATCH /api/roles/:id
 * Met à jour un rôle ; `permissionIds` remplace intégralement la matrice.
 */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const { previous, role } = await service.updateRole(id, req.body as UpdateRoleInput);

  setAuditPayload(res, {
    action: 'UPDATE',
    resource: 'role',
    resourceId: id,
    oldValue: {
      name: previous.name,
      description: previous.description,
      permissionIds: previous.permissions.map((permission) => permission.id),
    },
    newValue: {
      name: role.name,
      description: role.description,
      permissionIds: role.permissions.map((permission) => permission.id),
    },
  });

  res.json({ data: role });
});

/**
 * DELETE /api/roles/:id
 * Supprime un rôle personnalisé non porté par un utilisateur (409 sinon).
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const deleted = await service.removeRole(id);

  setAuditPayload(res, {
    action: 'DELETE',
    resource: 'role',
    resourceId: id,
    oldValue: {
      code: deleted.code,
      name: deleted.name,
      permissionIds: deleted.permissions.map((permission) => permission.id),
    },
  });

  res.status(204).send();
});

/**
 * PUT /api/roles/:id/permissions
 * Remplace la matrice de permissions et renvoie le rôle à jour.
 */
export const replacePermissions: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const input = req.body as { permissionIds: number[] };
  const { previous, role } = await service.replacePermissions(id, input.permissionIds);

  setAuditPayload(res, {
    action: 'APPROVE',
    resource: 'role',
    resourceId: id,
    oldValue: { permissionIds: previous.permissions.map((permission) => permission.id) },
    newValue: { permissionIds: role.permissions.map((permission) => permission.id) },
  });

  res.json({ data: role });
});
