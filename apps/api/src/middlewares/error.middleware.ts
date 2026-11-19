/**
 * Gestion centralisée des erreurs.
 *
 * Toutes les erreurs — applicatives, de validation, SQL ou inattendues — sont
 * converties ici en une réponse JSON homogène :
 *   { "error": { "code": "…", "message": "…", "details": […] } }
 */

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';
import { zodToAppError } from './validate.middleware.js';

/** Erreur MySQL (mysql2) enrichie des codes serveur. */
interface MySqlError extends Error {
  code?: string;
  errno?: number;
  sqlState?: string;
  sqlMessage?: string;
}

/** Route inconnue. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `La route ${req.method} ${req.originalUrl} n’existe pas.`,
    },
  });
}

/** Convertit une erreur MySQL en AppError compréhensible. */
function fromMySqlError(error: MySqlError): AppError | null {
  switch (error.code) {
    case 'ER_DUP_ENTRY':
      return AppError.conflict(
        'Cette donnée existe déjà (valeur unique en doublon).',
        'DUPLICATE_ENTRY',
      );
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_NO_REFERENCED_ROW':
      return AppError.unprocessable(
        'La ressource référencée n’existe pas.',
        'FOREIGN_KEY_MISSING',
      );
    case 'ER_ROW_IS_REFERENCED_2':
    case 'ER_ROW_IS_REFERENCED':
      return AppError.conflict(
        'Cette ressource est utilisée ailleurs : la suppression est impossible.',
        'FOREIGN_KEY_CONSTRAINT',
      );
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return AppError.unprocessable(
        'Une contrainte de cohérence de la base a été violée.',
        'CHECK_CONSTRAINT',
      );
    case 'ER_DATA_TOO_LONG':
      return AppError.badRequest('Une valeur saisie est trop longue.', 'DATA_TOO_LONG');
    case 'ER_BAD_NULL_ERROR':
      return AppError.badRequest('Un champ obligatoire est manquant.', 'NULL_NOT_ALLOWED');
    default:
      break;
  }

  // SIGNAL SQLSTATE '45000' émis par les triggers métier (stock, facturation).
  if (error.sqlState === '45000') {
    return AppError.conflict(error.sqlMessage ?? error.message, 'BUSINESS_RULE_VIOLATION');
  }

  if (error.code === 'ECONNREFUSED' || error.code === 'PROTOCOL_CONNECTION_LOST') {
    return AppError.serviceUnavailable(
      'La base de données est momentanément inaccessible.',
      'DATABASE_UNAVAILABLE',
    );
  }

  return null;
}

/** Middleware d'erreur final (doit être déclaré en dernier). */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  // 1. Validation Zod.
  if (error instanceof ZodError) {
    const appError = zodToAppError(error);
    res.status(appError.statusCode).json(appError.toJSON());
    return;
  }

  // 2. Erreur applicative explicite.
  if (AppError.isAppError(error)) {
    if (!error.isOperational) {
      // eslint-disable-next-line no-console
      console.error('[error]', error.message, error.stack);
    }
    res.status(error.statusCode).json(error.toJSON());
    return;
  }

  // 3. Corps JSON malformé (express.json).
  if (error instanceof SyntaxError && 'body' in error) {
    const appError = AppError.badRequest('Le corps de la requête n’est pas un JSON valide.', 'INVALID_JSON');
    res.status(appError.statusCode).json(appError.toJSON());
    return;
  }

  // 4. Erreur MySQL reconnue.
  const mySqlError = fromMySqlError(error as MySqlError);
  if (mySqlError) {
    res.status(mySqlError.statusCode).json(mySqlError.toJSON());
    return;
  }

  // 5. Erreur inattendue : on journalise tout, on ne divulgue rien.
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error('[error] erreur inattendue :', error);

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: env.isProduction
        ? 'Une erreur interne est survenue. Veuillez réessayer plus tard.'
        : message,
    },
  });
}
