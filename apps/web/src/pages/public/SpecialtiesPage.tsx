/**
 * Page des spécialités.
 */

import type { Specialty } from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { apiGet, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';

export default function SpecialtiesPage(): JSX.Element {
  const query = useQuery({
    queryKey: queryKeys.specialties.all,
    queryFn: () => apiGet<Specialty[]>('/specialties/public'),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="max-w-2xl">
        <h1 className="page-title">Spécialités médicales</h1>
        <p className="page-subtitle">
          Dix spécialités couvertes par la clinique, du suivi de grossesse à la chirurgie orthopédique.
        </p>
      </header>

      <div className="mt-8">
        {query.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }, (_, index) => (
              <Card key={index} className="p-5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-full" />
                <Skeleton className="mt-1.5 h-3 w-2/3" />
              </Card>
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState message={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (query.data ?? []).length === 0 ? (
          <Card>
            <EmptyState icon={Stethoscope} title="Aucune spécialité enregistrée" />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(query.data ?? []).map((specialty) => (
              <Link key={specialty.id} to={`/medecins?specialtyId=${specialty.id}`} className="group">
                <Card className="h-full p-5 transition-shadow group-hover:shadow-card-hover">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex rounded-lg bg-brand-50 p-2 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                      <Stethoscope className="h-5 w-5" aria-hidden />
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </div>
                  <h2 className="mt-3 text-sm font-semibold text-slate-900 group-hover:text-brand-800 dark:text-white">
                    {specialty.name}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {specialty.description ?? 'Prise en charge spécialisée.'}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
