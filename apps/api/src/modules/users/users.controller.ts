/**
 * Contrôleurs HTTP du module de gestion des utilisateurs.
 * Aucune règle métier ici : extraction des données de la requête, appel au
 * service, enrichissement de la piste d'audit et mise en forme de la réponse.
 */

import type { CreateUserInput, UpdateUserInput } from '@mediclinic/shared';
import type { RequestHandler } from 'express';

import { setAuditPayload } from '../../middlewares/audit.middleware.js';
import { AppError } from '../../utils/app-error.js';
import { asyncHandler, parseIdParam } from '../../utils/http.js';
import { parsePagination } from '../../utils/pagination.js';
import * as service from './users.service.js';

/** Lit un paramètre de query déjà validé, sous forme de chaîne non vide. */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Lit un paramètre de query déjà validé, sous forme de booléen. */
function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** Exige un utilisateur authentifié (garanti par le middleware `authenticate`). */
function actorId(req: { user?: { id: number } }): number {
  if (!req.user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
  return req.user.id;
}

/**
 * GET /api/users
 * Liste paginée des utilisateurs (recherche, filtre par rôle et par état).
 */
export const list: RequestHandler = asyncHandler(async (req, res) => {
  const result = await service.listUsers(
    {
      search: readString(req.query.search),
      role: readString(req.query.role),
      isActive: readBoolean(req.query.isActive),
      sort: readString(req.query.sort),
      order: req.query.order === 'asc' ? 'asc' : 'desc',
    },
    parsePagination(req.query),
  );

  res.json(result);
});

/**
 * GET /api/users/me/profile
 * Profil complet de l'utilisateur connecté (rôles et permissions effectifs).
 */
export const profile: RequestHandler = asyncHandler(async (req, res) => {
  const user = await service.getUser(actorId(req));
  res.json({ data: user });
});

/**
 * GET /api/users/:id
 * Fiche complète d'un utilisateur.
 */
export const getById: RequestHandler = asyncHandler(async (req, res) => {
  const user = await service.getUser(parseIdParam(req));
  res.json({ data: user });
});

/**
 * GET /api/users/:id/permissions
 * Rôles et permissions d'un utilisateur, pour l'écran d'administration.
 */
export const permissions: RequestHandler = asyncHandler(async (req, res) => {
  const data = await service.getUserPermissions(parseIdParam(req));
  res.json({ data });
});

/**
 * POST /api/users
 * Crée un compte utilisateur : mot de passe haché et rôles attribués.
 */
export const create: RequestHandler = asyncHandler(async (req, res) => {
  const input = req.body as CreateUserInput;
  const user = await service.createUser(input);

  setAuditPayload(res, {
    action: 'CREATE',
    resource: 'user',
    resourceId: user.id,
    newValue: { email: user.email, roles: user.roles },
  });

  res.status(201).json({ data: user });
});

/**
 * PATCH /api/users/:id
 * Mise à jour partielle ; `roleCodes` remplace intégralement les rôles.
 */
export const update: RequestHandler = asyncHandler(async (req, res) => {
  const input = req.body as UpdateUserInput;
  const result = await service.updateUser(parseIdParam(req), input, actorId(req));

  setAuditPayload(res, {
    action: 'UPDATE',
    resource: 'user',
    resourceId: result.user.id,
    oldValue: { roles: result.previous.roles, isActive: result.previous.is_active },
    newValue: {
      roles: result.user.roles,
      isActive: result.user.is_active,
      rolesReplaced: input.roleCodes !== undefined,
    },
  });

  res.json({ data: result.user });
});

/**
 * DELETE /api/users/:id
 * Désactivation logique du compte et révocation de ses sessions.
 */
export const remove: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const previous = await service.deactivateUser(id, actorId(req));

  setAuditPayload(res, {
    action: 'DELETE',
    resource: 'user',
    resourceId: id,
    oldValue: { roles: previous.roles, isActive: previous.is_active },
    newValue: { isActive: false },
  });

  res.status(204).send();
});

/**
 * POST /api/users/:id/reset-password
 * Réinitialise le mot de passe (valeur fournie ou mot de passe de seed).
 */
export const resetPassword: RequestHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req);
  const input = req.body as { password?: string };

  await service.resetPassword(id, input.password);

  setAuditPayload(res, {
    action: 'UPDATE',
    resource: 'user',
    resourceId: id,
    newValue: { passwordReset: true, sessionsRevoked: true },
  });

  res.status(204).send();
});
