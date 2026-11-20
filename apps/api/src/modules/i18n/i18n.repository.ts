/** Accès au dictionnaire de traductions stocké en base. */

import type { Row } from '../../config/db.js';
import { query } from '../../config/db.js';

interface TranslationRow extends Row {
  locale: string;
  key: string;
  value: string;
}

/** Toutes les entrées utiles : locale demandée + repli français. */
export async function findForLocale(locale: string): Promise<TranslationRow[]> {
  return query<TranslationRow>(
    'SELECT `locale`, `key`, `value` FROM `translations` WHERE `locale` IN (?, \'fr\')',
    [locale],
  );
}
