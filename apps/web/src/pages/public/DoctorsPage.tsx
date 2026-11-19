/**
 * Annuaire public des médecins.
 *
 * Filtres par spécialité et recherche libre, synchronisés avec l'URL (page
 * partageable). Chaque praticien renvoie vers la prise de rendez-vous avec son
 * identifiant pré-rempli.
 */

import { formatMoney, type DoctorPublic, type Specialty } from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Search, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge, Button, Card, EmptyState, ErrorState, Input, Select, Skeleton } from '@/components/ui';
import { apiGet, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { useListQuery } from '@/hooks';

export default function DoctorsPage(): JSX.Element {
  const { filters, update, setSearch, search } = useListQuery({ specialtyId: '' });

  const specialtiesQuery = useQuery({
    queryKey: queryKeys.specialties.all,
    queryFn: () => apiGet<Specialty[]>('/specialties'),
  });

  const doctorsQuery = useQuery({
    queryKey: queryKeys.doctors.public(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.specialtyId) params.set('specialtyId', String(filters.specialtyId));
      if (filters.search) params.set('search', String(filters.search));
      return apiGet<DoctorPublic[]>(`/doctors/public?${params.toString()}`);
    },
  });

  const specialtyOptions = (specialtiesQuery.data ?? []).map((specialty) => ({
    value: specialty.id,
    label: specialty.name,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="max-w-2xl">
        <h1 className="page-title">Nos médecins</h1>
        <p className="page-subtitle">
          {doctorsQuery.data?.length ?? 0} praticien(s) disponible(s). Choisissez votre spécialiste et réservez
          directement un créneau.
        </p>
      </header>

      {/* Filtres */}
      <Card className="mt-6 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
          <Input
            placeholder="Rechercher un médecin, une spécialité…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Rechercher un médecin"
          />
          <Select
            options={specialtyOptions}
            placeholder="Toutes les spécialités"
            value={String(filters.specialtyId ?? '')}
            onChange={(event) => update({ specialtyId: event.target.value })}
            aria-label="Filtrer par spécialité"
          />
        </div>
      </Card>

      {/* Résultats */}
      <div className="mt-6">
        {doctorsQuery.isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Card key={index} className="p-5">
                <Skeleton className="h-12 w-12 rounded-full" />
                <Skeleton className="mt-3 h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-28" />
                <Skeleton className="mt-3 h-3 w-full" />
                <Skeleton className="mt-1.5 h-3 w-3/4" />
              </Card>
            ))}
          </div>
        ) : doctorsQuery.isError ? (
          <ErrorState
            message={getApiErrorMessage(doctorsQuery.error)}
            onRetry={() => void doctorsQuery.refetch()}
          />
        ) : (doctorsQuery.data ?? []).length === 0 ? (
          <Card>
            <EmptyState
              icon={Stethoscope}
              title="Aucun médecin ne correspond à votre recherche"
              description="Essayez une autre spécialité ou effacez les filtres."
              action={
                <Button variant="secondary" size="sm" onClick={() => update({ specialtyId: '', search: '' })}>
                  Réinitialiser les filtres
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(doctorsQuery.data ?? []).map((doctor) => (
              <Card key={doctor.id} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                    {doctor.first_name.charAt(0)}
                    {doctor.last_name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      Dr {doctor.first_name} {doctor.last_name}
                    </h2>
                    <p className="text-xs font-medium text-brand-700 dark:text-brand-400">
                      {doctor.specialty_name}
                    </p>
                    {doctor.department_name && (
                      <Badge tone="neutral" className="mt-1">
                        {doctor.department_name}
                      </Badge>
                    )}
                  </div>
                </div>

                <p className="mt-3 line-clamp-4 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {doctor.bio ?? 'Praticien de la clinique MediClinic.'}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Consultation</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {formatMoney(doctor.consultation_fee)}
                    </p>
                  </div>
                  <Link to={`/rendez-vous?doctorId=${doctor.id}`}>
                    <Button size="sm" leftIcon={<CalendarCheck className="h-4 w-4" />}>
                      Réserver
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
