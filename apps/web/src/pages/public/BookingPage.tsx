/**
 * Parcours de prise de rendez-vous en ligne (assistant en 3 étapes).
 *
 *   1. Spécialité et praticien
 *   2. Date et créneau horaire (créneaux libres fournis par l'API)
 *   3. Coordonnées du patient et confirmation
 *
 * Le composant est utilisable sans compte : l'API crée le dossier patient
 * minimal si l'email ou le téléphone est inconnu (`POST /api/appointments/public`).
 * L'état de l'assistant est conservé dans l'URL pour permettre le retour arrière.
 */

import {
  APPOINTMENT_TYPE_LABELS_FR,
  formatDateLong,
  formatMoney,
  type DoctorPublic,
  type Specialty,
} from '@mediclinic/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  Search,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Link, useSearchParams } from 'react-router-dom';

import { Button, Card, FieldRow, Input, Select, Textarea } from '@/components/ui';
import { apiGet, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { cn, formatNumber } from '@/lib/utils';
import { useDebounce } from '@/hooks';

/** Créneau renvoyé par `GET /api/doctors/:id/availability`. */
interface Slot {
  start: string;
  end: string;
  available: boolean;
}

interface AvailabilityResponse {
  date: string;
  doctorId: number;
  slots: Slot[];
}

interface BookingResult {
  appointment: { id: number; scheduled_at: string };
  patientCreated: boolean;
}

type Step = 1 | 2 | 3;

/** Renvoie la date du jour au format `AAAA-MM-JJ`. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Décale une date de `days` jours (format `AAAA-MM-JJ`). */
function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Heure `HH:MM` d'un créneau MySQL `AAAA-MM-JJ HH:MM:SS`. */
function slotTime(value: string): string {
  return value.slice(11, 16);
}

export default function BookingPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();

  const [step, setStep] = useState<Step>(1);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>(searchParams.get('specialtyId') ?? '');
  const [selectedDoctor, setSelectedDoctor] = useState<string>(searchParams.get('doctorId') ?? '');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState<string>(today());
  const [slot, setSlot] = useState<string>('');
  const [reason, setReason] = useState('');
  const [patient, setPatient] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthDate: '',
    gender: 'FEMALE',
  });
  const [confirmation, setConfirmation] = useState<BookingResult | null>(null);

  const debouncedSearch = useDebounce(search, 350);

  /* ------------------------------------------------------------------ */
  /* Données                                                             */
  /* ------------------------------------------------------------------ */
  const specialtiesQuery = useQuery({
    queryKey: queryKeys.specialties.all,
    queryFn: () => apiGet<Specialty[]>('/specialties/public'),
  });

  const doctorsQuery = useQuery({
    queryKey: queryKeys.doctors.public({ specialtyId: selectedSpecialty, search: debouncedSearch }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedSpecialty) params.set('specialtyId', selectedSpecialty);
      if (debouncedSearch) params.set('search', debouncedSearch);
      return apiGet<DoctorPublic[]>(`/doctors/public?${params.toString()}`);
    },
  });

  const availabilityQuery = useQuery({
    queryKey: queryKeys.doctors.availability(Number(selectedDoctor), date),
    queryFn: () =>
      apiGet<AvailabilityResponse>(`/doctors/${selectedDoctor}/availability?date=${date}`),
    enabled: Boolean(selectedDoctor) && Boolean(date),
  });

  const doctor = useMemo(
    () => (doctorsQuery.data ?? []).find((item) => String(item.id) === selectedDoctor),
    [doctorsQuery.data, selectedDoctor],
  );

  const availableSlots = (availabilityQuery.data?.slots ?? []).filter((item) => item.available);

  /* ------------------------------------------------------------------ */
  /* Réservation                                                         */
  /* ------------------------------------------------------------------ */
  const bookingMutation = useMutation({
    mutationFn: () =>
      apiPost<BookingResult>('/appointments/public', {
        doctorId: Number(selectedDoctor),
        scheduledAt: slot,
        reason: reason.trim().length > 0 ? reason.trim() : null,
        firstName: patient.firstName.trim(),
        lastName: patient.lastName.trim(),
        email: patient.email.trim(),
        phone: patient.phone.trim() || null,
        birthDate: patient.birthDate,
        gender: patient.gender,
      }),
    onSuccess: (result) => {
      setConfirmation(result);
      toast.success('Votre rendez-vous est enregistré. Vous recevrez une confirmation par email.');
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  /* ------------------------------------------------------------------ */
  /* Navigation entre étapes                                             */
  /* ------------------------------------------------------------------ */
  const canGoToStep2 = selectedDoctor !== '';
  const canGoToStep3 = slot !== '';

  const goNext = (): void => {
    if (step === 1 && !canGoToStep2) {
      toast.error('Veuillez sélectionner un médecin.');
      return;
    }
    if (step === 2 && !canGoToStep3) {
      toast.error('Veuillez sélectionner un créneau horaire.');
      return;
    }
    setStep((current) => (current === 3 ? 3 : ((current + 1) as Step)));
  };

  const goBack = (): void => setStep((current) => (current === 1 ? 1 : ((current - 1) as Step)));

  /* ------------------------------------------------------------------ */
  /* Confirmation                                                        */
  /* ------------------------------------------------------------------ */
  if (confirmation) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <Card className="p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <CheckCircle2 className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
            Rendez-vous enregistré
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Votre demande a bien été transmise au secrétariat, qui la confirmera sous 24 heures.
          </p>

          <dl className="mx-auto mt-6 max-w-sm space-y-2 rounded-xl bg-slate-50 p-4 text-left text-sm dark:bg-slate-800/60">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">Numéro</dt>
              <dd className="font-medium text-slate-900 dark:text-white">#{confirmation.appointment.id}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">Date</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {formatDateLong(confirmation.appointment.scheduled_at)}
              </dd>
            </div>
            {doctor && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Médecin</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  Dr {doctor.first_name} {doctor.last_name}
                </dd>
              </div>
            )}
            {confirmation.patientCreated && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Dossier</dt>
                <dd className="font-medium text-emerald-700 dark:text-emerald-400">Créé automatiquement</dd>
              </div>
            )}
          </dl>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/">
              <Button variant="secondary">Retour à l’accueil</Button>
            </Link>
            <Button
              onClick={() => {
                setConfirmation(null);
                setStep(1);
                setSlot('');
                setReason('');
                setSearchParams({}, { replace: true });
              }}
            >
              Prendre un autre rendez-vous
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="page-title">Prendre rendez-vous</h1>
        <p className="page-subtitle">
          Trois étapes : choisissez votre praticien, votre créneau, puis renseignez vos coordonnées.
        </p>
      </header>

      {/* Fil des étapes */}
      <ol className="mt-6 flex items-center gap-2 text-xs">
        {[
          { id: 1 as Step, label: 'Praticien' },
          { id: 2 as Step, label: 'Créneau' },
          { id: 3 as Step, label: 'Coordonnées' },
        ].map((item, index) => (
          <li key={item.id} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                step >= item.id
                  ? 'bg-brand-700 text-white'
                  : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
              )}
            >
              {item.id}
            </span>
            <span
              className={cn(
                'hidden font-medium sm:block',
                step >= item.id ? 'text-slate-900 dark:text-white' : 'text-slate-400',
              )}
            >
              {item.label}
            </span>
            {index < 2 && <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* ------------------------------------------------------------ */}
        {/* Contenu de l'étape                                            */}
        {/* ------------------------------------------------------------ */}
        <Card className="p-5">
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="section-title">Choisissez votre praticien</h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Spécialité"
                  options={(specialtiesQuery.data ?? []).map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                  placeholder="Toutes les spécialités"
                  value={selectedSpecialty}
                  onChange={(event) => {
                    setSelectedSpecialty(event.target.value);
                    setSelectedDoctor('');
                  }}
                />
                <Input
                  label="Recherche"
                  placeholder="Nom du médecin"
                  leftIcon={<Search className="h-4 w-4" />}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                {doctorsQuery.isLoading && <p className="text-sm text-slate-500">Chargement des praticiens…</p>}

                {(doctorsQuery.data ?? []).map((item) => {
                  const isSelected = String(item.id) === selectedDoctor;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedDoctor(String(item.id));
                        setSlot('');
                        setSearchParams({ doctorId: String(item.id) }, { replace: true });
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors',
                        isSelected
                          ? 'border-brand-500 bg-brand-50/60 dark:border-brand-600 dark:bg-brand-950/40'
                          : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                          {item.first_name.charAt(0)}
                          {item.last_name.charAt(0)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                            Dr {item.first_name} {item.last_name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {item.specialty_name} · {formatMoney(item.consultation_fee)}
                          </p>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-700" aria-hidden />}
                    </button>
                  );
                })}

                {!doctorsQuery.isLoading && (doctorsQuery.data ?? []).length === 0 && (
                  <p className="py-6 text-center text-sm text-slate-500">
                    Aucun praticien ne correspond à ces critères.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="section-title">Choisissez un créneau</h2>

              <FieldRow>
                <Input
                  label="Date souhaitée"
                  type="date"
                  min={today()}
                  max={addDays(today(), 90)}
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setSlot('');
                  }}
                />
                <div className="flex items-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, -1))}>
                    <ArrowLeft className="h-4 w-4" aria-hidden /> Veille
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setDate(addDays(date, 1))}>
                    Lendemain <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </FieldRow>

              {availabilityQuery.isLoading && (
                <p className="text-sm text-slate-500">Recherche des disponibilités…</p>
              )}

              {!availabilityQuery.isLoading && availableSlots.length === 0 && (
                <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Aucun créneau libre le {formatDateLong(date)}. Essayez une autre date.
                </div>
              )}

              {availableSlots.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {formatNumber(availableSlots.length)} créneau(x) disponible(s) le {formatDateLong(date)}
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {availableSlots.map((item) => {
                      const isSelected = slot === item.start;
                      return (
                        <button
                          key={item.start}
                          type="button"
                          onClick={() => setSlot(item.start)}
                          className={cn(
                            'rounded-lg border px-2 py-2 text-sm font-medium transition-colors',
                            isSelected
                              ? 'border-brand-600 bg-brand-700 text-white'
                              : 'border-slate-200 text-slate-700 hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
                          )}
                        >
                          {slotTime(item.start)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <Textarea
                label="Motif de consultation (facultatif)"
                placeholder="Décrivez brièvement la raison de votre visite…"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="section-title">Vos coordonnées</h2>

              <FieldRow>
                <Input
                  label="Prénom"
                  required
                  value={patient.firstName}
                  onChange={(event) => setPatient({ ...patient, firstName: event.target.value })}
                />
                <Input
                  label="Nom"
                  required
                  value={patient.lastName}
                  onChange={(event) => setPatient({ ...patient, lastName: event.target.value })}
                />
              </FieldRow>

              <FieldRow>
                <Input
                  label="Date de naissance"
                  type="date"
                  required
                  max={today()}
                  value={patient.birthDate}
                  onChange={(event) => setPatient({ ...patient, birthDate: event.target.value })}
                />
                <Select
                  label="Genre"
                  options={[
                    { value: 'FEMALE', label: 'Femme' },
                    { value: 'MALE', label: 'Homme' },
                    { value: 'OTHER', label: 'Autre' },
                  ]}
                  value={patient.gender}
                  onChange={(event) => setPatient({ ...patient, gender: event.target.value })}
                />
              </FieldRow>

              <FieldRow>
                <Input
                  label="Adresse email"
                  type="email"
                  required
                  value={patient.email}
                  onChange={(event) => setPatient({ ...patient, email: event.target.value })}
                />
                <Input
                  label="Téléphone"
                  type="tel"
                  value={patient.phone}
                  onChange={(event) => setPatient({ ...patient, phone: event.target.value })}
                />
              </FieldRow>

              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                Si vous n’avez pas encore de dossier à la clinique, il sera créé automatiquement. Vous pourrez
                ensuite suivre vos rendez-vous depuis votre espace patient.
              </p>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button variant="secondary" onClick={goBack} disabled={step === 1}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Précédent
            </Button>

            {step < 3 ? (
              <Button onClick={goNext}>
                Continuer <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button
                onClick={() => bookingMutation.mutate()}
                isLoading={bookingMutation.isPending}
                leftIcon={<CalendarCheck className="h-4 w-4" />}
              >
                Confirmer le rendez-vous
              </Button>
            )}
          </div>
        </Card>

        {/* ------------------------------------------------------------ */}
        {/* Récapitulatif                                                 */}
        {/* ------------------------------------------------------------ */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Récapitulatif</h2>

            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Praticien</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">
                    {doctor ? `Dr ${doctor.first_name} ${doctor.last_name}` : 'Non sélectionné'}
                  </dd>
                  {doctor && <dd className="text-xs text-slate-500">{doctor.specialty_name}</dd>}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Date</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">
                    {slot ? formatDateLong(slot) : formatDateLong(date)}
                  </dd>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Heure</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">
                    {slot ? slotTime(slot) : 'Non sélectionnée'}
                  </dd>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Type</dt>
                  <dd className="font-medium text-slate-900 dark:text-white">
                    {APPOINTMENT_TYPE_LABELS_FR.IN_PERSON}
                  </dd>
                </div>
              </div>

              {doctor && (
                <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                  <div className="flex justify-between">
                    <dt className="text-slate-500 dark:text-slate-400">Tarif consultation</dt>
                    <dd className="font-semibold text-slate-900 dark:text-white">
                      {formatMoney(doctor.consultation_fee)}
                    </dd>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Remboursable par la Sécurité sociale et votre mutuelle.
                  </p>
                </div>
              )}
            </dl>
          </Card>

          <Card className="mt-4 p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Une question ? Appelez le secrétariat au{' '}
              <a href="tel:+33145678900" className="link">
                +33 1 45 67 89 00
              </a>
              .
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
