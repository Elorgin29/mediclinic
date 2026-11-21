/**
 * Provider de traduction de l'application.
 *
 * - locale persistée dans `localStorage` (`mediclinic.locale`) ;
 * - dictionnaire statique embarqué (interface) ;
 * - dictionnaire dynamique chargé depuis `/api/i18n` pour les textes stockés
 *   en base (rôles, permissions, spécialités, actualités, notifications…).
 *
 * `t()` consulte d'abord le dictionnaire de la base, puis le dictionnaire
 * statique, puis la valeur de repli, puis la clé elle-même.
 */

import { isLocale, setSharedLocale, type Locale } from '@mediclinic/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { apiGetRaw } from '@/lib/apiClient';

import { DICTIONARIES, translate } from './translations';

const STORAGE_KEY = 'mediclinic.locale';

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string) => string;
  /** Dictionnaire chargé depuis la base (utile pour les débogages). */
  dbDictionary: Record<string, string>;
  /** Ajoute des traductions obtenues à la demande. */
  addTranslations: (translations: Record<string, string>) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : 'fr';
  } catch {
    return 'fr';
  }
}

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);
  const [dbDictionary, setDbDictionary] = useState<Record<string, string>>({});

  useEffect(() => {
    setSharedLocale(locale);
    document.documentElement.lang = locale;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Stockage indisponible (navigation privée) : la langue reste active pour la session.
    }

    let cancelled = false;
    const cacheKey = `mediclinic.i18n.${locale}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { translations?: Record<string, string> };
        if (parsed.translations) setDbDictionary(parsed.translations);
      }
    } catch {
      // Cache illisible : on recharge depuis l'API.
    }

    void apiGetRaw<{ data?: { translations?: Record<string, string> } }>(`/i18n?locale=${locale}`)
      .then((response) => {
        const dictionary = response.data?.translations ?? {};
        if (!cancelled) setDbDictionary(dictionary);
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ translations: dictionary }));
        } catch {
          // Stockage saturé : le dictionnaire reste en mémoire.
        }
      })
      .catch(() => {
        // L'API peut être indisponible : l'interface reste traduite par le dictionnaire local.
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);

  const addTranslations = useCallback((translations: Record<string, string>) => {
    if (Object.keys(translations).length === 0) return;
    setDbDictionary((current) => ({ ...current, ...translations }));
  }, []);

  const t = useCallback(
    (key: string, fallback?: string): string =>
      dbDictionary[key] ?? translate(locale, key, fallback),
    [dbDictionary, locale],
  );

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t, dbDictionary, addTranslations }),
    [locale, setLocale, t, dbDictionary, addTranslations],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Accès au contexte de traduction. */
export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n doit être utilisé à l’intérieur d’un <I18nProvider>.');
  return context;
}

/** Dictionnaire statique d'une locale (utile pour les tests). */
export function staticDictionary(locale: Locale): Record<string, string> {
  return DICTIONARIES[locale];
}
