/**
 * Journal d'audit (back-office).
 *
 * Traçabilité complète des actions : qui, quand, sur quelle ressource, depuis
 * quelle adresse IP. Filtres par utilisateur, ressource, action et période —
 * exactement les critères demandés par le cahier des charges.
 */

import { formatDateTime, type AuditLog, type Paginated } from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Filter, Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  Pagination,
  Select,
  SkeletonText,
  StatCard,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { apiGetRaw, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import type { Tone } from '@/lib/utils';
import { useListQuery } from '@/hooks';

/** Tonalité associée à une action d'audit. */
function actionTone(action: string): Tone {
  switch (action) {
    case 'CREATE':
      return 'success';
    case 'UPDATE':
      return 'info';
    case 'DELETE':
      return 'danger';
    case 'LOGIN_SUCCESS':
      return 'brand';
    case 'LOGIN_FAILED':
      return 'warning';
    case 'APPROVE':
      return 'success';
    case 'REJECT':
      return 'danger';
    case 'PDF_ACCESS':
      return 'neutral';
    case 'STOCK_ADJUST':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** Libellés français des actions. */
const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Création',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
  LOGIN_SUCCESS: 'Connexion réussie',
  LOGIN_FAILED: 'Échec de connexion',
  LOGOUT: 'Déconnexion',
  APPROVE: 'Approbation',
  REJECT: 'Refus',
  PDF_ACCESS: 'Accès PDF',
  DISPENSE: 'Dispensation',
  STOCK_ADJUST: 'Ajustement de stock',
};

const RESOURCES = [
  'auth',
  'patient',
  'doctor',
  'specialty',
  'department',
  'appointment',
  'consultation',
  'prescription',
  'medication',
  'stock',
  'invoice',
  'payment',
  'shift',
  'meeting',
  'lab',
  'user',
  'role',
  'settings',
];

export default function AuditPage(): JSX.Element {
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    resource: '',
    action: '',
    from: '',
    to: '',
  });

  const [expanded, setExpanded] = useState<number | null>(null);

  const auditQuery = useQuery({
    queryKey: queryKeys.audit.all(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, String(value));
      }
      return apiGetRaw<Paginated<AuditLog>>(`/audit?${params.toString()}`);
    },
  });

  const columns: Column<AuditLog>[] = [
    {
      key: 'created_at',
      header: 'Horodatage',
      sortable: true,
      render: (row) => (
        <span className="whitespace-nowrap font-mono text-xs text-slate-600 dark:text-slate-300">
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key: 'user_name',
      header: 'Utilisateur',
      render: (row) => (
        <div>
          <p className="text-slate-900 dark:text-white">{row.user_name ?? 'Système'}</p>
          <p className="font-mono text-[11px] text-slate-400">{row.ip_address ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <Badge tone={actionTone(row.action)} dot>
          {ACTION_LABELS[row.action] ?? row.action}
        </Badge>
      ),
    },
    {
      key: 'resource',
      header: 'Ressource',
      render: (row) => (
        <div>
          <p className="text-slate-700 dark:text-slate-200">{row.resource}</p>
          {row.resource_id && <p className="font-mono text-[11px] text-slate-400">#{row.resource_id}</p>}
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Détails',
      align: 'right',
      render: (row) =>
        row.old_value || row.new_value ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(expanded === row.id ? null : row.id)}
            aria-label={expanded === row.id ? 'Masquer les détails' : 'Afficher les détails'}
          >
            {expanded === row.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        ),
    },
  ];

  const meta = auditQuery.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Journal d’audit"
        subtitle="Traçabilité de toutes les actions sensibles : qui a fait quoi, quand, et depuis quelle adresse."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Entrées totales" value={meta?.total ?? 0} icon={ShieldCheck} tone="info" />
        <StatCard
          label="Connexions suivies"
          value={
            (auditQuery.data?.data ?? []).filter(
              (entry) => entry.action === 'LOGIN_SUCCESS' || entry.action === 'LOGIN_FAILED',
            ).length
          }
          icon={ShieldCheck}
          tone="brand"
        />
        <StatCard
          label="Suppressions"
          value={(auditQuery.data?.data ?? []).filter((entry) => entry.action === 'DELETE').length}
          icon={ShieldCheck}
          tone="danger"
        />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Nom d’utilisateur…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Rechercher un utilisateur"
          />
          <Select
            options={RESOURCES.map((resource) => ({ value: resource, label: resource }))}
            placeholder="Toutes les ressources"
            value={String(filters.resource ?? '')}
            onChange={(event) => update({ resource: event.target.value })}
            aria-label="Filtrer par ressource"
          />
          <Select
            options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
            placeholder="Toutes les actions"
            value={String(filters.action ?? '')}
            onChange={(event) => update({ action: event.target.value })}
            aria-label="Filtrer par action"
          />
          <Input
            type="date"
            value={String(filters.from ?? '')}
            onChange={(event) => update({ from: event.target.value })}
            aria-label="Date de début"
          />
          <div className="flex gap-2">
            <Input
              type="date"
              value={String(filters.to ?? '')}
              onChange={(event) => update({ to: event.target.value })}
              aria-label="Date de fin"
            />
            <Button variant="ghost" size="icon" onClick={reset} aria-label="Réinitialiser les filtres">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        {auditQuery.isLoading ? (
          <div className="p-5">
            <SkeletonText lines={8} />
          </div>
        ) : auditQuery.isError ? (
          <EmptyState title="Erreur de chargement" description={getApiErrorMessage(auditQuery.error)} />
        ) : (auditQuery.data?.data ?? []).length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Aucune entrée d’audit"
            description="Aucune action ne correspond aux filtres sélectionnés."
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={auditQuery.data?.data ?? []}
              rowKey={(row) => row.id}
              sort={sorting}
              onSortChange={(key, order) => update({ sort: key, order })}
            />

            {/* Détails dépliés */}
            {expanded !== null && (
              <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                {(() => {
                  const entry = (auditQuery.data?.data ?? []).find((item) => item.id === expanded);
                  if (!entry) return null;
                  return (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Entrée #{entry.id}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-[11px] font-medium text-slate-500">Valeur précédente</p>
                          <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-white p-2 text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            {entry.old_value ? JSON.stringify(entry.old_value, null, 2) : 'null'}
                          </pre>
                        </div>
                        <div>
                          <p className="text-[11px] font-medium text-slate-500">Nouvelle valeur</p>
                          <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-white p-2 text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            {entry.new_value ? JSON.stringify(entry.new_value, null, 2) : 'null'}
                          </pre>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Agent : {entry.user_agent ?? 'non renseigné'}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}

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
          </>
        )}
      </Card>

      <p className="text-center text-xs text-slate-400">
        Le journal d’audit est en lecture seule : aucune entrée ne peut être modifiée ni supprimée depuis
        l’application.
      </p>
    </div>
  );
}
