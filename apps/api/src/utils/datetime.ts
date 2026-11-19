/**
 * Conversion des dates entre le format de l'API et celui de MySQL.
 *
 * Le pilote est configuré avec `dateStrings: true` : MySQL renvoie donc
 * `'2026-11-18 09:00:00'`. En entrée, le front peut envoyer du ISO 8601
 * (`'2026-11-18T09:00:00.000Z'`, produit par `datetime-local`), une date seule
 * (`'2026-11-18'`) ou déjà le format MySQL. Ces fonctions normalisent tout.
 */

/** Complète un nombre sur deux chiffres. */
const pad = (value: number): string => String(value).padStart(2, '0');

/** Convertit une valeur en `'AAAA-MM-JJ HH:MM:SS'` (heure locale). */
export function toMySqlDateTime(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(
      value.getHours(),
    )}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }

  const trimmed = value.trim();

  // Déjà au format MySQL : on complète éventuellement les secondes.
  const mysqlMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(trimmed);
  if (mysqlMatch) {
    const [, year, month, day, hour, minute, second] = mysqlMatch;
    // Sans fuseau explicite (pas de « Z » ni de « +hh:mm »), la valeur est
    // considérée comme déjà locale : on la renvoie telle quelle.
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
    if (!hasZone) {
      return `${year}-${month}-${day} ${hour ?? '00'}:${minute ?? '00'}:${second ?? '00'}`;
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return toMySqlDateTime(parsed);
}

/** Convertit une valeur en `'AAAA-MM-JJ'`. */
export function toMySqlDate(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/** Date et heure courantes au format MySQL. */
export function nowSql(): string {
  return toMySqlDateTime(new Date()) as string;
}

/** Bornes par défaut d'un rapport : du 1er du mois courant à aujourd'hui. */
export function defaultReportRange(): { from: string; to: string } {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    from: toMySqlDate(firstDay) as string,
    to: toMySqlDate(today) as string,
  };
}

/** Ajoute un nombre de minutes à une date MySQL et renvoie le format MySQL. */
export function addMinutes(value: string | Date, minutes: number): string {
  const base = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  base.setMinutes(base.getMinutes() + minutes);
  return toMySqlDateTime(base) as string;
}
