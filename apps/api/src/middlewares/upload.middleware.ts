/**
 * Téléversement de fichiers (photos de profil, pièces jointes, logo).
 *
 * Les fichiers sont écrits dans `apps/api/uploads` sous un nom aléatoire :
 * le nom d'origine n'est jamais utilisé sur le disque, ce qui évite les
 * collisions et les tentatives de traversée de répertoire. L'extension est
 * déduite du type MIME contrôlé, pas du nom fourni par le client.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { API_PUBLIC_PREFIX } from '@mediclinic/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer, { MulterError } from 'multer';

import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

/** Types MIME autorisés et extension associée. */
const ALLOWED_TYPES: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

/** Crée le dossier de destination s'il n'existe pas encore. */
function ensureUploadDir(): string {
  const dir = env.paths.uploads;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, ensureUploadDir());
  },
  filename: (_req, file, callback) => {
    const extension = ALLOWED_TYPES[file.mimetype] ?? path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: env.uploadMaxSizeBytes,
    files: 5,
  },
  fileFilter: (_req, file, callback) => {
    if (Object.prototype.hasOwnProperty.call(ALLOWED_TYPES, file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(
      AppError.badRequest(
        `Type de fichier non autorisé (${file.mimetype}). Formats acceptés : PNG, JPEG, WEBP, PDF.`,
        'UNSUPPORTED_MEDIA_TYPE',
      ),
    );
  },
});

/** Téléversement d'un fichier unique : `uploadSingle('avatar')`. */
export function uploadSingle(fieldName: string): RequestHandler {
  return upload.single(fieldName);
}

/** Téléversement de plusieurs fichiers : `uploadArray('documents', 3)`. */
export function uploadArray(fieldName: string, maxCount = 3): RequestHandler {
  return upload.array(fieldName, maxCount);
}

/** Traduit les erreurs Multer en AppError lisibles. */
export function uploadErrorHandler(
  error: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      next(
        AppError.badRequest(
          `Le fichier dépasse la taille maximale autorisée (${env.UPLOAD_MAX_SIZE_MB} Mo).`,
          'FILE_TOO_LARGE',
        ),
      );
      return;
    }
    next(AppError.badRequest(`Téléversement refusé : ${error.message}.`, 'UPLOAD_ERROR'));
    return;
  }
  next(error);
}

/** Chemin public d'un fichier téléversé, exploitable côté front. */
export function publicUploadUrl(filename: string): string {
  return `${env.API_URL}${API_PUBLIC_PREFIX}/uploads/${filename}`;
}
