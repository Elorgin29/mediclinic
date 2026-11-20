/**
 * Mes téléconsultations (espace patient).
 *
 * Demandes en cours et séances approuvées. Le bouton « Rejoindre » n'est actif
 * que dans la fenêtre de connexion (10 minutes avant le début).
 */

import {
  formatDateTime,
  MEETING_STATUS_LABELS_FR,
  type Meeting,
  type Paginated,
} from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { Clock, Info, Video } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Spinner,
  StatusBadge,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { MeetingRoom } from '@/components/MeetingRoom';
import { apiGetRaw, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';

/** Fenêtre de connexion : 10 minutes avant le début jusqu'à la fin prévue. */
function isJoinable(meeting: Meeting): boolean {
  if (meeting.status !== 'APPROVED') return false;
  const startValue = meeting.start_time ?? meeting.preferred_at;
  const start = new Date(String(startValue).replace(' ', 'T')).getTime();
  if (Number.isNaN(start)) return false;

  const now = Date.now();
  return now >= start - 10 * 60_000 && now <= start + meeting.duration * 60_000;
}

export default function PatientMeetingsPage(): JSX.Element {
  const [joinTarget, setJoinTarget] = useState<Meeting | null>(null);

  const meetingsQuery = useQuery({
    queryKey: queryKeys.meetings.me,
    queryFn: () => apiGetRaw<Paginated<Meeting>>('/meetings/me'),
  });

  const meetings = meetingsQuery.data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mes téléconsultations"
        subtitle="Consultez un médecin à distance depuis votre domicile."
        actions={
          <Link to="/teleconsultation">
            <Button size="sm" leftIcon={<Video className="h-4 w-4" />}>
              Nouvelle demande
            </Button>
          </Link>
        }
      />

      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          Vérifiez votre connexion internet, votre caméra et votre microphone avant la séance. Le bouton
          de connexion s’active 10 minutes avant l’heure prévue.
        </p>
      </div>

      {meetingsQuery.isLoading ? (
        <Card className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </Card>
      ) : meetingsQuery.isError ? (
        <Card>
          <ErrorState
            message={getApiErrorMessage(meetingsQuery.error)}
            onRetry={() => void meetingsQuery.refetch()}
          />
        </Card>
      ) : meetings.length === 0 ? (
        <Card>
          <EmptyState
            icon={Video}
            title="Aucune téléconsultation"
            description="Vous pouvez demander une téléconsultation depuis le site public."
            action={
              <Link to="/teleconsultation">
                <Button size="sm">Demander une téléconsultation</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => {
            const joinable = isJoinable(meeting);

            return (
              <Card key={meeting.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 dark:text-white">
                      {meeting.doctor_name ?? 'Médecin'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{meeting.reason}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      {formatDateTime(meeting.start_time ?? meeting.preferred_at)} · {meeting.duration} min
                    </p>
                    {meeting.zoom_meeting_id && (
                      <p className="mt-1 font-mono text-[11px] text-slate-400">
                        Réunion {meeting.zoom_meeting_id}
                      </p>
                    )}
                    {meeting.rejection_reason && (
                      <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                        Motif du refus : {meeting.rejection_reason}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <StatusBadge
                      kind="meeting"
                      status={meeting.status}
                      label={MEETING_STATUS_LABELS_FR[meeting.status]}
                    />
                    {joinable ? (
                      <Button
                        size="sm"
                        leftIcon={<Video className="h-3.5 w-3.5" />}
                        onClick={() => setJoinTarget(meeting)}
                      >
                        Rejoindre
                      </Button>
                    ) : (
                      meeting.status === 'APPROVED' && (
                        <Badge tone="neutral">Fenêtre fermée</Badge>
                      )
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {joinTarget && (
        <MeetingRoom
          meetingId={joinTarget.id}
          role={0}
          title={`Téléconsultation — ${joinTarget.doctor_name ?? ''}`}
          onClose={() => setJoinTarget(null)}
        />
      )}
    </div>
  );
}
