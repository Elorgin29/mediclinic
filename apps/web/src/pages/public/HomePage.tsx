/**
 * Page d'accueil publique.
 *
 * Elle présente la clinique, ses spécialités, ses praticiens et les parcours
 * en ligne (rendez-vous, téléconsultation, espace patient). Les données
 * proviennent des routes publiques de l'API : aucune authentification requise.
 */

import { APP_NAME, formatMoney, type DoctorPublic, type Specialty } from '@mediclinic/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  ChevronRight,
  Clock,
  FileText,
  HeartHandshake,
  HeartPulse,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRound,
  Video,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge, Button, Card } from '@/components/ui';
import { HeroStat, SectionHeading } from '@/components/public/PageHero';
import { CLINIC_CONTACT, CLINIC_HIGHLIGHTS, CLINIC_HOURS } from '@/lib/clinic';
import { ARTICLES } from '@/lib/articles';
import { apiGet } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryClient';

const SERVICES = [
  {
    icon: CalendarCheck,
    title: 'Rendez-vous en ligne',
    description: 'Choisissez votre spécialité, votre praticien et votre créneau en moins de deux minutes.',
  },
  {
    icon: Video,
    title: 'Téléconsultation',
    description: 'Consultez à distance par visioconférence sécurisée, avec ordonnance électronique.',
  },
  {
    icon: FileText,
    title: 'Dossier patient',
    description: 'Historique complet, ordonnances et résultats d’analyses centralisés au même endroit.',
  },
  {
    icon: ShieldCheck,
    title: 'Facturation claire',
    description: 'Factures conformes, paiements en ligne et suivi des remboursements en temps réel.',
  },
];

const TRUST_POINTS = [
  { icon: BadgeCheck, label: 'Praticiens diplômés' },
  { icon: ShieldCheck, label: 'Données hébergées en France' },
  { icon: Clock, label: 'Urgences 24h/24' },
  { icon: HeartHandshake, label: 'Parcours 100 % numérique' },
];

const TESTIMONIALS = [
  {
    quote:
      'J’ai pris rendez-vous le matin pour l’après-midi, et j’ai reçu mon ordonnance directement dans mon espace patient. Un gain de temps incroyable.',
    name: 'Camille R.',
    detail: 'Patiente en dermatologie',
  },
  {
    quote:
      'La téléconsultation m’a évité un déplacement pour un simple renouvellement. Le médecin avait tout mon historique sous les yeux.',
    name: 'Marc D.',
    detail: 'Suivi cardiologique',
  },
  {
    quote:
      'Le secrétariat est réactif et l’équipe très humaine. On se sent accompagné du début à la fin du parcours de soin.',
    name: 'Sofia B.',
    detail: 'Suivi de grossesse',
  },
];

const FAQ_TEASER = [
  {
    question: 'Comment prendre rendez-vous ?',
    answer:
      'En ligne depuis la page « Prendre rendez-vous », ou par téléphone auprès du secrétariat. La confirmation est immédiate.',
  },
  {
    question: 'Puis-je consulter à distance ?',
    answer:
      'Oui, la téléconsultation est disponible pour de nombreux motifs : suivi, renouvellement d’ordonnance, interprétation de résultats.',
  },
  {
    question: 'Comment accéder à mes documents ?',
    answer:
      'Créez votre espace patient : ordonnances, résultats et factures y sont centralisés et téléchargeables en PDF.',
  },
];

export default function HomePage(): JSX.Element {
  const doctorsQuery = useQuery({
    queryKey: queryKeys.doctors.public({ limit: 4 }),
    queryFn: () => apiGet<DoctorPublic[]>('/doctors/public?limit=4'),
  });

  const specialtiesQuery = useQuery({
    queryKey: queryKeys.specialties.all,
    queryFn: () => apiGet<Specialty[]>('/specialties/public'),
  });

  const featuredArticles = ARTICLES.slice(0, 3);

  return (
    <div>
      {/* ---------------------------------------------------------------- */}
      {/* Bannière                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="hero-mesh relative overflow-hidden border-b border-slate-200/70 bg-gradient-to-br from-brand-50 via-white to-slate-50 dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="pattern-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div className="public-container relative grid gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
          <div className="animate-fade-up">
            <Badge tone="brand" dot>
              Clinique pluridisciplinaire — Paris 15e
            </Badge>
            <h1 className="mt-5 text-balance text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white">
              Votre santé, <span className="gradient-text">simplement</span>, au même endroit.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
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
                  Téléconsultation
                </Button>
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {CLINIC_HIGHLIGHTS.map((item) => (
                <HeroStat key={item.label} value={item.value} label={item.label} />
              ))}
            </div>
          </div>

          {/* Carte pratique */}
          <div className="relative animate-fade-up animation-delay-200">
            <div
              className="absolute -right-6 -top-6 hidden h-24 w-24 rounded-full bg-brand-200/50 blur-2xl lg:block"
              aria-hidden
            />
            <div className="glass-panel relative overflow-hidden rounded-3xl">
              <div className="bg-gradient-to-r from-brand-700 to-brand-600 px-6 py-5 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-brand-100">
                      Ouvert aujourd’hui
                    </p>
                    <p className="mt-1 text-2xl font-bold">08h00 – 19h00</p>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                    <Clock className="h-5 w-5" aria-hidden />
                  </span>
                </div>
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
                    <a
                      href={`tel:${CLINIC_CONTACT.phone.replace(/\s/g, '')}`}
                      className="text-sm text-slate-500 hover:text-brand-700 dark:text-slate-400"
                    >
                      {CLINIC_CONTACT.phone}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <HeartPulse className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Urgences 24h/24</p>
                    <a
                      href={`tel:${CLINIC_CONTACT.emergencyPhone.replace(/\s/g, '')}`}
                      className="text-sm text-slate-500 hover:text-rose-600 dark:text-slate-400"
                    >
                      {CLINIC_CONTACT.emergencyPhone}
                    </a>
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

                <Link to="/contact" className="block pt-1">
                  <Button variant="secondary" className="w-full" rightIcon={<ChevronRight className="h-4 w-4" />}>
                    Nous contacter
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Bandeau de confiance                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="public-container grid gap-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_POINTS.map((point) => (
            <div key={point.label} className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                <point.icon className="h-4 w-4" aria-hidden />
              </span>
              {point.label}
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Services                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="public-container py-16 sm:py-20">
        <SectionHeading
          eyebrow="Le parcours MediClinic"
          title="Un parcours de soin complet, sans rupture"
          description="De la prise de rendez-vous au suivi post-consultation, chaque étape est pensée pour vous faire gagner du temps."
          actions={
            <Link to="/services">
              <Button variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Découvrir nos services
              </Button>
            </Link>
          }
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((service, index) => (
            <Card
              key={service.title}
              className={`card-hover p-6 ${['animate-fade-up', 'animate-fade-up animation-delay-100', 'animate-fade-up animation-delay-200', 'animate-fade-up animation-delay-300'][index] ?? ''}`}
            >
              <span className="inline-flex rounded-xl bg-brand-50 p-3 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                <service.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">{service.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {service.description}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Spécialités                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900 sm:py-20">
        <div className="public-container">
          <SectionHeading
            eyebrow="Spécialités"
            title="Nos spécialités"
            description="Une prise en charge pluridisciplinaire au sein d’un même établissement, avec des praticiens référents par domaine."
            actions={
              <Link to="/specialites">
                <Button variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Toutes les spécialités
                </Button>
              </Link>
            }
          />

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(specialtiesQuery.data ?? []).slice(0, 9).map((specialty) => (
              <Link
                key={specialty.id}
                to={`/medecins?specialtyId=${specialty.id}`}
                className="group flex items-start gap-3 rounded-2xl border border-slate-200 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-card dark:border-slate-800 dark:hover:border-brand-800 dark:hover:bg-brand-950/30"
              >
                <span className="rounded-lg bg-brand-50 p-2 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                  <Stethoscope className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 group-hover:text-brand-800 dark:text-white">
                    {specialty.name}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                    {specialty.description}
                  </p>
                </div>
                <ArrowRight
                  className="ml-auto mt-1 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600 dark:text-slate-600"
                  aria-hidden
                />
              </Link>
            ))}
            {specialtiesQuery.isLoading &&
              Array.from({ length: 9 }, (_, index) => (
                <div key={index} className="skeleton h-[4.75rem] rounded-2xl" aria-hidden />
              ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Médecins                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="public-container py-16 sm:py-20">
        <SectionHeading
          eyebrow="Nos praticiens"
          title="Des spécialistes à votre écoute"
          description="Des médecins disponibles en présentiel et en téléconsultation, avec leurs tarifs affichés en toute transparence."
          actions={
            <Link to="/medecins">
              <Button variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Annuaire complet
              </Button>
            </Link>
          }
        />

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {(doctorsQuery.data ?? []).map((doctor) => (
            <Card key={doctor.id} className="card-hover flex flex-col p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-sm font-bold text-brand-800 dark:from-brand-900 dark:to-brand-800 dark:text-brand-200">
                  {doctor.first_name.charAt(0)}
                  {doctor.last_name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    Dr {doctor.first_name} {doctor.last_name}
                  </h3>
                  <p className="truncate text-xs font-medium text-brand-700 dark:text-brand-400">
                    {doctor.specialty_name}
                  </p>
                </div>
              </div>
              <p className="mt-3 line-clamp-3 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {doctor.bio}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
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
      {/* Témoignages                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900 sm:py-20">
        <div className="public-container">
          <SectionHeading
            align="center"
            eyebrow="Ils nous font confiance"
            title="La parole à nos patients"
            description="Plus de 12 000 patients suivis chaque année, et une note moyenne de satisfaction de 4,8/5."
          />

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {TESTIMONIALS.map((testimonial) => (
              <Card key={testimonial.name} className="flex h-full flex-col p-6">
                <div className="flex gap-0.5 text-amber-400" aria-label="5 étoiles sur 5">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Sparkles key={index} className="h-4 w-4 fill-current" aria-hidden />
                  ))}
                </div>
                <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  « {testimonial.quote} »
                </blockquote>
                <footer className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{testimonial.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{testimonial.detail}</p>
                </footer>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Actualités                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section className="public-container py-16 sm:py-20">
        <SectionHeading
          eyebrow="Actualités & conseils"
          title="La santé, expliquée simplement"
          description="Conseils pratiques et prévention, rédigés par nos praticiens."
          actions={
            <Link to="/actualites">
              <Button variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Toutes les actualités
              </Button>
            </Link>
          }
        />

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {featuredArticles.map((article) => (
            <Link key={article.slug} to={`/actualites/${article.slug}`} className="group">
              <Card className="card-hover flex h-full flex-col p-6">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="neutral">{article.category}</Badge>
                  <span className="text-[11px] text-slate-400">{article.readTime} min</span>
                </div>
                <h3 className="mt-3 text-base font-semibold leading-snug text-slate-900 group-hover:text-brand-800 dark:text-white">
                  {article.title}
                </h3>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {article.excerpt}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-400">
                  Lire l’article
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* FAQ express                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-t border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900 sm:py-20">
        <div className="public-container grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="section-eyebrow">Questions fréquentes</p>
            <h2 className="section-heading">Vous vous demandez peut-être…</h2>
            <p className="section-lead">
              Retrouvez les réponses aux questions les plus courantes sur les rendez-vous, la
              téléconsultation et votre dossier patient.
            </p>
            <Link to="/faq" className="mt-6 inline-block">
              <Button variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Consulter la FAQ complète
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {FAQ_TEASER.map((entry) => (
              <div
                key={entry.question}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/40"
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{entry.question}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {entry.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Appel à l'action                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-brand-800 dark:bg-brand-950">
        <div className="pattern-grid pointer-events-none absolute inset-0 opacity-20" aria-hidden />
        <div className="public-container relative flex flex-col items-center gap-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-brand-100">
            <UserRound className="h-7 w-7" aria-hidden />
          </span>
          <h2 className="max-w-2xl text-balance text-3xl font-bold text-white sm:text-4xl">
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
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Inscription gratuite, données hébergées en France
          </p>
        </div>
      </section>
    </div>
  );
}
