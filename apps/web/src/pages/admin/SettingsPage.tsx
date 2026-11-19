/**
 * Paramètres de la clinique (back-office).
 *
 * Identité de l'établissement, coordonnées, devise et TVA, ainsi que l'état de
 * l'intégration Zoom (les secrets ne sont jamais renvoyés en clair par l'API).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Save, Video } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge, Button, Card, CardBody, CardHeader, Input, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { Can } from '@/components/Can';
import { apiGet, apiPatch, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';

interface ClinicSettings {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  vat_rate: string;
  logo_url: string | null;
  zoomConfigured: boolean;
  zoomMode: string;
}

export default function SettingsPage(): JSX.Element {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => apiGet<ClinicSettings>('/settings'),
  });

  const [values, setValues] = useState<Partial<ClinicSettings>>({});
  const [lastLoaded, setLastLoaded] = useState(false);

  // Initialise le formulaire une seule fois, au premier chargement réussi.
  if (settingsQuery.data && !lastLoaded) {
    setLastLoaded(true);
    setValues(settingsQuery.data);
  }

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPatch<ClinicSettings>('/settings', payload),
    onSuccess: (updated) => {
      toast.success('Paramètres enregistrés.');
      setValues(updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  if (settingsQuery.isLoading) {
    return (
      <div className="space-y-5">
        <h1 className="page-title">Paramètres</h1>
        <Card className="flex items-center justify-center py-16">
          <Spinner className="h-6 w-6" />
        </Card>
      </div>
    );
  }

  const handleSubmit = (): void => {
    mutation.mutate({
      name: values.name,
      address: values.address ?? undefined,
      phone: values.phone ?? undefined,
      email: values.email ?? undefined,
      currency: values.currency,
      vatRate: Number(values.vat_rate ?? 20),
      logoUrl: values.logo_url ?? undefined,
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Paramètres"
        subtitle="Identité de la clinique utilisée dans les documents PDF et l’interface."
        actions={
          <Can permission="settings:update">
            <Button
              size="sm"
              leftIcon={<Save className="h-4 w-4" />}
              onClick={handleSubmit}
              isLoading={mutation.isPending}
            >
              Enregistrer
            </Button>
          </Can>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Identité */}
        <Card>
          <CardHeader title="Identité de l’établissement" description="En-tête des factures et ordonnances" />
          <CardBody className="space-y-4">
            <Input
              label="Nom de la clinique"
              leftIcon={<Building2 className="h-4 w-4" />}
              value={values.name ?? ''}
              onChange={(event) => setValues({ ...values, name: event.target.value })}
            />
            <Input
              label="Adresse"
              value={values.address ?? ''}
              onChange={(event) => setValues({ ...values, address: event.target.value })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Téléphone"
                type="tel"
                value={values.phone ?? ''}
                onChange={(event) => setValues({ ...values, phone: event.target.value })}
              />
              <Input
                label="Email de contact"
                type="email"
                value={values.email ?? ''}
                onChange={(event) => setValues({ ...values, email: event.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Devise"
                maxLength={3}
                hint="Code ISO à 3 lettres (EUR, USD, MAD…)"
                value={values.currency ?? 'EUR'}
                onChange={(event) => setValues({ ...values, currency: event.target.value.toUpperCase() })}
              />
              <Input
                label="Taux de TVA (%)"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={values.vat_rate ?? '20'}
                onChange={(event) => setValues({ ...values, vat_rate: event.target.value })}
              />
            </div>
            <Input
              label="URL du logo"
              hint="PNG 512×512 recommandé. Utilisé dans l’en-tête des PDF."
              value={values.logo_url ?? ''}
              onChange={(event) => setValues({ ...values, logo_url: event.target.value })}
            />
          </CardBody>
        </Card>

        {/* Zoom et informations système */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Téléconsultation (Zoom)" description="Server-to-Server OAuth + Meeting SDK" />
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-600 dark:text-slate-300">État de l’intégration</span>
                <Badge tone={values.zoomConfigured ? 'success' : 'warning'} dot>
                  {values.zoomConfigured ? 'Configurée' : 'Mode simulé'}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-600 dark:text-slate-300">Mode actif</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {values.zoomMode ?? 'détection…'}
                </span>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                <p className="flex items-start gap-2">
                  <Video className="mt-0.5 h-4 w-4 shrink-0 text-brand-700 dark:text-brand-400" aria-hidden />
                  <span>
                    Les identifiants Zoom (compte, client ID, client secret, SDK key/secret) se configurent
                    exclusivement dans le fichier <code className="rounded bg-white px-1 dark:bg-slate-900">.env</code>{' '}
                    du serveur — jamais depuis l’interface, afin qu’ils ne transitent pas par le navigateur.
                    Sans identifiants, les téléconsultations restent simulées et l’application fonctionne
                    intégralement.
                  </span>
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Compte et sécurité" />
            <CardBody className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <p>
                Les mots de passe sont hachés avec <strong>bcrypt</strong> (12 tours) et ne sont jamais
                stockés en clair.
              </p>
              <p>
                Les jetons d’accès JWT expirent au bout de <strong>15 minutes</strong> ; les jetons de
                rafraîchissement sont à usage unique et révoqués à chaque rotation.
              </p>
              <p>
                Chaque action sensible est journalisée dans le{' '}
                <a href="/admin/audit" className="link">
                  journal d’audit
                </a>{' '}
                avec l’adresse IP et l’agent utilisateur.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
