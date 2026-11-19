/**
 * Hooks transverses de l'interface.
 *
 * `useListQuery` synchronise l'état d'une liste (page, recherche, tri, filtres)
 * avec l'URL : un écran filtré peut donc être partagé ou rechargé sans perdre
 * son contexte — comportement attendu d'un back-office.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { themeStorage } from '@/lib/utils';

/** Valeur retardée : évite une requête à chaque frappe clavier. */
export function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export type ListQueryDefaults = Record<string, string | number | undefined>;
export type ListQueryPatch = Record<string, string | number | null | undefined>;

export interface UseListQueryResult {
  /** Filtres effectifs (valeurs par défaut fusionnées avec l'URL). */
  filters: Record<string, string | number>;
  /** Paramètres présents dans l'URL uniquement. */
  urlParams: Record<string, string>;
  page: number;
  limit: number;
  search: string;
  sort: string | undefined;
  order: 'asc' | 'desc';
  /** Tri courant, directement exploitable par `<DataTable sort={…}>`. */
  sorting: { key: string; order: 'asc' | 'desc' } | null;
  /** Tri courant, directement exploitable par `<DataTable sort={…}>`. */
  /** Applique un patch (une valeur vide supprime la clé). */
  update: (patch: ListQueryPatch) => void;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setSearch: (search: string) => void;
  setSort: (sort: string, order?: 'asc' | 'desc') => void;
  /** Réinitialise tous les filtres. */
  reset: () => void;
}

/**
 * Gère l'état d'une liste paginée synchronisé avec la query string.
 *
 * @param defaults filtres appliqués lorsqu'ils sont absents de l'URL
 */
export function useListQuery(defaults: ListQueryDefaults = {}): UseListQueryResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultsKey = JSON.stringify(defaults);

  const urlParams = useMemo<Record<string, string>>(() => {
    const result: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }, [searchParams]);

  const filters = useMemo(() => {
    const parsedDefaults = JSON.parse(defaultsKey) as ListQueryDefaults;
    const merged: Record<string, string | number> = {};

    for (const [key, value] of Object.entries(parsedDefaults)) {
      if (value !== undefined && value !== '') merged[key] = value;
    }
    for (const [key, value] of Object.entries(urlParams)) {
      merged[key] = value;
    }

    return merged;
  }, [defaultsKey, urlParams]);

  const update = useCallback(
    (patch: ListQueryPatch) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === null || value === '') next.delete(key);
            else next.set(key, String(value));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPage = useCallback((page: number) => update({ page }), [update]);
  const setLimit = useCallback((limit: number) => update({ limit, page: 1 }), [update]);
  const setSearch = useCallback((search: string) => update({ search, page: 1 }), [update]);
  const setSort = useCallback(
    (sort: string, order: 'asc' | 'desc' = 'asc') => update({ sort, order, page: 1 }),
    [update],
  );
  const reset = useCallback(
    () => setSearchParams(new URLSearchParams(), { replace: true }),
    [setSearchParams],
  );

  const page = Number.parseInt(String(filters.page ?? '1'), 10);
  const sortKey = filters.sort === undefined ? undefined : String(filters.sort);
  const order: 'asc' | 'desc' = filters.order === 'asc' ? 'asc' : 'desc';

  return {
    filters,
    urlParams,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Number.parseInt(String(filters.limit ?? '20'), 10) || 20,
    search: String(filters.search ?? ''),
    sort: sortKey,
    order,
    // `null` plutôt qu'un objet partiel : le composant reste typé strictement.
    sorting: sortKey === undefined ? null : { key: sortKey, order },
    update,
    setPage,
    setLimit,
    setSearch,
    setSort,
    reset,
  };
}

/** Bascule clair / sombre avec mémorisation du choix (bonus). */
export function useTheme(): { theme: 'light' | 'dark'; toggleTheme: () => void } {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => themeStorage.get());

  useEffect(() => {
    themeStorage.apply(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}

/** Retarde l'exécution d'une action (utile pour les barres de recherche). */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay = 350,
): (...args: Parameters<T>) => void {
  const [timer, setTimer] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [timer]);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timer !== null) window.clearTimeout(timer);
      setTimer(window.setTimeout(() => callback(...args), delay));
    },
    [callback, delay, timer],
  );
}
