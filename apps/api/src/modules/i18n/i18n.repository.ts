/** Accès au dictionnaire de traductions stocké en base. */

import type { Row } from '../../config/db.js';
import { query, queryOne, execute } from '../../config/db.js';

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

/** Enregistre (ou remplace) une traduction. */
export async function save(locale: string, key: string, value: string): Promise<void> {
  await execute(
    'INSERT INTO translations (`locale`, `key`, `value`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
    [locale, key, value],
  );
}

/** Lit une traduction mise en cache. */
export async function findOne(locale: string, key: string): Promise<string | null> {
  const row = await queryOne<TranslationRow>(
    'SELECT `value` FROM translations WHERE locale = ? AND `key` = ? LIMIT 1',
    [locale, key],
  );
  return row?.value ?? null;
}
