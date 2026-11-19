/**
 * Tests unitaires des utilitaires de pagination et de tri.
 *
 * Le tri est un point sensible : il construit une clause `ORDER BY` injectée
 * dans la requête. Ces tests vérifient qu'aucune valeur arbitraire venue du
 * client ne peut s'y retrouver.
 */

import { PAGINATION_DEFAULT_LIMIT, PAGINATION_MAX_LIMIT } from '@mediclinic/shared';
import { describe, expect, it } from 'vitest';

import { buildOrderBy, likePattern, paginated, parsePagination, whereClause } from './pagination.js';

describe('parsePagination', () => {
  it('applique les valeurs par défaut', () => {
    const result = parsePagination({});
    expect(result).toEqual({ page: 1, limit: PAGINATION_DEFAULT_LIMIT, offset: 0 });
  });

  it('calcule l’offset correctement', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it('borne la limite maximale', () => {
    expect(parsePagination({ limit: '1000' }).limit).toBe(PAGINATION_MAX_LIMIT);
  });

  it('corrige les valeurs invalides', () => {
    expect(parsePagination({ page: '-5' }).page).toBe(1);
    expect(parsePagination({ page: 'abc' }).page).toBe(1);
    expect(parsePagination({ limit: '0' }).limit).toBe(1);
  });
});

describe('paginated', () => {
  it('construit les métadonnées attendues', () => {
    const result = paginated([{ id: 1 }, { id: 2 }], 42, { page: 2, limit: 20, offset: 20 });

    expect(result.meta).toEqual({ page: 2, limit: 20, total: 42, totalPages: 3 });
    expect(result.data).toHaveLength(2);
  });

  it('gère une liste vide sans division par zéro', () => {
    expect(paginated([], 0, { page: 1, limit: 20, offset: 0 }).meta.totalPages).toBe(0);
  });
});

describe('buildOrderBy', () => {
  const allowed = {
    last_name: 'p.last_name',
    created_at: 'p.created_at',
    scheduled_at: 'a.scheduled_at',
  } as const;

  it('utilise la colonne autorisée demandée', () => {
    expect(buildOrderBy('last_name', 'asc', allowed, 'p.id')).toBe('p.last_name ASC');
    expect(buildOrderBy('created_at', 'desc', allowed, 'p.id')).toBe('p.created_at DESC');
  });

  it('retombe sur la colonne par défaut si la clé est inconnue', () => {
    // Colonne inconnue → repli, mais la direction demandée reste appliquée.
    expect(buildOrderBy('password_hash', 'asc', allowed, 'p.id')).toBe('p.id ASC');
    // Aucun tri demandé → repli ET direction par défaut (`desc`).
    expect(buildOrderBy(undefined, undefined, allowed, 'p.id')).toBe('p.id DESC');
  });

  it('ignore une direction invalide et applique la valeur par défaut', () => {
    expect(buildOrderBy('last_name', 'DROP TABLE', allowed, 'p.id', 'asc')).toBe('p.last_name ASC');
  });

  it('n’injecte jamais la valeur brute du client', () => {
    const hostile = 'p.id; DROP TABLE patients';
    // La colonne inconnue est remplacée par la colonne de repli ; seule la
    // direction demandée (« asc ») est conservée, car elle est validée.
    expect(buildOrderBy(hostile, 'asc', allowed, 'p.id')).toBe('p.id ASC');
    // Une direction hostile est ignorée au profit de la valeur par défaut.
    expect(buildOrderBy(hostile, '; DELETE FROM users', allowed, 'p.id')).toBe('p.id DESC');
  });
});

describe('likePattern', () => {
  it('entoure la recherche de jokers', () => {
    expect(likePattern('dupont')).toBe('%dupont%');
  });

  it('échappe les caractères spéciaux de LIKE', () => {
    expect(likePattern('100%')).toBe('%100\\%%');
    expect(likePattern('a_b')).toBe('%a\\_b%');
    expect(likePattern('back\\slash')).toBe('%back\\\\slash%');
  });
});

describe('whereClause', () => {
  it('ignore les fragments vides', () => {
    expect(whereClause(['a = 1', '', '  ', 'b = 2'])).toBe('WHERE a = 1 AND b = 2');
  });

  it('renvoie une chaîne vide sans condition', () => {
    expect(whereClause([])).toBe('');
    expect(whereClause(['', '  '])).toBe('');
  });
});
