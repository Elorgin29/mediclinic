/**
 * Clé de traduction pour un texte brut. Les textes courts gardent une clé
 * lisible (`text:Bonjour`) ; les longs utilisent une empreinte déterministe pour
 * respecter la limite de 190 caractères de la colonne `translations.key`.
 * L'algorithme (djb2) est volontairement simple et synchrone : il doit produire
 * la même valeur côté script de génération et côté navigateur.
 */
export function translationKey(source: string): string {
  const trimmed = source.trim();
  if (trimmed.length <= 150) return `text:${trimmed}`;

  let hash = 5381;
  for (let index = 0; index < trimmed.length; index += 1) {
    hash = ((hash << 5) + hash + trimmed.charCodeAt(index)) >>> 0;
  }
  return `text:h:${hash.toString(16)}:${trimmed.length}`;
}
