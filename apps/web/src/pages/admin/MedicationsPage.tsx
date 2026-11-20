/**
 * Pharmacie — catalogue des médicaments.
 *
 * Recherche, filtres (catégorie, stock faible, péremption) et ajustement rapide
 * du stock. Le stock n'est jamais écrit directement : chaque ajustement crée un
 * mouvement `IN` ou `OUT` que les triggers répercutent sur la quantité.
 */

import { formatDate, formatMoney, type Medication, type Paginated } from '@mediclinic/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, PackagePlus, Pencil, Pill, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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
  Textarea,
  type Column,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiDelete, apiGet, apiGetRaw, apiPatch, apiPost, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { useListQuery } from '@/hooks';

export default function MedicationsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { filters, page, limit, sorting, setPage, setLimit, update, search, setSearch, reset } = useListQuery({
    category: '',
    lowStock: '',
    expired: '',
  });

  const [adjustTarget, setAdjustTarget] = useState<Medication | null>(null);
  const [formTarget, setFormTarget] = useState<Medication | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Medication | null>(null);

  const medicationsQuery = useQuery({
    queryKey: queryKeys.medications.all(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== '' && value !== undefined) params.set(key, String(value));
      }
      return apiGetRaw<Paginated<Medication>>(`/medications?${params.toString()}`);
    },
  });

  const categoriesQuery = useQuery({
    queryKey: queryKeys.medications.categories,
    queryFn: () => apiGet<string[]>('/medications/categories'),
  });

  const lowStockQuery = useQuery({
    queryKey: queryKeys.medications.lowStock,
    queryFn: () => apiGet<Medication[]>('/medications/low-stock'),
  });

  const adjustMutation = useMutation({
    mutationFn: (payload: { id: number; type: 'IN' | 'OUT'; quantity: number; reason: string }) =>
      apiPost<{ movement: unknown; medication: Medication }>(`/medications/${payload.id}/adjust-stock`, {
        type: payload.type,
        quantity: payload.quantity,
        reason: payload.reason,
      }),
    onSuccess: () => {
      toast.success('Stock ajusté.');
      setAdjustTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['medications'] });
    void queryClient.invalidateQueries({ queryKey: ['stock'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost<Medication>('/medications', payload),
    onSuccess: () => {
      toast.success('Médicament ajouté au catalogue.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      apiPatch<Medication>(`/medications/${id}`, payload),
    onSuccess: () => {
      toast.success('Fiche du médicament mise à jour.');
      setFormTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/medications/${id}`),
    onSuccess: () => {
      toast.success('Médicament supprimé.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const columns: Column<Medication>[] = [
    {
      key: 'name',
      header: 'Médicament',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
            <Pill className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900 dark:text-white">{row.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {row.category} · {row.unit}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Prix',
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      render: (row) => <span className="text-slate-700 dark:text-slate-200">{formatMoney(row.price)}</span>,
    },
    {
      key: 'stock_quantity',
      header: 'Stock',
      align: 'right',
      sortable: true,
      render: (row) => {
        const isLow = row.stock_quantity <= row.alert_threshold;
        return (
          <div className="text-right">
            <p
              className={cn(
                'font-semibold',
                row.stock_quantity === 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : isLow
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-900 dark:text-white',
              )}
            >
              {row.stock_quantity}
            </p>
            <p className="text-xs text-slate-400">seuil {row.alert_threshold}</p>
          </div>
        );
      },
    },
    {
      key: 'expiry_date',
      header: 'Péremption',
      hideOnMobile: true,
      render: (row) => {
        if (!row.expiry_date) return <span className="text-xs text-slate-400">—</span>;
        const expired = new Date(row.expiry_date) < new Date();
        return (
          <div>
            <p className={cn('text-xs', expired ? 'font-medium text-rose-600' : 'text-slate-700 dark:text-slate-200')}>
              {formatDate(row.expiry_date)}
            </p>
            {expired && (
              <Badge tone="danger" className="mt-0.5">
                Périmé
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Can permission="stock:manage">
            <Button size="sm" variant="secondary" onClick={() => setAdjustTarget(row)}>
              Ajuster
            </Button>
          </Can>
          <Can permission="medication:update">
            <Button
              size="sm"
              variant="ghost"
              aria-label="Modifier le médicament"
              onClick={() => setFormTarget(row)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </Can>
          <Can permission="medication:delete">
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
              aria-label="Supprimer le médicament"
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Can>
        </div>
      ),
    },
  ];

  const meta = medicationsQuery.data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Médicaments"
        subtitle="Catalogue de la pharmacie et niveaux de stock."
        actions={
          <Can permission="medication:create">
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
              Nouveau médicament
            </Button>
          </Can>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Références" value={meta?.total ?? 0} icon={Pill} tone="info" />
        <StatCard
          label="Sous le seuil d’alerte"
          value={lowStockQuery.data?.length ?? 0}
          icon={AlertTriangle}
          tone={(lowStockQuery.data?.length ?? 0) > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Ruptures de stock"
          value={(lowStockQuery.data ?? []).filter((item) => item.stock_quantity === 0).length}
          icon={AlertTriangle}
          tone="danger"
        />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Nom ou fournisseur…"
            leftIcon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Rechercher un médicament"
          />
          <Select
            options={(categoriesQuery.data ?? []).map((category) => ({ value: category, label: category }))}
            placeholder="Toutes les catégories"
            value={String(filters.category ?? '')}
            onChange={(event) => update({ category: event.target.value })}
            aria-label="Filtrer par catégorie"
          />
          <Select
            options={[
              { value: 'true', label: 'Stock faible uniquement' },
              { value: 'false', label: 'Stock suffisant' },
            ]}
            placeholder="Tous les stocks"
            value={String(filters.lowStock ?? '')}
            onChange={(event) => update({ lowStock: event.target.value })}
            aria-label="Filtrer le stock"
          />
          <Select
            options={[
              { value: 'true', label: 'Périmés' },
              { value: 'false', label: 'Non périmés' },
            ]}
            placeholder="Toutes les péremptions"
            value={String(filters.expired ?? '')}
            onChange={(event) => update({ expired: event.target.value })}
            aria-label="Filtrer par péremption"
          />
          <Button variant="ghost" onClick={reset}>
            Réinitialiser
          </Button>
        </div>
      </Card>

      <Card>
        <DataTable
          columns={columns}
          data={medicationsQuery.data?.data ?? []}
          rowKey={(row) => row.id}
          isLoading={medicationsQuery.isLoading}
          isError={medicationsQuery.isError}
          errorMessage={getApiErrorMessage(medicationsQuery.error)}
          onRetry={() => void medicationsQuery.refetch()}
          emptyTitle="Aucun médicament"
          emptyDescription="Aucune référence ne correspond aux filtres sélectionnés."
          emptyAction={
            <Can permission="medication:create">
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setFormTarget('new')}>
                Ajouter un médicament
              </Button>
            </Can>
          }
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

      <AdjustStockModal
        medication={adjustTarget}
        onClose={() => setAdjustTarget(null)}
        isPending={adjustMutation.isPending}
        onSubmit={(payload) => adjustMutation.mutate(payload)}
      />

      <MedicationFormModal
        isOpen={formTarget !== null}
        medication={formTarget !== null && formTarget !== 'new' ? formTarget : undefined}
        isPending={createMutation.isPending || updateMutation.isPending}
        onClose={() => setFormTarget(null)}
        onSubmit={(payload) => {
          if (formTarget !== null && formTarget !== 'new') {
            updateMutation.mutate({ id: formTarget.id, payload });
          } else {
            createMutation.mutate(payload);
          }
        }}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Supprimer ce médicament ?"
        message={
          <>
            La référence <span className="font-semibold">{deleteTarget?.name}</span> sera retirée du
            catalogue. L’historique des mouvements de stock est conservé.
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
/* Création / modification d'une fiche                                        */
/* -------------------------------------------------------------------------- */

function MedicationFormModal({
  isOpen,
  medication,
  isPending,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  medication?: Medication;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}): JSX.Element {
  const [values, setValues] = useState({
    name: '',
    category: '',
    unit: '',
    price: '',
    stockQuantity: '0',
    alertThreshold: '10',
    expiryDate: '',
    supplier: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    setValues({
      name: medication?.name ?? '',
      category: medication?.category ?? '',
      unit: medication?.unit ?? '',
      price: medication ? String(medication.price) : '',
      stockQuantity: medication ? String(medication.stock_quantity) : '0',
      alertThreshold: medication ? String(medication.alert_threshold) : '10',
      expiryDate: medication?.expiry_date ? medication.expiry_date.slice(0, 10) : '',
      supplier: medication?.supplier ?? '',
    });
  }, [isOpen, medication]);

  const handleSubmit = (): void => {
    if (values.name.trim().length < 2 || !values.category.trim() || !values.unit.trim()) {
      toast.error('Nom, catégorie et unité sont obligatoires.');
      return;
    }
    const price = Number(values.price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Indiquez un prix valide.');
      return;
    }

    const payload: Record<string, unknown> = {
      name: values.name.trim(),
      category: values.category.trim(),
      unit: values.unit.trim(),
      price,
      alertThreshold: Number(values.alertThreshold) || 0,
      ...(values.expiryDate ? { expiryDate: values.expiryDate } : {}),
      ...(values.supplier.trim() ? { supplier: values.supplier.trim() } : {}),
    };

    // Le stock initial n'est accepté qu'à la création : ensuite il passe
    // obligatoirement par un mouvement de stock.
    if (!medication) {
      payload.stockQuantity = Number(values.stockQuantity) || 0;
    }

    onSubmit(payload);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={medication ? 'Modifier le médicament' : 'Nouveau médicament'}
      description={
        medication
          ? `${medication.name} — stock actuel : ${medication.stock_quantity}`
          : 'Le stock initial peut être saisi ici ; il sera ensuite géré par mouvements.'
      }
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending}>
            {medication ? 'Enregistrer' : 'Ajouter au catalogue'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Nom"
          required
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Catégorie"
            required
            placeholder="ex. Antalgique"
            value={values.category}
            onChange={(event) => setValues({ ...values, category: event.target.value })}
          />
          <Input
            label="Unité"
            required
            placeholder="ex. comprimé, flacon"
            value={values.unit}
            onChange={(event) => setValues({ ...values, unit: event.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Prix unitaire (€)"
            type="number"
            min={0}
            step="0.01"
            required
            value={values.price}
            onChange={(event) => setValues({ ...values, price: event.target.value })}
          />
          <Input
            label="Seuil d’alerte"
            type="number"
            min={0}
            step={1}
            value={values.alertThreshold}
            onChange={(event) => setValues({ ...values, alertThreshold: event.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {!medication && (
            <Input
              label="Stock initial"
              type="number"
              min={0}
              step={1}
              value={values.stockQuantity}
              onChange={(event) => setValues({ ...values, stockQuantity: event.target.value })}
              hint="Modifiable ensuite uniquement via les mouvements de stock."
            />
          )}
          <Input
            label="Date de péremption"
            type="date"
            value={values.expiryDate}
            onChange={(event) => setValues({ ...values, expiryDate: event.target.value })}
          />
        </div>
        <Input
          label="Fournisseur"
          value={values.supplier}
          onChange={(event) => setValues({ ...values, supplier: event.target.value })}
        />
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Ajustement de stock                                                         */
/* -------------------------------------------------------------------------- */

function AdjustStockModal({
  medication,
  onClose,
  isPending,
  onSubmit,
}: {
  medication: Medication | null;
  onClose: () => void;
  isPending: boolean;
  onSubmit: (payload: { id: number; type: 'IN' | 'OUT'; quantity: number; reason: string }) => void;
}): JSX.Element {
  const [type, setType] = useState<'IN' | 'OUT'>('IN');
  const [quantity, setQuantity] = useState('10');
  const [reason, setReason] = useState('Réception de commande');

  const handleSubmit = (): void => {
    if (!medication) return;
    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      toast.error('La quantité doit être un entier positif.');
      return;
    }
    if (type === 'OUT' && parsed > medication.stock_quantity) {
      toast.error(`Stock insuffisant : ${medication.stock_quantity} unité(s) disponible(s).`);
      return;
    }
    if (reason.trim().length < 3) {
      toast.error('Merci d’indiquer un motif.');
      return;
    }
    onSubmit({ id: medication.id, type, quantity: parsed, reason: reason.trim() });
  };

  return (
    <Modal
      isOpen={medication !== null}
      onClose={onClose}
      title="Ajuster le stock"
      description={medication ? `${medication.name} — stock actuel : ${medication.stock_quantity}` : undefined}
      isBusy={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending} leftIcon={<PackagePlus className="h-4 w-4" />}>
            Enregistrer le mouvement
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Type de mouvement"
          options={[
            { value: 'IN', label: 'Entrée de stock (réception)' },
            { value: 'OUT', label: 'Sortie de stock (dispensation, casse…)' },
          ]}
          value={type}
          onChange={(event) => setType(event.target.value as 'IN' | 'OUT')}
        />

        <Input
          label="Quantité"
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          hint={
            type === 'OUT' && medication
              ? `Maximum disponible : ${medication.stock_quantity}`
              : undefined
          }
        />

        <Textarea
          label="Motif"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint="Ce motif apparaît dans l’historique du médicament."
        />

        <p className="rounded-lg bg-sky-50 p-3 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-300">
          Le stock est recalculé automatiquement par la base de données à partir des mouvements :
          aucun risque de désynchronisation.
        </p>
      </div>
    </Modal>
  );
}
