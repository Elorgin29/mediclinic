/**
 * Notifications.
 *
 * Page partagée par le back-office et l'espace patient : elle n'affiche que les
 * notifications de l'utilisateur connecté (l'API filtre par jeton).
 */

import { formatDateTime, type Notification, type Paginated } from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Inbox, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge, Button, Card, EmptyState, Pagination, Spinner, Tabs } from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { apiDelete, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { useListQuery } from '@/hooks';

/** Tonalité d'une notification selon son type. */
function typeTone(type: string): 'info' | 'success' | 'warning' | 'danger' {
  switch (type) {
    case 'SUCCESS':
      return 'success';
    case 'WARNING':
      return 'warning';
    case 'ERROR':
      return 'danger';
    default:
      return 'info';
  }
}

export default function NotificationsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { filters, page, setPage, update } = useListQuery({ isRead: '' });

  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications.all(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, String(value));
      }
      return apiGetRaw<Paginated<Notification>>(`/notifications?${params.toString()}`);
    },
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markRead = useMutation({
    mutationFn: (id: number) => apiPatch<unknown>(`/notifications/${id}/read`, {}),
    onSuccess: refresh,
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiPost<{ updated: number }>('/notifications/read-all', {}),
    onSuccess: (result) => {
      toast.success(`${result.updated} notification(s) marquée(s) comme lue(s).`);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`/notifications/${id}`),
    onSuccess: refresh,
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const meta = notificationsQuery.data?.meta;
  const unreadCount = (notificationsQuery.data?.data ?? []).filter((item) => !item.is_read).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        subtitle={`${unreadCount} non lue(s) sur cette page.`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<CheckCheck className="h-4 w-4" />}
            onClick={() => markAllRead.mutate()}
            isLoading={markAllRead.isPending}
          >
            Tout marquer comme lu
          </Button>
        }
      />

      <Tabs
        items={[
          { id: '', label: 'Toutes' },
          { id: 'false', label: 'Non lues' },
          { id: 'true', label: 'Lues' },
        ]}
        value={String(filters.isRead ?? '')}
        onChange={(value) => update({ isRead: value })}
      />

      <Card>
        {notificationsQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : (notificationsQuery.data?.data ?? []).length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Aucune notification"
            description="Vous serez informé ici des rendez-vous, ordonnances et alertes vous concernant."
          />
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(notificationsQuery.data?.data ?? []).map((notification) => (
                <li
                  key={notification.id}
                  className={cn(
                    'flex items-start gap-3 px-5 py-4 transition-colors',
                    !notification.is_read && 'bg-brand-50/40 dark:bg-brand-950/20',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 rounded-lg p-2',
                      notification.type === 'ERROR'
                        ? 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400'
                        : notification.type === 'WARNING'
                          ? 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400'
                          : notification.type === 'SUCCESS'
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                            : 'bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400',
                    )}
                  >
                    <Bell className="h-4 w-4" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {notification.title}
                      </p>
                      <Badge tone={typeTone(notification.type)}>{notification.type}</Badge>
                      {!notification.is_read && (
                        <Badge tone="brand" dot>
                          Nouvelle
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{notification.message}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDateTime(notification.created_at)}</p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    {!notification.is_read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markRead.mutate(notification.id)}
                        aria-label="Marquer comme lue"
                      >
                        <CheckCheck className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600"
                      onClick={() => remove.mutate(notification.id)}
                      aria-label="Supprimer la notification"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {meta && (
              <Pagination
                page={page}
                limit={meta.limit}
                total={meta.total}
                totalPages={meta.totalPages}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}
