/**
 * Page « À propos » : histoire, valeurs, chiffres clés et engagement de la
 * clinique. Page vitrine entièrement statique.
 */

import {
  ArrowRight,
  Award,
  CalendarCheck,
  HeartHandshake,
  HeartPulse,
  Microscope,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Card } from '@/components/ui';
import { HeroStat, PageHero, SectionHeading } from '@/components/public/PageHero';
import { CLINIC_HIGHLIGHTS } from '@/lib/clinic';

const VALUES = [
  {
    icon: HeartHandshake,
    title: 'Une médecine humaine',
    description:
      'Chaque patient est accompagné par un référent identifié, du premier rendez-vous au suivi post-consultation.',
  },
  {
    icon: ShieldCheck,
    title: 'Sécurité et confidentialité',
    description:
      'Dossier patient chiffré, accès strictement encadré par les permissions et journalisation de chaque action.',
  },
  {
    icon: Microscope,
    title: 'Excellence médicale',
    description:
      'Des praticiens spécialisés, un plateau technique moderne et des protocoles validés par la communauté médicale.',
  },
  {
    icon: Sparkles,
    title: 'Innovation continue',
    description:
      'Téléconsultation, ordonnance électronique et résultats d’analyses accessibles en ligne, 24h/24.',
  },
];

const MILESTONES = [
  { year: '2012', title: 'Ouverture de la clinique', description: 'Trois spécialités et une équipe de huit praticiens.' },
  { year: '2016', title: 'Plateau d’imagerie', description: 'Radiologie, échographie et mammographie sur site.' },
  { year: '2020', title: 'Téléconsultation', description: 'Déploiement de la visioconférence sécurisée pour tous les patients.' },
  { year: '2024', title: 'Dossier 100 % numérique', description: 'Ordonnances, résultats et factures accessibles en ligne.' },
  { year: '2026', title: 'Espace patient rénové', description: 'Un parcours digital repensé, plus simple et plus rapide.' },
];

export default function AboutPage(): JSX.Element {
  return (
    <div>
      <PageHero
        eyebrow="La clinique"
        title={
          <>
            Une clinique à taille humaine, <span className="gradient-text">tournée vers l’avenir</span>
          </>
        }
        description="Depuis 2012, MediClinic réunit des praticiens de toutes spécialités autour d’une même exigence : offrir des soins accessibles, coordonnés et humains."
        breadcrumb={[{ label: 'À propos' }]}
        actions={
          <>
            <Link to="/rendez-vous">
              <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                Prendre rendez-vous
              </Button>
            </Link>
            <Link to="/contact">
              <Button size="lg" variant="secondary">
                Nous contacter
              </Button>
            </Link>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-4">
          {CLINIC_HIGHLIGHTS.map((item) => (
            <HeroStat key={item.label} value={item.value} label={item.label} />
          ))}
        </div>
      </PageHero>

      {/* Histoire */}
      <section className="public-container py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="section-eyebrow">Notre histoire</p>
            <h2 className="section-heading">Quinze ans au service de la santé</h2>
            <div className="prose-clinic mt-5">
              <p>
                Née de la rencontre entre médecins libéraux et ingénieurs, MediClinic a été pensée dès
                l’origine comme un lieu où la qualité du soin et la fluidité du parcours vont de pair.
              </p>
              <p>
                Aujourd’hui, la clinique accueille plus de 12 000 patients par an, répartis sur huit
                départements et dix spécialités. Notre équipe administrative et soignante partage un même
                objectif : réduire les délais, éviter les ruptures de suivi et redonner du temps à la
                relation médecin-patient.
              </p>
              <p>
                Le site que vous consultez est le prolongement numérique de cette démarche : il permet de
                préparer sa venue, de suivre ses résultats et d’échanger avec son praticien en toute
                sécurité.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {VALUES.map((value, index) => (
              <Card
                key={value.title}
                className={`p-5 animate-fade-up ${index % 2 === 1 ? 'sm:translate-y-6' : ''}`}
              >
                <span className="inline-flex rounded-xl bg-brand-50 p-2.5 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                  <value.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{value.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {value.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Chiffres */}
      <section className="border-y border-slate-200 bg-white py-14 dark:border-slate-800 dark:bg-slate-900">
        <div className="public-container grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Users, value: '12 000+', label: 'Patients suivis chaque année' },
            { icon: Award, value: '8', label: 'Départements spécialisés' },
            { icon: CalendarCheck, value: '98 %', label: 'Rendez-vous honorés' },
            { icon: HeartPulse, value: '24h/24', label: 'Accueil des urgences' },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-4">
              <span className="rounded-xl bg-brand-50 p-3 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                <item.icon className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{item.value}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Chronologie */}
      <section className="public-container py-16 sm:py-20">
        <SectionHeading
          eyebrow="Notre parcours"
          title="Les étapes qui nous ont construits"
          description="Une croissance progressive, toujours guidée par la qualité de la prise en charge."
        />

        <ol className="mt-10 grid gap-5 md:grid-cols-5">
          {MILESTONES.map((milestone) => (
            <li key={milestone.year} className="relative">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">
                  {milestone.year.slice(-2)}
                </span>
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" aria-hidden />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">
                {milestone.year}
              </p>
              <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{milestone.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {milestone.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* CTA */}
      <section className="public-container pb-16 sm:pb-20">
        <div className="hero-mesh overflow-hidden rounded-3xl border border-brand-100 bg-white p-8 shadow-soft sm:p-12 dark:border-brand-900 dark:bg-slate-900">
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <p className="section-eyebrow">Prendre soin de vous</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
                Une question, un besoin de consultation ?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Notre secrétariat vous répond du lundi au vendredi de 8h à 19h et le samedi matin.
                Pour les urgences, l’accueil est ouvert 24h/24.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/rendez-vous">
                <Button size="lg">Réserver un créneau</Button>
              </Link>
              <Link to="/contact">
                <Button size="lg" variant="secondary">
                  Contacter la clinique
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
