/** Contrôleur public du dictionnaire de traductions. */

import type { RequestHandler } from 'express';

import { asyncHandler } from '../../utils/http.js';
import * as service from './i18n.service.js';
import * as translationService from './i18n.translation.js';

/** GET /api/i18n?locale=fr|en|mg — dictionnaire fusionné. */
export const getDictionary: RequestHandler = asyncHandler(async (req, res) => {
  const locale = typeof req.query.locale === 'string' ? req.query.locale : 'fr';
  res.json({
    data: {
      locale,
      translations: await service.dictionary(locale),
    },
  });
});

/** POST /api/i18n/translate — traduit à la demande via API gratuite. */
export const translate: RequestHandler = asyncHandler(async (req, res) => {
  const target = typeof req.body?.target === 'string' ? req.body.target : 'en';
  const texts = Array.isArray(req.body?.texts)
    ? req.body.texts.filter((item: unknown): item is string => typeof item === 'string')
    : [];
  const translations = await translationService.translateBatch(texts, target);
  res.json({ data: { translations } });
});
