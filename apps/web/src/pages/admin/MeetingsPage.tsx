/**
 * Téléconsultations (back-office).
 *
 * Validation des demandes, création des réunions Zoom (ou simulées), et accès
 * au lien de connexion. Le statut et la fenêtre de connexion sont calculés par
 * l'API (`is_joinable`).
 */

import {
  formatDateTime,
  MEETING_STATUS_LABELS_FR,
  MEETING_STATUSES,
  type Meeting,
  type Paginated,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Info, Search, Video, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  Badge,
  Button,
  Card,
  DataTable,
  Input,
  Modal,
  Pagination,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { MeetingRoom } from '@/components/MeetingRoom';
import { apiGet, apiGetRaw, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { useListQuery } from '@/hooks';

export default function MeetingsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    status: '',
  });

  const [rejectTarget, setRejectTarget] = useState<Meeting | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [joinTarget, setJoinTarget] = useState<{ meeting: Meeting; role: 0 | 1 } | null>(null);

  const meetingsQuery = useQuery({
    queryKey: queryKeys.meetings.all(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, String(value));
      }
      return apiGetRaw<Paginated<Meeting>>(`/meetings?${params.toString()}`);
    },
  });

  const zoomQuery = useQuery({
    queryKey: ['zoom', 'mode'],
    queryFn: () => apiGet<{ zoomConfigured: boolean; zoomMode: string }>('/settings'),
  });

  /** Invalide les listes et les compteurs après une transition. */
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['meetings'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const approveMutation = useMutation({
    mutationFn: (meetingId: number) => apiPost<Meeting>(`/meetings/${meetingId}/approve`, {}),
    onSuccess: () => {
      toast.success('Téléconsultation approuvée : la réunion est créée.');
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      apiPost<Meeting>(`/meetings/${rejectTarget?.id}/reject`, { reason: rejectReason.trim() }),
    onSuccess: () => {
      toast.success('Demande refusée.');
      setRejectTarget(null);
      setRejectReason('');
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: (meetingId: number) => apiPost<Meeting>(`/meetings/${meetingId}/cancel`, {}),
    onSuccess: () => {
      toast.success('Téléconsultation annulée.');
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const columns: Column<Meeting>[] = [
    {
      key: 'preferred_at',
      header: 'Créneau',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">
            {formatDateTime(row.start_time ?? row.preferred_at)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{row.duration} min</p>
        </div>
      ),
    },
    {
      key: 'patient_name',
      header: 'Patient',
      render: (row) => (
        <div>
          <p className="text-slate-900 dark:text-white">{row.patient_name ?? '—'}</p>
          <p className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{row.reason}</p>
        </div>
      ),
    },
    {
      key: 'doctor_name',
      header: 'Médecin',
      hideOnMobile: true,
      render: (row) => <span className="text-slate-700 dark:text-slate-200">{row.doctor_name ?? '—'}</span>,
    },
    {
      key: 'zoom_meeting_id',
      header: 'Réunion',
      hideOnMobile: true,
      render: (row) =>
        row.zoom_meeting_id ? (
          <div>
            <p className="font-mono text-xs text-slate-700 dark:text-slate-200">{row.zoom_meeting_id}</p>
            {row.password && <p className="text-[11px] text-slate-400">code {row.password}</p>}
          </div>
        ) : (
          <span className="text-xs text-slate-400">non créée</span>
        ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row) => (
        <div className="space-y-1">
          <StatusBadge kind="meeting" status={row.status} label={MEETING_STATUS_LABELS_FR[row.status]} />
          {row.status === 'APPROVED' && row.is_joinable && (
            <Badge tone="success" dot>
              Fenêtre ouverte
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          {row.status === 'PENDING' && (
            <Can permission="meeting:manage">
              <Button
                size="sm"
                variant="primary"
                leftIcon={<Check className="h-3.5 w-3.5" />}
                onClick={() => approveMutation.mutate(row.id)}
                isLoading={approveMutation.isPending}
              >
                Approuver
              </Button>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<X className="h-3.5 w-3.5" />}
                onClick={() => setRejectTarget(row)}
              >
                Refuser
              </Button>
            </Can>
          )}

          {row.status === 'APPROVED' && (
            <>
              <Button
                size="sm"
                variant="primary"
                leftIcon={<Video className="h-3.5 w-3.5" />}
                onClick={() => setJoinTarget({ meeting: row, role: 1 })}
              >
                Rejoindre
              </Button>
              <Can permission="meeting:update">
                <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(row.id)}>
                  Annuler
                </Button>
              </Can>
            </>
          )}
        </div>
      ),
    },
  ];

  const meta = meetingsQuery.data?.meta;
  const pendingCount = (meetingsQuery.data?.data ?? []).filter((item) => item.status === 'PENDING').length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Téléconsultations"
        subtitle="Validez les demandes et ouvrez les salles de visioconférence."
      />

      {/* Bandeau d'information sur le mode Zoom */}
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          Mode actuel : <span className="font-semibold">{zoomQuery.data?.zoomMode ?? 'détection…'}</span>.
          {zoomQuery.data?.zoomConfigured === false &&
            ' Les réunions sont simulées : l’application reste entièrement fonctionnelle hors ligne. Renseignez les identifiants Zoom dans .env pour activer les vraies visioconférences.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Demandes en attente" value={pendingCount} icon={Clock} tone={pendingCount > 0 ? 'warning' : 'brand'} />
        <StatCard
          label="Approuvées"
          value={(meetingsQuery.data?.data ?? []).filter((item) => item.status === 'APPROVED').length}
          icon={Video}
          tone="success"
        />
        <StatCard label="Total" value={meta?.total ?? 0} icon={Video} tone="info" />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
          <Input
            placeholder="Patient, médecin ou motif…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Rechercher une téléconsultation"
          />
          <Select
            options={MEETING_STATUSES.map((status) => ({
              value: status,
              label: MEETING_STATUS_LABELS_FR[status],
            }))}
            placeholder="Tous les statuts"
            value={String(filters.status ?? '')}
            onChange={(event) => update({ status: event.target.value })}
            aria-label="Filtrer par statut"
          />
          <Button variant="ghost" onClick={reset}>
            Réinitialiser
          </Button>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          data={meetingsQuery.data?.data ?? []}
          rowKey={(row) => row.id}
          isLoading={meetingsQuery.isLoading}
          isError={meetingsQuery.isError}
          errorMessage={getApiErrorMessage(meetingsQuery.error)}
          onRetry={() => void meetingsQuery.refetch()}
          emptyTitle="Aucune téléconsultation"
          emptyDescription="Aucune demande ne correspond aux filtres sélectionnés."
          sort={sorting}
          onSortChange={(key, order) => update({ sort: key, order })}
        />

        {meta && (
          <Pagination
            page={page}
            limit={limit}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        )}
      </Card>

      {/* Refus */}
      <Modal
        isOpen={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="Refuser la demande"
        description={rejectTarget ? `${rejectTarget.patient_name ?? ''} — ${rejectTarget.reason}` : undefined}
        isBusy={rejectMutation.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>
              Annuler
            </Button>
            <Button variant="danger" onClick={() => rejectMutation.mutate()} isLoading={rejectMutation.isPending}>
              Refuser la demande
            </Button>
          </>
        }
      >
        <Textarea
          label="Motif du refus"
          required
          rows={3}
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
          hint="Ce motif est transmis au patient."
        />
      </Modal>

      {/* Salle de visioconférence */}
      {joinTarget && (
        <MeetingRoom
          meetingId={joinTarget.meeting.id}
          role={joinTarget.role}
          title={`Téléconsultation — ${joinTarget.meeting.patient_name ?? ''}`}
          onClose={() => setJoinTarget(null)}
        />
      )}
    </div>
  );
}
