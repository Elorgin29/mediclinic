/**
 * Erreurs applicatives.
 *
 * Toute erreur « métier » levée dans un service doit être une `AppError` :
 * elle porte un code HTTP, un code fonctionnel stable et éventuellement des
 * détails. Le middleware `errorHandler` sait les distinguer des erreurs
 * inattendues (qui sont journalisées et renvoyées en 500 générique).
 */

export type ErrorDetails = Record<string, unknown> | unknown[] | undefined;

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: ErrorDetails;
  /** true = erreur attendue (4xx) ; false = bug ou panne (5xx). */
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: ErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = statusCode < 500;
    Error.captureStackTrace?.(this, AppError);
  }

  /* ------------------------------------------------------------------ */
  /* Fabriques                                                          */
  /* ------------------------------------------------------------------ */

  static badRequest(message = 'Requête invalide.', code = 'BAD_REQUEST', details?: ErrorDetails) {
    return new AppError(message, 400, code, details);
  }

  static unauthorized(
    message = 'Authentification requise.',
    code = 'UNAUTHORIZED',
    details?: ErrorDetails,
  ) {
    return new AppError(message, 401, code, details);
  }

  static forbidden(message = 'Accès refusé.', code = 'FORBIDDEN', details?: ErrorDetails) {
    return new AppError(message, 403, code, details);
  }

  static notFound(message = 'Ressource introuvable.', code = 'NOT_FOUND', details?: ErrorDetails) {
    return new AppError(message, 404, code, details);
  }

  static conflict(
    message = 'Conflit avec une donnée existante.',
    code = 'CONFLICT',
    details?: ErrorDetails,
  ) {
    return new AppError(message, 409, code, details);
  }

  static unprocessable(message = 'Données non traitables.', code = 'UNPROCESSABLE', details?: ErrorDetails) {
    return new AppError(message, 422, code, details);
  }

  static tooManyRequests(
    message = 'Trop de requêtes, veuillez patienter.',
    code = 'RATE_LIMITED',
    details?: ErrorDetails,
  ) {
    return new AppError(message, 429, code, details);
  }

  static internal(message = 'Erreur interne du serveur.', code = 'INTERNAL_ERROR', details?: ErrorDetails) {
    return new AppError(message, 500, code, details);
  }

  static serviceUnavailable(
    message = 'Service temporairement indisponible.',
    code = 'SERVICE_UNAVAILABLE',
    details?: ErrorDetails,
  ) {
    return new AppError(message, 503, code, details);
  }

  /* ------------------------------------------------------------------ */
  /* Utilitaires                                                        */
  /* ------------------------------------------------------------------ */

  /** L'erreur est-elle une AppError ? */
  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }

  /** Transforme une erreur inconnue en AppError 500. */
  static from(error: unknown): AppError {
    if (AppError.isAppError(error)) return error;
    const message = error instanceof Error ? error.message : String(error);
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }

  /** Représentation sérialisable renvoyée au client. */
  toJSON(): { error: { code: string; message: string; details?: ErrorDetails } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}
