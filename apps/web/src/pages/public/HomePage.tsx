/**
 * Page d'accueil publique.
 *
 * Elle présente la clinique, ses spécialités, ses praticiens et les parcours
 * en ligne (rendez-vous, téléconsultation, espace patient). Les données
 * proviennent des routes publiques de l'API : aucune authentification requise.
 */

import { APP_NAME, formatMoney } from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarCheck,
  Clock,
  FileText,
  HeartPulse,
  MapPin,
  Phone,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Video,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge, Button, Card } from '@/components/ui';
import { CLINIC_CONTACT, CLINIC_HIGHLIGHTS, CLINIC_HOURS } from '@/lib/clinic';
import { apiGet } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';
import type { DoctorPublic, Specialty } from '@mediclinic/shared';

const SERVICES = [
  {
    icon: CalendarCheck,
    title: 'Prise de rendez-vous en ligne',
    description: 'Choisissez votre spécialité, votre praticien et votre créneau en moins de deux minutes.',
  },
  {
    icon: Video,
    title: 'Téléconsultation',
    description: 'Consultez à distance par visioconférence, avec ordonnance électronique.',
  },
  {
    icon: FileText,
    title: 'Dossier patient informatisé',
    description: 'Historique complet, ordonnances et résultats d’analyses centralisés.',
  },
  {
    icon: ShieldCheck,
    title: 'Facturation transparente',
    description: 'Factures conformes, paiements en ligne et suivi des remboursements.',
  },
];

export default function HomePage(): JSX.Element {
  const doctorsQuery = useQuery({
    queryKey: queryKeys.doctors.public({ limit: 4 }),
    queryFn: () => apiGet<DoctorPublic[]>('/doctors/public?limit=4'),
  });

  const specialtiesQuery = useQuery({
    queryKey: queryKeys.specialties.all,
    queryFn: () => apiGet<Specialty[]>('/specialties'),
  });

  return (
    <div>
      {/* ---------------------------------------------------------------- */}
      {/* Bannière                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-b border-slate-200 bg-gradient-to-br from-brand-50 via-white to-slate-50 dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-24">
          <div>
            <Badge tone="brand" dot>
              Clinique pluridisciplinaire — Paris 15e
            </Badge>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
              Votre santé, <span className="text-brand-700 dark:text-brand-400">simplement</span>.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600 dark:text-slate-300">
              {APP_NAME} réunit {CLINIC_HIGHLIGHTS[1]?.value} spécialités et{' '}
              {CLINIC_HIGHLIGHTS[0]?.value} praticiens dans un parcours entièrement numérique : prise de
              rendez-vous en ligne, téléconsultation, dossier médical et facturation.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/rendez-vous">
                <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Prendre rendez-vous
                </Button>
              </Link>
              <Link to="/teleconsultation">
                <Button size="lg" variant="secondary" leftIcon={<Video className="h-4 w-4" />}>
                  Demander une téléconsultation
                </Button>
              </Link>
            </div>

            <dl className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
              {CLINIC_HIGHLIGHTS.map((item) => (
                <div key={item.label}>
                  <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-2xl font-bold text-brand-700 dark:text-brand-400">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="card overflow-hidden p-0">
              <div className="bg-brand-700 px-6 py-5 text-white">
                <p className="text-sm font-medium opacity-90">Ouverture aujourd’hui</p>
                <p className="text-2xl font-bold">08h00 – 19h00</p>
              </div>
              <div className="space-y-4 p-6">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-700 dark:text-brand-400" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Adresse</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{CLINIC_CONTACT.address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-5 w-5 shrink-0 text-brand-700 dark:text-brand-400" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Standard</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{CLINIC_CONTACT.phone}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <HeartPulse className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Urgences</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      24h/24 — {CLINIC_CONTACT.emergencyPhone}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Horaires
                  </p>
                  <ul className="space-y-1 text-sm">
                    {CLINIC_HOURS.map((slot) => (
                      <li key={slot.days} className="flex justify-between gap-3">
                        <span className="text-slate-600 dark:text-slate-300">{slot.days}</span>
                        <span className="font-medium text-slate-900 dark:text-white">{slot.hours}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Services                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Un parcours de soin complet
          </h2>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            De la prise de rendez-vous au suivi post-consultation, chaque étape est digitale et sécurisée.
          </p>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((service) => (
            <Card key={service.title} className="p-5">
              <span className="inline-flex rounded-lg bg-brand-50 p-2.5 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                <service.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{service.title}</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{service.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Spécialités                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Nos spécialités
              </h2>
              <p className="mt-2 text-slate-600 dark:text-slate-300">
                Une prise en charge pluridisciplinaire au sein d’un même établissement.
              </p>
            </div>
            <Link to="/specialites" className="link text-sm">
              Voir toutes les spécialités →
            </Link>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(specialtiesQuery.data ?? []).slice(0, 9).map((specialty) => (
              <Link
                key={specialty.id}
                to={`/medecins?specialtyId=${specialty.id}`}
                className="group flex items-start gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-slate-800 dark:hover:border-brand-800 dark:hover:bg-brand-950/30"
              >
                <Stethoscope
                  className="mt-0.5 h-5 w-5 shrink-0 text-brand-700 dark:text-brand-400"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900 group-hover:text-brand-800 dark:text-white">
                    {specialty.name}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                    {specialty.description}
                  </p>
                </div>
              </Link>
            ))}
            {specialtiesQuery.isLoading &&
              Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="skeleton h-20 rounded-xl" aria-hidden />
              ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Médecins                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Nos praticiens</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-300">
              Des médecins spécialistes, disponibles en présentiel et en téléconsultation.
            </p>
          </div>
          <Link to="/medecins" className="link text-sm">
            Voir l’annuaire complet →
          </Link>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {(doctorsQuery.data ?? []).map((doctor) => (
            <Card key={doctor.id} className="flex flex-col p-5">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                {doctor.first_name.charAt(0)}
                {doctor.last_name.charAt(0)}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                Dr {doctor.first_name} {doctor.last_name}
              </h3>
              <p className="text-xs font-medium text-brand-700 dark:text-brand-400">{doctor.specialty_name}</p>
              <p className="mt-2 line-clamp-3 flex-1 text-xs text-slate-500 dark:text-slate-400">
                {doctor.bio}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {formatMoney(doctor.consultation_fee)}
                </span>
                <Link to={`/rendez-vous?doctorId=${doctor.id}`}>
                  <Button size="sm" variant="outline">
                    Réserver
                  </Button>
                </Link>
              </div>
            </Card>
          ))}

          {doctorsQuery.isLoading &&
            Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="card h-56 p-5">
                <div className="skeleton h-12 w-12 rounded-full" aria-hidden />
                <div className="skeleton mt-3 h-4 w-32" aria-hidden />
                <div className="skeleton mt-2 h-3 w-24" aria-hidden />
              </div>
            ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Appel à l'action                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-brand-700 dark:bg-brand-900">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-14 text-center sm:px-6 lg:px-8">
          <UserRound className="h-10 w-10 text-brand-200" aria-hidden />
          <h2 className="max-w-2xl text-2xl font-bold text-white sm:text-3xl">
            Créez votre espace patient et gérez votre santé en ligne
          </h2>
          <p className="max-w-xl text-brand-100">
            Rendez-vous, ordonnances, résultats d’analyses et factures : tout est accessible en un clic,
            à tout moment.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/inscription">
              <Button size="lg" className="bg-white text-brand-800 hover:bg-brand-50">
                Créer mon espace
              </Button>
            </Link>
            <Link to="/connexion">
              <Button size="lg" variant="ghost" className="text-white hover:bg-brand-800">
                J’ai déjà un compte
              </Button>
            </Link>
          </div>
          <p className="flex items-center gap-2 text-xs text-brand-200">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Inscription gratuite, sans engagement
          </p>
        </div>
      </section>
    </div>
  );
}
