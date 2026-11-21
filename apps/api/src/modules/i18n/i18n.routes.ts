/** Routes du dictionnaire i18n (publiques : le site vitrine en a besoin). */

import { Router } from 'express';

import * as controller from './i18n.controller.js';

export const i18nRouter = Router();

/** GET /api/i18n?locale=fr|en|mg */
i18nRouter.get('/', controller.getDictionary);

/** POST /api/i18n/translate — traduction à la demande (API gratuite). */
i18nRouter.post('/translate', controller.translate);
