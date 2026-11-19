/**
 * Utilitaires HTTP : enveloppe des handlers asynchrones et lecture des
 * paramètres de route.
 *
 * Express 4 ne rattrape pas les rejets de promesse : sans `asyncHandler`, une
 * exception levée dans un contrôleur async ferait tomber la requête sans
 * réponse. On enveloppe donc systématiquement les contrôleurs.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AppError } from './app-error.js';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Enveloppe un handler asynchrone pour propager les erreurs à Express. */
export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

/** Lit un paramètre de route et le convertit en entier positif. */
export function parseIdParam(req: Request, name = 'id'): number {
  const raw = req.params[name];
  const value = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw AppError.badRequest(`Paramètre « ${name} » invalide : un entier positif est attendu.`, 'INVALID_ID');
  }
  return value;
}

/** Lit un paramètre de query entier optionnel. */
export function parseIntQuery(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Lit un paramètre de query booléen optionnel (`true`, `1`, `false`, `0`). */
export function parseBooleanQuery(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return ['true', '1', 'yes', 'oui'].includes(String(value).toLowerCase());
}

/** Retire les clés dont la valeur est `undefined` (utile pour les UPDATE partiels). */
export function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/**
 * Construit dynamiquement la partie `SET` d'un UPDATE à partir d'un objet
 * partiel. Les noms de colonnes proviennent d'une liste blanche : ils ne
 * peuvent donc pas être contrôlés par le client.
 */
export function buildSetClause(
  values: Record<string, unknown>,
  allowedColumns: readonly string[],
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const assignments: string[] = [];

  for (const column of allowedColumns) {
    if (!Object.prototype.hasOwnProperty.call(values, column)) continue;
    const value = values[column];
    if (value === undefined) continue;
    assignments.push(`\`${column}\` = ?`);
    params.push(value);
  }

  if (assignments.length === 0) {
    throw AppError.badRequest('Aucun champ valide à mettre à jour.', 'NOTHING_TO_UPDATE');
  }

  return { sql: assignments.join(', '), params };
}

/** Normalise une valeur JSON renvoyée par MySQL (objet, chaîne ou null). */
export function parseJsonColumn<T = Record<string, unknown>>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}
