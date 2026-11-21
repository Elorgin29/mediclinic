/** Service de traduction à la demande via API gratuite (Google / MyMemory). */

import { isLocale } from '@mediclinic/shared';

import * as repository from './i18n.repository.js';

/** Même règle que côté client (djb2) pour les clés de textes longs. */
function keyFor(source: string): string {
  const trimmed = source.trim();
  if (trimmed.length <= 150) return `text:${trimmed}`;
  let hash = 5381;
  for (let i = 0; i < trimmed.length; i += 1) hash = ((hash << 5) + hash + trimmed.charCodeAt(i)) >>> 0;
  return `text:h:${hash.toString(16)}:${trimmed.length}`;
}

async function fromGoogle(text: string, target: string): Promise<string | null> {
  try {
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=' +
      target +
      '&dt=t&q=' +
      encodeURIComponent(text);
    const response = await fetch(url);
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    const segments = Array.isArray(body) && Array.isArray(body[0]) ? (body[0] as unknown[][]) : [];
    const result = segments.map((part) => String(part[0] ?? '')).join('');
    return result.trim() || null;
  } catch {
    return null;
  }
}

async function fromMyMemory(text: string, target: string): Promise<string | null> {
  try {
    const url =
      'https://api.mymemory.translated.net/get?q=' +
      encodeURIComponent(text) +
      `&langpair=fr|${target}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const body = (await response.json()) as { responseData?: { translatedText?: string } };
    const result = body.responseData?.translatedText ?? '';
    return result.trim() && !/MYMEMORY WARNING/i.test(result) ? result : null;
  } catch {
    return null;
  }
}

/** Traduit une liste de textes et met le résultat en cache en base. */
export async function translateBatch(
  texts: string[],
  target: string,
): Promise<Record<string, string>> {
  if (!isLocale(target) || target === 'fr') return {};
  const result: Record<string, string> = {};

  for (const source of texts.slice(0, 60)) {
    const value = source.trim();
    if (value.length < 2 || value.length > 500) continue;
    const key = keyFor(value);

    const cached = await repository.findOne(target, key);
    if (cached) {
      result[key] = cached;
      continue;
    }

    const translated = (await fromGoogle(value, target)) ?? (await fromMyMemory(value, target));
    if (!translated) continue;
    result[key] = translated;
    await repository.save(target, key, translated);
  }

  return result;
}
