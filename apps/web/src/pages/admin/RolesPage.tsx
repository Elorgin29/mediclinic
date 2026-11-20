/**
 * Gestion des rôles et de la matrice des permissions.
 *
 * Écran central du RBAC modulaire : pour chaque rôle, une grille de cases à
 * cocher par ressource et par action. La matrice est chargée en une seule
 * requête (`GET /api/permissions/matrix`) et enregistrée par rôle
 * (`PUT /api/roles/:id/permissions`).
 */

import {
  labelsFor,
  localizedRoleLabel,
  type Permission,
  type PermissionAction,
  type PermissionResource,
} from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock, Pencil, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Spinner,
  StatCard,
  Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { useI18n } from '@/i18n/I18nContext';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { cn } from '@/lib/utils';

interface RoleSummary {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_system: boolean;
}

interface MatrixResponse {
  roles: RoleSummary[];
  permissions: Permission[];
  matrix: Record<string, number[]>;
  actionLabels: Record<string, string>;
  resourceLabels: Record<string, string>;
}

/** Ordre d'affichage des actions dans la grille. */
const ACTIONS: PermissionAction[] = ['create', 'read', 'update', 'delete', 'manage'];

export default function RolesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const permissionLabels = labelsFor();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  /** Identifiants de permissions cochés pour le rôle courant. */
  const [draft, setDraft] = useState<Set<number>>(new Set());
  const [roleTarget, setRoleTarget] = useState<RoleSummary | 'new' | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleSummary | null>(null);

  const matrixQuery = useQuery({
    queryKey: queryKeys.roles.matrix,
    queryFn: () => apiGet<MatrixResponse>('/permissions/matrix'),
  });

  /* Sélectionne le premier rôle disponible au chargement. */
  useEffect(() => {
    const roles = matrixQuery.data?.roles ?? [];
    if (selectedRoleId === null && roles.length > 0) {
      const first = roles[0];
      if (first) setSelectedRoleId(first.id);
    }
  }, [matrixQuery.data, selectedRoleId]);

  /* Charge la matrice du rôle sélectionné dans le brouillon. */
  useEffect(() => {
    if (selectedRoleId === null || !matrixQuery.data) return;
    const granted = matrixQuery.data.matrix[String(selectedRoleId)] ?? [];
    setDraft(new Set(granted));
  }, [selectedRoleId, matrixQuery.data]);

  const selectedRole = useMemo(
    () => (matrixQuery.data?.roles ?? []).find((role) => role.id === selectedRoleId) ?? null,
    [matrixQuery.data, selectedRoleId],
  );

  /** Permissions regroupées par ressource, dans l'ordre métier. */
  const grouped = useMemo(() => {
    const map = new Map<PermissionResource, Map<PermissionAction, Permission>>();
    for (const permission of matrixQuery.data?.permissions ?? []) {
      const resource = permission.resource as PermissionResource;
      const action = permission.action as PermissionAction;
      let byAction = map.get(resource);
      if (!byAction) {
        byAction = new Map();
        map.set(resource, byAction);
      }
      byAction.set(action, permission);
    }
    return [...map.entries()];
  }, [matrixQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPut<unknown>(`/roles/${selectedRoleId}/permissions`, { permissionIds: [...draft] }),
    onSuccess: () => {
      toast.success('Matrice des permissions enregistrée.');
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      void queryClient.invalidateQueries({ queryKey: ['permissions'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const toggle = (permissionId: number): void => {
    setDraft((current) => {
      const next = new Set(current);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const invalidateRoles = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['roles'] });
    void queryClient.invalidateQueries({ queryKey: ['permissions'] });
  };

  const createRoleMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<RoleSummary>('/roles', payload),
    onSuccess: (role) => {
      toast.success('Rôle créé.');
      setRoleTarget(null);
      invalidateRoles();
      setSelectedRoleId(role.id);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiPatch<RoleSummary>(`/roles/${id}`, payload),
    onSuccess: () => {
      toast.success('Rôle mis à jour.');
      setRoleTarget(null);
      invalidateRoles();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/roles/${id}`),
    onSuccess: () => {
      toast.success('Rôle supprimé.');
      setDeleteRoleTarget(null);
      setSelectedRoleId(null);
      invalidateRoles();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  /** Coche ou décoche toutes les permissions d'une ressource. */
  const toggleResource = (resource: PermissionResource): void => {
    const ids = [...(grouped.find(([key]) => key === resource)?.[1].values() ?? [])].map(
      (permission) => permission.id,
    );
    const allChecked = ids.every((id) => draft.has(id));

    setDraft((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (allChecked) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const isDirty = useMemo(() => {
    if (selectedRoleId === null || !matrixQuery.data) return false;
    const original = new Set(matrixQuery.data.matrix[String(selectedRoleId)] ?? []);
    if (original.size !== draft.size) return true;
    return [...draft].some((id) => !original.has(id));
  }, [draft, matrixQuery.data, selectedRoleId]);

  if (matrixQuery.isLoading) {
    return (
      <div className="space-y-5">
        <h1 className="page-title">Rôles &amp; permissions</h1>
        <Card className="flex items-center justify-center py-16">
          <Spinner className="h-6 w-6" />
        </Card>
      </div>
    );
  }

  if (matrixQuery.isError || !matrixQuery.data) {
    return (
      <div className="space-y-5">
        <h1 className="page-title">Rôles &amp; permissions</h1>
        <Card>
          <ErrorState
            message={getApiErrorMessage(matrixQuery.error)}
            onRetry={() => void matrixQuery.refetch()}
          />
        </Card>
      </div>
    );
  }

  const { roles, permissions } = matrixQuery.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rôles & permissions"
        subtitle="Matrice de contrôle d’accès : chaque case accorde une action précise sur une ressource."
        actions={
          <>
            <Can permission="role:create">
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => setRoleTarget('new')}
              >
                Nouveau rôle
              </Button>
            </Can>
            <Can permission="role:manage">
              <Button
                size="sm"
                leftIcon={<Save className="h-4 w-4" />}
                onClick={() => saveMutation.mutate()}
                isLoading={saveMutation.isPending}
                disabled={!isDirty || selectedRole === null}
              >
                Enregistrer
              </Button>
            </Can>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Rôles" value={roles.length} icon={KeyRound} tone="brand" />
        <StatCard label="Permissions" value={permissions.length} icon={ShieldCheck} tone="info" />
        <StatCard
          label="Permissions du rôle sélectionné"
          value={draft.size}
          icon={ShieldCheck}
          tone="success"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Liste des rôles */}
        <Card className="self-start p-2">
          <ul className="space-y-0.5">
            {roles.map((role) => {
              const count = (matrixQuery.data?.matrix[String(role.id)] ?? []).length;
              const isActive = role.id === selectedRoleId;

              return (
                <li key={role.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedRoleId(role.id)}
                    className={cn(
                      'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {role.is_system && (
                        <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Rôle système" />
                      )}
                      <span className="truncate font-medium">{localizedRoleLabel(role.code)}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {count}
                    </span>
                  </button>
                  <Can permission="role:update">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Modifier ${role.name}`}
                      onClick={() => setRoleTarget(role)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Can>
                  {!role.is_system && (
                    <Can permission="role:delete">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
                        aria-label={`Supprimer ${role.name}`}
                        onClick={() => setDeleteRoleTarget(role)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </Can>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Matrice */}
        <Card>
          <CardHeader
            title={selectedRole ? selectedRole.name : 'Sélectionnez un rôle'}
            description={
              selectedRole
                ? `${draft.size} permission(s) accordée(s) · code ${selectedRole.code}`
                : undefined
            }
            actions={
              selectedRole?.is_system ? (
                <Badge tone="neutral">
                  <Lock className="mr-1 h-3 w-3" aria-hidden />
                  Rôle système
                </Badge>
              ) : undefined
            }
          />

          <CardBody className="p-0">
            {grouped.length === 0 ? (
              <EmptyState title="Aucune permission enregistrée" />
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-slate-50 dark:bg-slate-900">Ressource</th>
                      {ACTIONS.map((action) => (
                        <th key={action} className="text-center">
                          {permissionLabels.permissionAction[action]}
                        </th>
                      ))}
                      <th className="text-center">Tout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map(([resource, byAction]) => {
                      const resourceLabel =
                        permissionLabels.permissionResource[resource] ?? String(resource);
                      const ids = [...byAction.values()].map((permission) => permission.id);
                      const allChecked = ids.length > 0 && ids.every((id) => draft.has(id));

                      return (
                        <tr key={String(resource)}>
                          <td className="sticky left-0 bg-white font-medium dark:bg-slate-900">
                            {resourceLabel}
                          </td>

                          {ACTIONS.map((action) => {
                            const permission = byAction.get(action);
                            if (!permission) {
                              return (
                                <td key={action} className="text-center text-slate-300">
                                  —
                                </td>
                              );
                            }

                            const isChecked = draft.has(permission.id);
                            return (
                              <td key={action} className="text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggle(permission.id)}
                                  aria-label={`${resourceLabel} — ${permissionLabels.permissionAction[action]}`}
                                  title={t(`permission.${permission.code}.description`, permission.description ?? permission.code)}
                                  className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
                                />
                              </td>
                            );
                          })}

                          <td className="text-center">
                            <input
                              type="checkbox"
                              checked={allChecked}
                              onChange={() => toggleResource(resource)}
                              aria-label={`Tout cocher pour ${resourceLabel}`}
                              className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>

          {isDirty && (
            <div className="flex items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <p>Modifications non enregistrées.</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (selectedRoleId === null || !matrixQuery.data) return;
                    setDraft(new Set(matrixQuery.data.matrix[String(selectedRoleId)] ?? []));
                  }}
                >
                  Annuler
                </Button>
                <Can permission="role:manage">
                  <Button size="sm" onClick={() => saveMutation.mutate()} isLoading={saveMutation.isPending}>
                    Enregistrer
                  </Button>
                </Can>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-200">Règle d’héritage :</span>{' '}
          la permission <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">manage</code> implique
          les actions <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">create</code>,{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">read</code>,{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">update</code> et{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">delete</code> de la même ressource.
          Les rôles système ne peuvent pas être supprimés ; le rôle SUPER_ADMIN conserve l’intégralité des
          droits.
        </p>
      </Card>

      <RoleFormModal
        isOpen={roleTarget !== null}
        role={roleTarget !== null && roleTarget !== 'new' ? roleTarget : undefined}
        isPending={createRoleMutation.isPending || updateRoleMutation.isPending}
        onClose={() => setRoleTarget(null)}
        onSubmit={(payload) => {
          if (roleTarget !== null && roleTarget !== 'new') {
            updateRoleMutation.mutate({ id: roleTarget.id, payload });
          } else {
            createRoleMutation.mutate(payload);
          }
        }}
      />

      <ConfirmDialog
        isOpen={deleteRoleTarget !== null}
        title="Supprimer ce rôle ?"
        message={
          <>
            Le rôle <span className="font-semibold">{deleteRoleTarget?.name}</span> et ses permissions seront
            définitivement supprimés. Les utilisateurs qui y sont rattachés devront être réaffectés.
          </>
        }
        confirmLabel="Supprimer"
        isLoading={deleteRoleMutation.isPending}
        onCancel={() => setDeleteRoleTarget(null)}
        onConfirm={() => deleteRoleTarget && deleteRoleMutation.mutate(deleteRoleTarget.id)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Création / modification d'un rôle                                           */
/* -------------------------------------------------------------------------- */

function RoleFormModal({
  isOpen,
  role,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  role?: RoleSummary;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [values, setValues] = useState({ code: '', name: '', description: '' });

  useEffect(() => {
    if (!isOpen) return;
    setValues({
      code: role?.code ?? '',
      name: role?.name ?? '',
      description: role?.description ?? '',
    });
  }, [isOpen, role]);

  const handleSubmit = (): void => {
    if (values.name.trim().length < 2) {
      toast.error('Le nom du rôle est obligatoire.');
      return;
    }
    if (!role && !/^[A-Z][A-Z0-9_]*$/.test(values.code.trim())) {
      toast.error('Le code doit être en MAJUSCULES, avec des underscores (ex. ASSISTANT_RH).');
      return;
    }

    onSubmit({
      ...(role ? {} : { code: values.code.trim() }),
      name: values.name.trim(),
      ...(values.description.trim() ? { description: values.description.trim() } : {}),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={role ? 'Modifier le rôle' : 'Nouveau rôle'}
      description={
        role
          ? 'Le code du rôle est immuable ; seuls le nom et la description peuvent être modifiés.'
          : 'Créez un rôle personnalisé puis attribuez-lui des permissions dans la matrice.'
      }
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {role ? 'Enregistrer' : 'Créer le rôle'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Code"
          required={!role}
          disabled={Boolean(role)}
          placeholder="ex. ASSISTANT_RH"
          value={values.code}
          onChange={(event) => setValues({ ...values, code: event.target.value.toUpperCase() })}
          hint={role ? 'Le code ne peut plus être modifié.' : 'MAJUSCULES et underscores uniquement.'}
        />
        <Input
          label="Nom"
          required
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
        <Textarea
          label="Description"
          rows={3}
          value={values.description}
          onChange={(event) => setValues({ ...values, description: event.target.value })}
        />
      </div>
    </Modal>
  );
}
