/**
 * Mes factures (espace patient).
 *
 * Factures émises, montant restant dû et téléchargement du justificatif.
 */

import {
  formatDate,
  formatMoney,
  INVOICE_STATUS_LABELS_FR,
  type Invoice,
} from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { Download, Receipt, Wallet } from 'lucide-react';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Spinner,
  StatCard,
  StatusBadge,
} from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { apiGet, getApiErrorMessage } from '@/lib/apiClient';
import { downloadPdf } from '@/lib/pdf';
import { queryKeys } from '@/lib/queryClient';

export default function PatientInvoicesPage(): JSX.Element {
  const invoicesQuery = useQuery({
    queryKey: queryKeys.invoices.me,
    queryFn: () => apiGet<Invoice[]>('/invoices/me'),
  });

  const invoices = invoicesQuery.data ?? [];
  const totalBilled = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount), 0);
  const totalPaid = invoices.reduce((sum, invoice) => sum + Number(invoice.paid_amount), 0);
  const outstanding = totalBilled - totalPaid;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mes factures"
        subtitle="Consultez vos factures et téléchargez vos justificatifs pour votre mutuelle."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total facturé" value={formatMoney(totalBilled)} icon={Receipt} tone="info" />
        <StatCard label="Total réglé" value={formatMoney(totalPaid)} icon={Wallet} tone="success" />
        <StatCard
          label="Reste à payer"
          value={formatMoney(outstanding)}
          icon={Wallet}
          tone={outstanding > 0 ? 'warning' : 'brand'}
        />
      </div>

      {invoicesQuery.isLoading ? (
        <Card className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </Card>
      ) : invoicesQuery.isError ? (
        <Card>
          <ErrorState
            message={getApiErrorMessage(invoicesQuery.error)}
            onRetry={() => void invoicesQuery.refetch()}
          />
        </Card>
      ) : invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title="Aucune facture"
            description="Vos factures apparaîtront ici après votre première consultation."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => {
            const balance = Number(invoice.total_amount) - Number(invoice.paid_amount);

            return (
              <Card key={invoice.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{invoice.number}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Émise le {formatDate(invoice.issued_at)} · Échéance {formatDate(invoice.due_date)}
                    </p>
                    <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                      {formatMoney(invoice.total_amount)}
                    </p>
                    {balance > 0 && invoice.status !== 'CANCELLED' && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Reste à payer : {formatMoney(balance)}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge
                      kind="invoice"
                      status={invoice.status}
                      label={INVOICE_STATUS_LABELS_FR[invoice.status]}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<Download className="h-3.5 w-3.5" />}
                      onClick={() => void downloadPdf(`/pdf/invoice/${invoice.id}`)}
                    >
                      PDF
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
