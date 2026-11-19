/**
 * Contrôle d'accès basé sur les permissions (RBAC).
 *
 * Les permissions sont portées par la requête (`req.user.permissions`),
 * calculées depuis la matrice `role_permissions`. Le contrôle est donc
 * entièrement modulaire : ajouter une permission à un rôle en base suffit à
 * ouvrir l'accès correspondant, sans redéploiement.
 */

import { STAFF_ROLES, hasAnyPermission, hasPermission } from '@mediclinic/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AppError } from '../utils/app-error.js';

/** Vérifie que l'utilisateur porte la permission demandée. */
function assertPermission(req: Request, permission: string): void {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
  }
  if (!hasPermission(user.permissions, permission)) {
    throw AppError.forbidden(
      `Vous n’avez pas la permission requise (${permission}).`,
      'PERMISSION_DENIED',
    );
  }
}

/** Exige UNE permission précise (`resource:action`). */
export function requirePermission(permission: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      assertPermission(req, permission);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Exige AU MOINS UNE des permissions listées (utile pour les écrans mixtes). */
export function requireAnyPermission(...permissions: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
      if (!hasAnyPermission(user.permissions, permissions)) {
        throw AppError.forbidden(
          `Vous n’avez aucune des permissions requises (${permissions.join(', ')}).`,
          'PERMISSION_DENIED',
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Exige TOUTES les permissions listées. */
export function requireAllPermissions(...permissions: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      for (const permission of permissions) assertPermission(req, permission);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Exige l'un des rôles fournis (contrôle grossier, à réserver aux cas simples). */
export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) throw AppError.unauthorized('Authentification requise.', 'UNAUTHORIZED');
      const allowed = user.roles.some((role) => roles.includes(role));
      if (!allowed) {
        throw AppError.forbidden(
          `Cette action est réservée aux rôles : ${roles.join(', ')}.`,
          'ROLE_REQUIRED',
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Exige un compte membre du personnel (exclut les patients). */
export function requireStaff(): RequestHandler {
  return requireRole(...STAFF_ROLES);
}
