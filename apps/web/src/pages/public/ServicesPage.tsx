/**
 * Page « Services » : présentation des départements, des parcours de soin et
 * des équipements de la clinique. Les départements proviennent de l'API
 * publique protégée par session ? Non : la route `/departments` exige un jeton.
 * On s'appuie donc sur les spécialités publiques et un contenu éditorial.
 */

import { formatMoney, type DoctorPublic, type Specialty } from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  Baby,
  Bone,
  Brain,
  CalendarCheck,
  ClipboardList,
  Eye,
  FlaskConical,
  HeartPulse,
  Microscope,
  Pill,
  ScanLine,
  Stethoscope,
  Syringe,
  Video,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { PageHero, SectionHeading } from '@/components/public/PageHero';
import { useI18n } from '@/i18n/I18nContext';
import { apiGet, getApiErrorMessage } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';

const CARE_PATH = [
  {
    icon: CalendarCheck,
    title: '1. Prise de rendez-vous',
    description: 'En ligne 24h/24 ou par téléphone. Confirmation immédiate et rappel automatique.',
  },
  {
    icon: Stethoscope,
    title: '2. Consultation',
    description: 'Sur place ou en visioconférence, avec un praticien spécialisé de votre choix.',
  },
  {
    icon: ClipboardList,
    title: '3. Suivi personnalisé',
    description: 'Ordonnance électronique, résultats d’analyses et compte-rendu dans votre espace.',
  },
  {
    icon: HeartPulse,
    title: '4. Après-consultation',
    description: 'Messagerie sécurisée, renouvellement et orientation vers les spécialistes adaptés.',
  },
];

const FACILITIES = [
  { icon: ScanLine, title: 'Imagerie médicale', description: 'Radiologie, échographie, mammographie et scanner.' },
  { icon: FlaskConical, title: 'Laboratoire', description: 'Analyses sanguines et prélèvements sur place, résultats en ligne.' },
  { icon: Syringe, title: 'Vaccinations', description: 'Vaccins adultes et pédiatriques, rappels et voyages.' },
  { icon: Activity, title: 'Explorations', description: 'ECG, épreuves fonctionnelles et bilans cardiologiques.' },
  { icon: Pill, title: 'Pharmacie', description: 'Dispensation sécurisée et conseils pharmaceutiques.' },
  { icon: Microscope, title: 'Anatomopathologie', description: 'Prélèvements et analyses spécialisées en partenariat.' },
];

/** Icône associée au nom d'une spécialité (repli : stéthoscope). */
function specialtyIcon(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes('cardio')) return HeartPulse;
  if (normalized.includes('pédiat') || normalized.includes('pediat')) return Baby;
  if (normalized.includes('gynéco') || normalized.includes('gyneco')) return Baby;
  if (normalized.includes('ophtal')) return Eye;
  if (normalized.includes('neuro')) return Brain;
  if (normalized.includes('ortho') || normalized.includes('rhumato')) return Bone;
  if (normalized.includes('dermato')) return Activity;
  return Stethoscope;
}

export default function ServicesPage(): JSX.Element {
  const { t } = useI18n();
  const specialtiesQuery = useQuery({
    queryKey: queryKeys.specialties.all,
    queryFn: () => apiGet<Specialty[]>('/specialties/public'),
  });

  const doctorsQuery = useQuery({
    queryKey: queryKeys.doctors.public({ limit: 100 }),
    queryFn: () => apiGet<DoctorPublic[]>('/doctors/public?limit=100'),
  });

  const doctorsBySpecialty = (doctorsQuery.data ?? []).reduce<Record<string, number>>((accumulator, doctor) => {
    accumulator[doctor.specialty_name] = (accumulator[doctor.specialty_name] ?? 0) + 1;
    return accumulator;
  }, {});

  return (
    <div>
      <PageHero
        eyebrow="Nos services"
        title={
          <>
            Un plateau technique complet, <span className="gradient-text">sous un même toit</span>
          </>
        }
        description="De la consultation de proximité aux examens spécialisés, la clinique regroupe les compétences et les équipements nécessaires à un parcours de soin fluide."
        breadcrumb={[{ label: 'Services' }]}
        actions={
          <>
            <Link to="/rendez-vous">
              <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Prendre rendez-vous
              </Button>
            </Link>
            <Link to="/teleconsultation">
              <Button size="lg" variant="secondary" leftIcon={<Video className="h-4 w-4" />}>
                Téléconsultation
              </Button>
            </Link>
          </>
        }
      />

      {/* Parcours */}
      <section className="public-container py-16 sm:py-20">
        <SectionHeading
          eyebrow="Le parcours patient"
          title="Quatre étapes, zéro rupture"
          description="Chaque étape est pensée pour vous faire gagner du temps, sans jamais perdre le lien avec votre praticien."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CARE_PATH.map((step, index) => (
            <Card
              key={step.title}
              className={`relative p-6 animate-fade-up ${['', 'animation-delay-100', 'animation-delay-200', 'animation-delay-300'][index] ?? ''}`}
            >
              <span className="absolute right-5 top-5 text-4xl font-black text-slate-100 dark:text-slate-800" aria-hidden>
                {index + 1}
              </span>
              <span className="inline-flex rounded-xl bg-brand-50 p-3 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                <step.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">{step.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {step.description}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Spécialités */}
      <section className="border-y border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900 sm:py-20">
        <div className="public-container">
          <SectionHeading
            eyebrow="Spécialités"
            title="Les expertises de la clinique"
            description="Chaque spécialité dispose d’un ou plusieurs praticiens et de créneaux dédiés."
            actions={
              <Link to="/medecins">
                <Button variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Voir les médecins
                </Button>
              </Link>
            }
          />

          <div className="mt-10">
            {specialtiesQuery.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 9 }, (_, index) => (
                  <Card key={index} className="p-5">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <Skeleton className="mt-3 h-4 w-36" />
                    <Skeleton className="mt-2 h-3 w-full" />
                  </Card>
                ))}
              </div>
            ) : specialtiesQuery.isError ? (
              <ErrorState
                message={getApiErrorMessage(specialtiesQuery.error)}
                onRetry={() => void specialtiesQuery.refetch()}
              />
            ) : (specialtiesQuery.data ?? []).length === 0 ? (
              <Card>
                <EmptyState icon={Stethoscope} title="Aucune spécialité enregistrée" />
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(specialtiesQuery.data ?? []).map((specialty) => {
                  const Icon = specialtyIcon(specialty.name);
                  const doctorCount = doctorsBySpecialty[specialty.name] ?? 0;
                  return (
                    <Link key={specialty.id} to={`/medecins?specialtyId=${specialty.id}`} className="group">
                      <Card className="card-hover h-full p-5">
                        <div className="flex items-start justify-between gap-3">
                          <span className="inline-flex rounded-xl bg-brand-50 p-2.5 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                            <Icon className="h-5 w-5" aria-hidden />
                          </span>
                          {doctorCount > 0 && (
                            <Badge tone="neutral">{doctorCount} praticien(s)</Badge>
                          )}
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-slate-900 group-hover:text-brand-800 dark:text-white">
                          {t(`specialty.${specialty.id}.name`, specialty.name)}
                        </h3>
                        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                          {t(`specialty.${specialty.id}.description`, specialty.description ?? 'Prise en charge spécialisée par un praticien de la clinique.')}
                        </p>
                        <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-400">
                          Découvrir les praticiens
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </p>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Plateau technique */}
      <section className="public-container py-16 sm:py-20">
        <SectionHeading
          eyebrow="Plateau technique"
          title="Des équipements au service du diagnostic"
          description="Les examens complémentaires sont réalisés sur place, ce qui limite les déplacements et accélère la prise en charge."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FACILITIES.map((facility) => (
            <div
              key={facility.title}
              className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-800"
            >
              <span className="rounded-xl bg-slate-100 p-2.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <facility.icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{facility.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {facility.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tarifs indicatifs */}
      <section className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900">
        <div className="public-container">
          <SectionHeading
            eyebrow="Transparence"
            title="Tarifs indicatifs"
            description="Les tarifs sont affichés à titre indicatif. Le remboursement dépend de votre mutuelle et de la convention appliquée."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {(doctorsQuery.data ?? []).slice(0, 3).map((doctor) => (
              <Card key={doctor.id} className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">
                  {doctor.specialty_name}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                  Dr {doctor.first_name} {doctor.last_name}
                </p>
                <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
                  {formatMoney(doctor.consultation_fee)}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Consultation au cabinet</p>
                <Link to={`/rendez-vous?doctorId=${doctor.id}`} className="mt-4 block">
                  <Button size="sm" variant="secondary" className="w-full">
                    Réserver
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
