/**
 * Demande de téléconsultation (page publique).
 *
 * Le patient choisit un médecin, un motif et un créneau souhaité. La demande
 * part en statut « en attente » : un administrateur l'approuve ensuite, ce qui
 * crée la réunion Zoom (ou une réunion simulée en mode démonstration).
 */

import { formatMoney, type DoctorPublic } from '@mediclinic/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Info, Video } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

import { Button, Card, FieldRow, Input, Select, Textarea } from '@/components/ui';
import { apiGet, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';

/** Date et heure locales au format attendu par `datetime-local`. */
function defaultPreferredAt(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export default function TeleconsultationPage(): JSX.Element {
  const { user, isPatient } = useAuth();

  const [doctorId, setDoctorId] = useState('');
  const [reason, setReason] = useState('');
  const [preferredAt, setPreferredAt] = useState(defaultPreferredAt());
  const [duration, setDuration] = useState('30');
  const [submitted, setSubmitted] = useState(false);

  const doctorsQuery = useQuery({
    queryKey: queryKeys.doctors.public({}),
    queryFn: () => apiGet<DoctorPublic[]>('/doctors/public'),
  });

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<{ id: number }>('/meetings/request', {
        doctorId: Number(doctorId),
        reason: reason.trim(),
        preferredAt: preferredAt.replace('T', ' '),
        duration: Number(duration),
      }),
    onSuccess: () => {
      setSubmitted(true);
      toast.success('Votre demande de téléconsultation a été envoyée.');
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const selectedDoctor = (doctorsQuery.data ?? []).find((item) => String(item.id) === doctorId);

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <Card className="p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <CheckCircle2 className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">Demande envoyée</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Le secrétariat examine votre demande et vous communiquera le lien de visioconférence après
            validation. Vous recevrez également une notification dans votre espace patient.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/">
              <Button variant="secondary">Retour à l’accueil</Button>
            </Link>
            {user ? (
              <Link to={isPatient ? '/patient/teleconsultations' : '/admin/teleconsultations'}>
                <Button>Suivre ma demande</Button>
              </Link>
            ) : (
              <Link to="/connexion">
                <Button>Me connecter</Button>
              </Link>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="max-w-2xl">
        <h1 className="page-title">Demander une téléconsultation</h1>
        <p className="page-subtitle">
          Consultez un praticien à distance, sans vous déplacer. Vous recevrez un lien sécurisé après
          validation de votre demande.
        </p>
      </header>

      <Card className="mt-6 p-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!doctorId) {
              toast.error('Veuillez choisir un médecin.');
              return;
            }
            if (reason.trim().length < 5) {
              toast.error('Merci de préciser le motif de votre demande (5 caractères minimum).');
              return;
            }
            mutation.mutate();
          }}
          className="space-y-5"
        >
          <Select
            label="Médecin"
            required
            placeholder="Choisissez un praticien"
            options={(doctorsQuery.data ?? []).map((doctor) => ({
              value: doctor.id,
              label: `Dr ${doctor.first_name} ${doctor.last_name} — ${doctor.specialty_name} (${formatMoney(
                doctor.consultation_fee,
              )})`,
            }))}
            value={doctorId}
            onChange={(event) => setDoctorId(event.target.value)}
          />

          <Textarea
            label="Motif de la téléconsultation"
            required
            rows={4}
            placeholder="Décrivez vos symptômes ou la raison de votre demande…"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            hint="Ces informations sont transmises uniquement au médecin concerné."
          />

          <FieldRow>
            <Input
              label="Créneau souhaité"
              type="datetime-local"
              required
              value={preferredAt}
              onChange={(event) => setPreferredAt(event.target.value)}
            />
            <Select
              label="Durée estimée"
              options={[
                { value: '15', label: '15 minutes' },
                { value: '30', label: '30 minutes' },
                { value: '45', label: '45 minutes' },
                { value: '60', label: '1 heure' },
              ]}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          </FieldRow>

          <div className="rounded-lg bg-sky-50 p-4 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-200">
            <p className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                La téléconsultation est prise en charge comme une consultation en présentiel. Le lien de
                visioconférence s’active 10 minutes avant l’heure prévue.
              </span>
            </p>
          </div>

          {selectedDoctor && (
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                {selectedDoctor.first_name.charAt(0)}
                {selectedDoctor.last_name.charAt(0)}
              </span>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Dr {selectedDoctor.first_name} {selectedDoctor.last_name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedDoctor.specialty_name} · {formatMoney(selectedDoctor.consultation_fee)}
                </p>
              </div>
            </div>
          )}

          {!user && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Vous n’êtes pas connecté : la demande pourra être déposée, mais nous vous invitons à{' '}
              <Link to="/connexion" className="font-medium underline">
                vous connecter
              </Link>{' '}
              ou à{' '}
              <Link to="/inscription" className="font-medium underline">
                créer un espace patient
              </Link>{' '}
              pour suivre son avancement.
            </p>
          )}

          <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button type="submit" isLoading={mutation.isPending} leftIcon={<Video className="h-4 w-4" />}>
              Envoyer ma demande
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
