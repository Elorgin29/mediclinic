/**
 * Tableau de bord du back-office.
 *
 * Six indicateurs clés, cinq graphiques Recharts et le fil d'activité récente.
 * Les données proviennent d'un seul appel (`GET /api/dashboard/stats`), ce qui
 * évite une cascade de requêtes au chargement de la page d'accueil.
 */

import {
  APPOINTMENT_STATUS_LABELS_FR,
  formatMoney,
  type ActivityEntry,
  type DashboardPayload,
} from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  Pill,
  TrendingUp,
  Users,
  Video,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button, Card, CardBody, CardHeader, CardsSkeleton, EmptyState, ErrorState, StatCard } from '@/components/ui';
import { apiGet, getApiErrorMessage } from '@/lib/apiClient';
import { formatNumber } from '@/lib/utils';
import { queryKeys } from '@/lib/queryClient';
import { DOCTOR_COLORS, cn } from '@/lib/utils';

/** Palette des graphiques circulaires. */
const PIE_COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#0891b2', '#4d7c0f'];

/** Libellé court d'un mois `AAAA-MM` → `MM/AA`. */
function shortMonth(period: string): string {
  const [, month] = period.split('-');
  return month ?? period;
}

/** Info-bulle commune aux graphiques. */
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
}): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800">
      {label !== undefined && <p className="mb-1 font-semibold text-slate-900 dark:text-white">{label}</p>}
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color ?? PIE_COLORS[index % PIE_COLORS.length] }}
            aria-hidden
          />
          {entry.name} : <span className="font-medium text-slate-900 dark:text-white">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function DashboardPage(): JSX.Element {
  const query = useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: () => apiGet<DashboardPayload>('/dashboard/stats'),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title">Tableau de bord</h1>
          <p className="page-subtitle">Chargement des indicateurs…</p>
        </div>
        <CardsSkeleton count={6} />
        <div className="card h-80 p-5">
          <div className="skeleton h-4 w-40" aria-hidden />
          <div className="skeleton mt-4 h-56 w-full" aria-hidden />
        </div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">Tableau de bord</h1>
        <Card>
          <ErrorState message={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        </Card>
      </div>
    );
  }

  const { stats, charts } = query.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Tableau de bord</h1>
          <p className="page-subtitle">
            Vue d’ensemble de l’activité de la clinique — {formatNumber(stats.patientsTotal)} patients suivis.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/rendez-vous">
            <Button variant="secondary" size="sm" leftIcon={<CalendarDays className="h-4 w-4" />}>
              Agenda
            </Button>
          </Link>
          <Link to="/admin/rapports">
            <Button size="sm" leftIcon={<TrendingUp className="h-4 w-4" />}>
              Rapports
            </Button>
          </Link>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Indicateurs                                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Rendez-vous aujourd’hui"
          value={formatNumber(stats.appointmentsToday)}
          hint={`${formatNumber(stats.appointmentsWeek)} cette semaine`}
          icon={CalendarCheck}
          tone="brand"
        />
        <StatCard
          label="Chiffre d’affaires du mois"
          value={formatMoney(stats.revenueMonth)}
          trend={stats.revenueChangePercent}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Patients"
          value={formatNumber(stats.patientsTotal)}
          hint={`${formatNumber(stats.doctorsTotal)} médecins`}
          icon={Users}
          tone="info"
        />
        <StatCard
          label="Téléconsultations en attente"
          value={formatNumber(stats.pendingMeetings)}
          hint="à valider par l’administration"
          icon={Video}
          tone={stats.pendingMeetings > 0 ? 'warning' : 'brand'}
        />
        <StatCard
          label="Alertes de stock"
          value={formatNumber(stats.lowStockCount)}
          hint="références sous le seuil"
          icon={AlertTriangle}
          tone={stats.lowStockCount > 0 ? 'danger' : 'brand'}
        />
        <StatCard
          label="Gardes en cours"
          value={formatNumber(stats.shiftsInProgress)}
          hint={`${formatNumber(stats.appointmentsMonth)} rendez-vous ce mois`}
          icon={Activity}
          tone="info"
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Chiffre d'affaires                                                */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Chiffre d’affaires encaissé"
          description="12 derniers mois, d’après les paiements enregistrés"
          actions={
            <Link to="/admin/rapports">
              <Button variant="ghost" size="sm">
                Détail
              </Button>
            </Link>
          }
        />
        <CardBody>
          {charts.revenueByMonth.length === 0 ? (
            <EmptyState title="Aucun encaissement enregistré" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.revenueByMonth} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f766e" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={shortMonth}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    formatter={(value: number) => formatMoney(value)}
                    labelFormatter={(label: string) => label}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="CA encaissé"
                    stroke="#0f766e"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Deux graphiques côte à côte                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Rendez-vous par département" description="Répartition sur l’ensemble de l’activité" />
          <CardBody>
            {charts.appointmentsByDepartment.length === 0 ? (
              <EmptyState title="Aucun rendez-vous" />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={charts.appointmentsByDepartment}
                    layout="vertical"
                    margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="department"
                      width={110}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Rendez-vous" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Consultations par médecin" description="Top 10 des praticiens" />
          <CardBody>
            {charts.consultationsByDoctor.length === 0 ? (
              <EmptyState title="Aucune consultation" />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.consultationsByDoctor} margin={{ top: 4, right: 8, bottom: 32, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="doctor"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      angle={-30}
                      textAnchor="end"
                      height={56}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Consultations" radius={[4, 4, 0, 0]} barSize={22}>
                      {charts.consultationsByDoctor.map((_, index) => (
                        <Cell key={index} fill={DOCTOR_COLORS[index % DOCTOR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Médicaments et activité                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Médicaments les plus dispensés" />
          <CardBody>
            {charts.topMedications.length === 0 ? (
              <EmptyState title="Aucune dispensation" />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={charts.topMedications}
                      dataKey="dispensed"
                      nameKey="medication"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {charts.topMedications.map((_, index) => (
                        <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      height={48}
                      iconSize={8}
                      formatter={(value: string) => (
                        <span className="text-[11px] text-slate-600 dark:text-slate-300">
                          {value.length > 18 ? `${value.slice(0, 17)}…` : value}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader
            title="Alertes de stock"
            description="Références sous le seuil"
            actions={
              <Link to="/admin/stock">
                <Button variant="ghost" size="sm">
                  Gérer
                </Button>
              </Link>
            }
          />
          <CardBody className="p-0">
            {charts.lowStock.length === 0 ? (
              <EmptyState title="Aucune alerte" description="Tous les stocks sont au-dessus du seuil." />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {charts.lowStock.map((medication) => (
                  <li key={medication.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Pill className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                      <span className="truncate text-sm text-slate-700 dark:text-slate-200">
                        {medication.name}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                        medication.stock_quantity === 0
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                      )}
                    >
                      {medication.stock_quantity} / {medication.alert_threshold}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader
            title="Activité récente"
            description="Dernières actions journalisées"
            actions={
              <Link to="/admin/audit">
                <Button variant="ghost" size="sm">
                  Journal
                </Button>
              </Link>
            }
          />
          <CardBody className="p-0">
            {charts.recentActivity.length === 0 ? (
              <EmptyState title="Aucune activité" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {charts.recentActivity.slice(0, 8).map((entry: ActivityEntry) => (
                  <li key={entry.id} className="px-5 py-2.5">
                    <p className="truncate text-xs text-slate-700 dark:text-slate-200">
                      <span className="font-medium">{entry.user_name ?? 'Système'}</span>{' '}
                      <span className="text-slate-500 dark:text-slate-400">
                        {entry.action.toLowerCase()} · {entry.resource}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400">{entry.created_at}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Raccourcis                                                        */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader title="Accès rapides" />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { to: '/admin/patients', label: 'Nouveau patient', icon: Users },
              { to: '/admin/rendez-vous', label: 'Planifier un rendez-vous', icon: CalendarCheck },
              { to: '/admin/factures', label: 'Émettre une facture', icon: TrendingUp },
              { to: '/admin/teleconsultations', label: 'Valider une téléconsultation', icon: Video },
            ].map((shortcut) => (
              <Link
                key={shortcut.to}
                to={shortcut.to}
                className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-800 dark:text-slate-200 dark:hover:border-brand-800 dark:hover:bg-brand-950/30"
              >
                <shortcut.icon className="h-4 w-4 text-brand-700 dark:text-brand-400" aria-hidden />
                {shortcut.label}
              </Link>
            ))}
          </div>
        </CardBody>
      </Card>

      <p className="text-center text-xs text-slate-400">
        Statuts de rendez-vous suivis : {Object.values(APPOINTMENT_STATUS_LABELS_FR).join(' · ')}
      </p>
    </div>
  );
}
