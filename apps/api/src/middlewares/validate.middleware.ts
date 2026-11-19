/**
 * Middleware de validation Zod.
 *
 * Les schémas proviennent de `@mediclinic/shared` : le front et le back
 * valident donc EXACTEMENT les mêmes règles, ce qui élimine les divergences
 * de contrôle de saisie.
 *
 * Les données validées remplacent `req.body` / `req.query` / `req.params` :
 * les contrôleurs ne manipulent que des valeurs déjà vérifiées et converties
 * (les chaînes `"12"` deviennent des nombres, etc.).
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';

import { AppError } from '../utils/app-error.js';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Remplace une propriété de la requête.
 * `Object.defineProperty` est nécessaire car Express 4 déclare `query` et
 * `params` via des accesseurs en lecture seule sur le prototype.
 */
function overrideProperty(req: Request, key: 'body' | 'query' | 'params', value: unknown): void {
  Object.defineProperty(req, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/** Transforme une erreur Zod en AppError 400 exploitable par le front. */
export function zodToAppError(error: ZodError): AppError {
  return AppError.badRequest(
    'Les données transmises sont invalides.',
    'VALIDATION_ERROR',
    error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  );
}

/** Valide corps, paramètres de route et query string selon les schémas fournis. */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        overrideProperty(req, 'params', schemas.params.parse(req.params));
      }
      if (schemas.query) {
        overrideProperty(req, 'query', schemas.query.parse(req.query));
      }
      if (schemas.body) {
        overrideProperty(req, 'body', schemas.body.parse(req.body));
      }
      next();
    } catch (error) {
      next(error instanceof ZodError ? zodToAppError(error) : error);
    }
  };
}
