/**
 * Sélecteur de patient avec recherche serveur.
 *
 * Évite de saisir un identifiant technique : l'utilisateur tape un nom, un
 * email ou un numéro de téléphone, puis choisit le patient dans la liste des
 * résultats. Utilisé par la prise de rendez-vous et la facturation.
 */

import { formatDate, type Paginated, type Patient } from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { Search, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { FieldWrapper } from '@/components/ui';
import { apiGetRaw } from '@/lib/apiClient';
import { useDebounce } from '@/hooks';
import { cn } from '@/lib/utils';

export interface PatientPickerProps {
  value: Patient | null;
  onChange: (patient: Patient | null) => void;
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  placeholder?: string;
}

export function PatientPicker({
  value,
  onChange,
  label = 'Patient',
  required,
  error,
  hint,
  placeholder = 'Rechercher un patient par nom, email ou téléphone…',
}: PatientPickerProps): JSX.Element {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(search, 300);

  const patientsQuery = useQuery({
    queryKey: ['patients', 'picker', debouncedSearch],
    queryFn: () =>
      apiGetRaw<Paginated<Patient>>(
        `/patients?limit=8&search=${encodeURIComponent(debouncedSearch)}`,
      ),
    enabled: isOpen && debouncedSearch.trim().length >= 2,
  });

  // Ferme la liste au clic extérieur.
  useEffect(() => {
    const handleClick = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const results = patientsQuery.data?.data ?? [];

  return (
    <FieldWrapper label={label} error={error} hint={hint} required={required}>
      <div ref={containerRef} className="relative">
        {value ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                {value.first_name.charAt(0)}
                {value.last_name.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                  {value.last_name.toUpperCase()} {value.first_name}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  Dossier #{value.id} · né(e) le {formatDate(value.birth_date)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              aria-label="Changer de patient"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={search}
              placeholder={placeholder}
              aria-invalid={error ? true : undefined}
              onChange={(event) => {
                setSearch(event.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              className={cn('input pl-9', error && 'input-error')}
            />
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />

            {isOpen && debouncedSearch.trim().length >= 2 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {patientsQuery.isLoading ? (
                  <p className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">Recherche…</p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">
                    Aucun patient trouvé pour « {debouncedSearch} ».
                  </p>
                ) : (
                  <ul className="max-h-64 overflow-y-auto py-1">
                    {results.map((patient) => (
                      <li key={patient.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onChange(patient);
                            setSearch('');
                            setIsOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                            <UserRound className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                              {patient.last_name.toUpperCase()} {patient.first_name}
                            </span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                              #{patient.id} · {patient.phone ?? patient.email ?? 'Sans contact'}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </FieldWrapper>
  );
}
