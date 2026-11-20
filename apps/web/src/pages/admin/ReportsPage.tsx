/**
 * Rapports et statistiques (back-office).
 *
 * Cinq rapports : chiffre d'affaires, rendez-vous, stock, activité du personnel
 * et démographie patients. Chaque rapport dispose d'une période paramétrable et
 * d'un export CSV exploitable dans Excel.
 */

import { formatMoney } from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, FileSpreadsheet, TrendingUp, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge, Button, Card, CardBody, CardHeader, Input, Select, Spinner, StatCard, Tabs } from '@/components/ui';
import { PageHeader } from '@/components/layouts/PageHeader';
import { apiGet, api } from '@/lib/apiClient';
import { formatNumber } from '@/lib/utils';
import { queryKeys } from '@/lib/queryClient';

/* -------------------------------------------------------------------------- */
/* Types de réponse                                                            */
/* -------------------------------------------------------------------------- */

interface RevenueReport {
  from: string;
  to: string;
  totalRevenue: number;
  invoiceCount: number;
  paymentCount: number;
  averageInvoice: number;
  byMonth: Array<{ month: string; revenue: number }>;
  byMethod: Array<{ method: string; count: number; amount: number }>;
  byStatus: Array<{ status: string; count: number; amount: number }>;
  topPatients: Array<{ patientId: number; patientName: string; amount: number }>;
}

interface AppointmentsReport {
  from: string;
  to: string;
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
  attendanceRate: number;
  groups: Array<{ label: string; count: number }>;
}

interface StockReport {
  totalReferences: number;
  totalUnits: number;
  stockValue: number;
  lowStock: Array<{ id: number; name: string; stock_quantity: number; alert_threshold: number }>;
  expired: Array<{ id: number; name: string; expiry_date: string }>;
  movements: { in: number; out: number };
  consumptionByMedication: Array<{ medicationId: number; name: string; quantityOut: number; valueOut: number }>;
}

interface ActivityReport {
  totalActions: number;
  byAction: Array<{ action: string; count: number }>;
  byResource: Array<{ resource: string; count: number }>;
  byUser: Array<{ userId: number; userName: string; count: number }>;
  byDay: Array<{ date: string; count: number }>;
}

interface PatientsReport {
  newPatients: number;
  totalPatients: number;
  byGender: Array<{ gender: string; count: number }>;
  byAgeRange: Array<{ range: string; count: number }>;
  byCity: Array<{ city: string; count: number }>;
}

const PIE_COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04'];

/** Période de rapport (dates `AAAA-MM-JJ`). */
interface ReportRange {
  from: string;
  to: string;
}

/** Date du jour au format `AAAA-MM-JJ`. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Premier jour du mois courant. */
function monthStart(): string {
  return `${today().slice(0, 7)}-01`;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function ReportsPage(): JSX.Element {
  const [tab, setTab] = useState('revenue');
  const [range, setRange] = useState<ReportRange>({ from: monthStart(), to: today() });
  const [groupBy, setGroupBy] = useState('day');

  const revenueQuery = useQuery({
    queryKey: queryKeys.reports.revenue(range.from, range.to),
    queryFn: () => apiGet<RevenueReport>(`/reports/revenue?from=${range.from}&to=${range.to}`),
    enabled: tab === 'revenue',
  });

  const appointmentsQuery = useQuery({
    queryKey: queryKeys.reports.appointments(range.from, range.to, groupBy),
    queryFn: () =>
      apiGet<AppointmentsReport>(
        `/reports/appointments?from=${range.from}&to=${range.to}&groupBy=${groupBy}`,
      ),
    enabled: tab === 'appointments',
  });

  const stockQuery = useQuery({
    queryKey: queryKeys.reports.stock(range.from, range.to),
    queryFn: () => apiGet<StockReport>(`/reports/stock?from=${range.from}&to=${range.to}`),
    enabled: tab === 'stock',
  });

  const activityQuery = useQuery({
    queryKey: queryKeys.reports.activity(range.from, range.to),
    queryFn: () => apiGet<ActivityReport>(`/reports/activity?from=${range.from}&to=${range.to}`),
    enabled: tab === 'activity',
  });

  const patientsQuery = useQuery({
    queryKey: queryKeys.reports.patients(range.from, range.to),
    queryFn: () => apiGet<PatientsReport>(`/reports/patients?from=${range.from}&to=${range.to}`),
    enabled: tab === 'patients',
  });

  /** Télécharge le CSV du rapport courant. */
  const exportCsv = async (): Promise<void> => {
    const response = await api.get(
      `/reports/export.csv?type=${tab}&from=${range.from}&to=${range.to}`,
      { responseType: 'blob' },
    );
    const url = URL.createObjectURL(response.data as Blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `rapport-${tab}-${range.from}-${range.to}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const isLoading =
    (tab === 'revenue' && revenueQuery.isLoading) ||
    (tab === 'appointments' && appointmentsQuery.isLoading) ||
    (tab === 'stock' && stockQuery.isLoading) ||
    (tab === 'activity' && activityQuery.isLoading) ||
    (tab === 'patients' && patientsQuery.isLoading);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rapports"
        subtitle="Analyse de l’activité clinique et financière sur une période paramétrable."
        actions={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<FileSpreadsheet className="h-4 w-4" />}
            onClick={() => void exportCsv()}
          >
            Exporter en CSV
          </Button>
        }
      />

      {/* Période et regroupement */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Du"
            type="date"
            value={range.from}
            onChange={(event) => setRange({ ...range, from: event.target.value })}
          />
          <Input
            label="Au"
            type="date"
            value={range.to}
            onChange={(event) => setRange({ ...range, to: event.target.value })}
          />
          <div className="flex items-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRange({ from: monthStart(), to: today() })}>
              Ce mois
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const year = new Date().getFullYear();
                setRange({ from: `${year}-01-01`, to: today() });
              }}
            >
              Cette année
            </Button>
          </div>
          {tab === 'appointments' && (
            <Select
              label="Regroupement"
              options={[
                { value: 'day', label: 'Par jour' },
                { value: 'week', label: 'Par semaine' },
                { value: 'month', label: 'Par mois' },
                { value: 'department', label: 'Par département' },
                { value: 'doctor', label: 'Par médecin' },
                { value: 'status', label: 'Par statut' },
              ]}
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value)}
            />
          )}
        </div>
      </Card>

      <Tabs
        items={[
          { id: 'revenue', label: 'Chiffre d’affaires' },
          { id: 'appointments', label: 'Rendez-vous' },
          { id: 'stock', label: 'Stock' },
          { id: 'activity', label: 'Activité' },
          { id: 'patients', label: 'Patients' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {isLoading && (
        <Card className="flex items-center justify-center py-16">
          <Spinner className="h-6 w-6" />
        </Card>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Chiffre d'affaires                                                */}
      {/* ---------------------------------------------------------------- */}
      {tab === 'revenue' && revenueQuery.data && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="CA encaissé" value={formatMoney(revenueQuery.data.totalRevenue)} icon={Wallet} tone="success" />
            <StatCard label="Factures émises" value={formatNumber(revenueQuery.data.invoiceCount)} icon={BarChart3} tone="info" />
            <StatCard label="Paiements" value={formatNumber(revenueQuery.data.paymentCount)} icon={TrendingUp} tone="brand" />
            <StatCard
              label="Facture moyenne"
              value={formatMoney(revenueQuery.data.averageInvoice)}
              icon={Wallet}
              tone="warning"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Évolution mensuelle" />
              <CardBody>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueQuery.data.byMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip formatter={(value: number) => formatMoney(value)} />
                      <Line type="monotone" dataKey="revenue" name="CA" stroke="#0f766e" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Répartition par moyen de paiement" />
              <CardBody>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={revenueQuery.data.byMethod} dataKey="amount" nameKey="method" outerRadius={80}>
                        {revenueQuery.data.byMethod.map((_, index) => (
                          <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatMoney(value)} />
                      <Legend iconSize={8} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Meilleurs patients" description="Par montant facturé sur la période" />
            <CardBody className="p-0">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {revenueQuery.data.topPatients.map((patient, index) => (
                  <li key={patient.patientId} className="flex items-center justify-between px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">{index + 1}</Badge>
                      <span className="text-sm text-slate-700 dark:text-slate-200">{patient.patientName}</span>
                    </div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      {formatMoney(patient.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Rendez-vous                                                       */}
      {/* ---------------------------------------------------------------- */}
      {tab === 'appointments' && appointmentsQuery.data && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total" value={formatNumber(appointmentsQuery.data.total)} icon={BarChart3} tone="info" />
            <StatCard label="Terminés" value={formatNumber(appointmentsQuery.data.completed)} tone="success" />
            <StatCard label="Annulés" value={formatNumber(appointmentsQuery.data.cancelled)} tone="danger" />
            <StatCard
              label="Taux de présence"
              value={`${appointmentsQuery.data.attendanceRate.toFixed(1)} %`}
              tone="brand"
            />
          </div>

          <Card>
            <CardHeader title="Répartition" description={`Regroupement : ${groupBy}`} />
            <CardBody>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={appointmentsQuery.data.groups} margin={{ bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      angle={-30}
                      textAnchor="end"
                      height={60}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip />
                    <Bar dataKey="count" name="Rendez-vous" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Stock                                                             */}
      {/* ---------------------------------------------------------------- */}
      {tab === 'stock' && stockQuery.data && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Références" value={formatNumber(stockQuery.data.totalReferences)} tone="info" />
            <StatCard label="Unités en stock" value={formatNumber(stockQuery.data.totalUnits)} tone="brand" />
            <StatCard label="Valeur du stock" value={formatMoney(stockQuery.data.stockValue)} tone="success" />
            <StatCard
              label="Mouvements"
              value={`${stockQuery.data.movements.in} entrées / ${stockQuery.data.movements.out} sorties`}
              tone="warning"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Alertes de stock" />
              <CardBody className="p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stockQuery.data.lowStock.map((item) => (
                    <li key={item.id} className="flex justify-between px-5 py-2.5 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{item.name}</span>
                      <span className="font-medium text-amber-600">
                        {item.stock_quantity} / {item.alert_threshold}
                      </span>
                    </li>
                  ))}
                  {stockQuery.data.lowStock.length === 0 && (
                    <li className="px-5 py-6 text-center text-sm text-slate-500">Aucune alerte.</li>
                  )}
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Consommation par médicament" />
              <CardBody>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stockQuery.data.consumptionByMedication.slice(0, 8)}
                      layout="vertical"
                      margin={{ left: 16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="quantityOut" name="Quantité sortie" fill="#0f766e" radius={[0, 4, 4, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Activité                                                          */}
      {/* ---------------------------------------------------------------- */}
      {tab === 'activity' && activityQuery.data && (
        <div className="space-y-5">
          <StatCard label="Actions journalisées" value={formatNumber(activityQuery.data.totalActions)} tone="brand" />

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Par action" />
              <CardBody className="p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activityQuery.data.byAction.map((item) => (
                    <li key={item.action} className="flex justify-between px-5 py-2.5 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{item.action}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{item.count}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Par utilisateur" />
              <CardBody className="p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activityQuery.data.byUser.map((item) => (
                    <li key={item.userId} className="flex justify-between px-5 py-2.5 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{item.userName}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{item.count}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Patients                                                          */}
      {/* ---------------------------------------------------------------- */}
      {tab === 'patients' && patientsQuery.data && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Nouveaux patients" value={formatNumber(patientsQuery.data.newPatients)} icon={Users} tone="success" />
            <StatCard label="Total patients" value={formatNumber(patientsQuery.data.totalPatients)} icon={Users} tone="info" />
            <StatCard label="Villes couvertes" value={patientsQuery.data.byCity.length} icon={Users} tone="brand" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Répartition par tranche d’âge" />
              <CardBody>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={patientsQuery.data.byAgeRange}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="range" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip />
                      <Bar dataKey="count" name="Patients" fill="#7c3aed" radius={[4, 4, 0, 0]} barSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Répartition par ville" />
              <CardBody className="p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {patientsQuery.data.byCity.map((item) => (
                    <li key={item.city} className="flex justify-between px-5 py-2.5 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{item.city}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{item.count}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
