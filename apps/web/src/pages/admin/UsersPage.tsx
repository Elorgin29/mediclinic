/**
 * Gestion des utilisateurs (back-office).
 *
 * Création de comptes, attribution des rôles, activation/désactivation et
 * réinitialisation de mot de passe. Les rôles proposés proviennent du
 * référentiel `GET /api/roles`.
 */

import {
  formatDateTime,
  ROLE_LABELS_FR,
  type Paginated,
  type Role,
  type User,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Search, ShieldCheck, Trash2, UserCheck, UserPlus, UserX } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Input,
  Modal,
  Pagination,
  Select,
  StatCard,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiDelete, apiGet, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { initialsFrom } from '@/lib/utils';
import { useListQuery } from '@/hooks';

export default function UsersPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    isActive: '',
    role: '',
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const usersQuery = useQuery({
    queryKey: queryKeys.users.all(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, String(value));
      }
      return apiGetRaw<Paginated<User>>(`/users?${params.toString()}`);
    },
  });

  const rolesQuery = useQuery({
    queryKey: queryKeys.roles.all,
    queryFn: () => apiGet<Role[]>('/roles'),
  });

  /** Invalide la liste après une écriture. */
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<User>('/users', payload),
    onSuccess: () => {
      toast.success('Compte utilisateur créé.');
      setIsCreateOpen(false);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPatch<User>(`/users/${editTarget?.id}`, payload),
    onSuccess: () => {
      toast.success('Compte mis à jour.');
      setEditTarget(null);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (userId: number) => apiPatch<User>(`/users/${userId}`, { isActive: false }),
    onSuccess: () => {
      toast.success('Compte désactivé.');
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const activateMutation = useMutation({
    mutationFn: (userId: number) => apiPatch<User>(`/users/${userId}`, { isActive: true }),
    onSuccess: () => {
      toast.success('Compte réactivé.');
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => apiDelete(`/users/${userId}`),
    onSuccess: () => {
      toast.success('Compte supprimé.');
      setDeleteTarget(null);
      refresh();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const resetMutation = useMutation({
    mutationFn: (userId: number) => apiPost<unknown>(`/users/${userId}/reset-password`, {}),
    onSuccess: () => toast.success('Mot de passe réinitialisé. L’utilisateur devra le changer.'),
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const columns: Column<User>[] = [
    {
      key: 'last_name',
      header: 'Utilisateur',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
            {initialsFrom(row.first_name, row.last_name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900 dark:text-white">
              {row.first_name} {row.last_name}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Rôles',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles.map((role) => (
            <Badge key={role} tone="brand">
              {ROLE_LABELS_FR[role as keyof typeof ROLE_LABELS_FR] ?? role}
            </Badge>
          ))}
          {row.roles.length === 0 && <span className="text-xs text-slate-400">Aucun rôle</span>}
        </div>
      ),
    },
    {
      key: 'last_login_at',
      header: 'Dernière connexion',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {row.last_login_at ? formatDateTime(row.last_login_at) : 'Jamais'}
        </span>
      ),
    },
    {
      key: 'is_active',
      header: 'Statut',
      render: (row) => (
        <Badge tone={row.is_active ? 'success' : 'neutral'} dot>
          {row.is_active ? 'Actif' : 'Désactivé'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Can permission="user:update">
            <Button size="sm" variant="secondary" onClick={() => setEditTarget(row)}>
              Modifier
            </Button>
          </Can>
          <Can permission="user:manage">
            <Button
              size="sm"
              variant="ghost"
              aria-label="Réinitialiser le mot de passe"
              onClick={() => resetMutation.mutate(row.id)}
            >
              <KeyRound className="h-4 w-4" />
            </Button>
          </Can>
          <Can permission="user:delete">
            {row.is_active ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Désactiver le compte"
                onClick={() => deactivateMutation.mutate(row.id)}
              >
                <UserX className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Réactiver le compte"
                onClick={() => activateMutation.mutate(row.id)}
              >
                <UserCheck className="h-4 w-4" />
              </Button>
            )}
          </Can>
          <Can permission="user:delete">
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
              aria-label="Supprimer le compte"
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Can>
        </div>
      ),
    },
  ];

  const meta = usersQuery.data?.meta;
  const roleOptions = (rolesQuery.data ?? []).map((role) => ({ value: role.code, label: role.name }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Utilisateurs"
        subtitle="Comptes du personnel et accès au back-office."
        actions={
          <Can permission="user:create">
            <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setIsCreateOpen(true)}>
              Nouvel utilisateur
            </Button>
          </Can>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Comptes" value={meta?.total ?? 0} icon={ShieldCheck} tone="info" />
        <StatCard
          label="Actifs"
          value={(usersQuery.data?.data ?? []).filter((item) => item.is_active).length}
          icon={ShieldCheck}
          tone="success"
        />
        <StatCard
          label="Désactivés"
          value={(usersQuery.data?.data ?? []).filter((item) => !item.is_active).length}
          icon={UserX}
          tone="warning"
        />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px_200px_auto]">
          <Input
            placeholder="Nom, prénom ou email…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Rechercher un utilisateur"
          />
          <Select
            options={roleOptions}
            placeholder="Tous les rôles"
            value={String(filters.role ?? '')}
            onChange={(event) => update({ role: event.target.value })}
            aria-label="Filtrer par rôle"
          />
          <Select
            options={[
              { value: 'true', label: 'Comptes actifs' },
              { value: 'false', label: 'Comptes désactivés' },
            ]}
            placeholder="Tous les statuts"
            value={String(filters.isActive ?? '')}
            onChange={(event) => update({ isActive: event.target.value })}
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
          data={usersQuery.data?.data ?? []}
          rowKey={(row) => row.id}
          isLoading={usersQuery.isLoading}
          isError={usersQuery.isError}
          errorMessage={getApiErrorMessage(usersQuery.error)}
          onRetry={() => void usersQuery.refetch()}
          emptyTitle="Aucun utilisateur"
          emptyDescription="Aucun compte ne correspond aux filtres sélectionnés."
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

      <UserFormModal
        isOpen={isCreateOpen || editTarget !== null}
        user={editTarget}
        roleOptions={roleOptions}
        isPending={createMutation.isPending || updateMutation.isPending}
        onClose={() => {
          setIsCreateOpen(false);
          setEditTarget(null);
        }}
        onSubmit={(payload) => {
          if (editTarget) updateMutation.mutate(payload);
          else createMutation.mutate(payload);
        }}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Supprimer ce compte ?"
        message={
          <>
            Le compte de{' '}
            <span className="font-semibold">
              {deleteTarget?.first_name} {deleteTarget?.last_name}
            </span>{' '}
            ({deleteTarget?.email}) sera définitivement supprimé. Préférez la désactivation si le collaborateur
            peut revenir.
          </>
        }
        confirmLabel="Supprimer"
        isLoading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Formulaire                                                                  */
/* -------------------------------------------------------------------------- */

function UserFormModal({
  isOpen,
  user,
  roleOptions,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  user: User | null;
  roleOptions: Array<{ value: string; label: string }>;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [values, setValues] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    roleCodes: [] as string[],
    isActive: true,
  });

  // Réinitialise le formulaire à chaque ouverture / changement d'utilisateur.
  const formKey = user?.id ?? 'new';
  const [lastKey, setLastKey] = useState<string>('init');

  if (isOpen && lastKey !== formKey) {
    setLastKey(String(formKey));
    setValues({
      firstName: user?.first_name ?? '',
      lastName: user?.last_name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      password: '',
      roleCodes: user?.roles ?? [],
      isActive: user?.is_active ?? true,
    });
  }

  const toggleRole = (code: string): void => {
    setValues((current) => ({
      ...current,
      roleCodes: current.roleCodes.includes(code)
        ? current.roleCodes.filter((item) => item !== code)
        : [...current.roleCodes, code],
    }));
  };

  const handleSubmit = (): void => {
    if (!values.firstName.trim() || !values.lastName.trim() || !values.email.trim()) {
      toast.error('Prénom, nom et email sont obligatoires.');
      return;
    }
    if (!user && values.password.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (values.roleCodes.length === 0) {
      toast.error('Sélectionnez au moins un rôle.');
      return;
    }

    const payload: Record<string, unknown> = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim(),
      phone: values.phone.trim() || undefined,
      roleCodes: values.roleCodes,
      isActive: values.isActive,
    };
    if (values.password.length >= 8) payload.password = values.password;

    onSubmit(payload);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={user ? 'Modifier un utilisateur' : 'Nouvel utilisateur'}
      description={
        user
          ? `${user.first_name} ${user.last_name} — ${user.email}`
          : 'Le compte reçoit les permissions de ses rôles.'
      }
      isBusy={isPending}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {user ? 'Enregistrer' : 'Créer le compte'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Prénom"
            required
            value={values.firstName}
            onChange={(event) => setValues({ ...values, firstName: event.target.value })}
          />
          <Input
            label="Nom"
            required
            value={values.lastName}
            onChange={(event) => setValues({ ...values, lastName: event.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Email"
            type="email"
            required
            value={values.email}
            onChange={(event) => setValues({ ...values, email: event.target.value })}
          />
          <Input
            label="Téléphone"
            type="tel"
            value={values.phone}
            onChange={(event) => setValues({ ...values, phone: event.target.value })}
          />
        </div>

        <Input
          label={user ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe'}
          type="password"
          required={!user}
          hint="8 caractères minimum, avec au moins une lettre et un chiffre."
          value={values.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
        />

        <div>
          <p className="label">Rôles</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {roleOptions.map((role) => (
              <label
                key={role.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <input
                  type="checkbox"
                  checked={values.roleCodes.includes(role.value)}
                  onChange={() => toggleRole(role.value)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
                />
                <span className="text-slate-700 dark:text-slate-200">{role.label}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => setValues({ ...values, isActive: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
          />
          Compte actif (peut se connecter)
        </label>
      </div>
    </Modal>
  );
}
