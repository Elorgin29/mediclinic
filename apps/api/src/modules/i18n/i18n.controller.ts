/** Contrôleur public du dictionnaire de traductions. */

import type { RequestHandler } from 'express';

import { asyncHandler } from '../../utils/http.js';
import * as service from './i18n.service.js';

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
