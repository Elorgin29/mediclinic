/** Sélecteur de langue compact pour les en-têtes (FR / EN / MG). */

import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@mediclinic/shared';
import { Check, Languages } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useI18n } from '@/i18n/I18nContext';
import { cn } from '@/lib/utils';

const SHORT_LABELS: Record<Locale, string> = { fr: 'FR', en: 'EN', mg: 'MG' };

export function LanguageSwitcher({ compact = false }: { compact?: boolean }): JSX.Element {
  const { locale, setLocale, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef} data-no-i18n>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={t('locale.label', 'Langue')}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={cn(
          'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors hover:bg-slate-100 dark:hover:bg-slate-800',
          'text-slate-600 dark:text-slate-300',
        )}
      >
        <Languages className="h-4 w-4" aria-hidden />
        {!compact && <span>{SHORT_LABELS[locale]}</span>}
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900"
        >
          {SUPPORTED_LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              role="menuitemradio"
              aria-checked={code === locale}
              onClick={() => {
                setLocale(code);
                setIsOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors',
                code === locale
                  ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
              )}
            >
              <span>{LOCALE_LABELS[code]}</span>
              {code === locale && <Check className="h-3.5 w-3.5" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
