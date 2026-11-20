/** Service du dictionnaire i18n (repli français pour les clés non traduites). */

import { isLocale, type Locale } from '@mediclinic/shared';

import * as repository from './i18n.repository.js';

/** Dictionnaire fusionné : la locale demandée prime sur le français. */
export async function dictionary(locale: string): Promise<Record<string, string>> {
  const resolved: Locale = isLocale(locale) ? locale : 'fr';
  const rows = await repository.findForLocale(resolved);

  const fallback: Record<string, string> = {};
  const selected: Record<string, string> = {};
  for (const row of rows) {
    if (row.locale === 'fr') fallback[row.key] = row.value;
    if (row.locale === resolved) selected[row.key] = row.value;
  }
  return { ...fallback, ...selected };
}
