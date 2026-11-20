/**
 * Page « Contact » : coordonnées, horaires, formulaire de message et accès.
 * Le formulaire est traité côté client (projet académique) et affiche une
 * confirmation ; il pourra être branché sur une route dédiée sans changer l'UI.
 */

import {
  ArrowUpRight,
  Clock,
  HeartPulse,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button, Card, Input, Select, Textarea } from '@/components/ui';
import { PageHero } from '@/components/public/PageHero';
import { CLINIC_CONTACT, CLINIC_HOURS } from '@/lib/clinic';

const SUBJECTS = [
  { value: 'rendez-vous', label: 'Prise de rendez-vous' },
  { value: 'teleconsultation', label: 'Téléconsultation' },
  { value: 'facturation', label: 'Facturation / remboursement' },
  { value: 'dossier', label: 'Accès à mon dossier' },
  { value: 'autre', label: 'Autre demande' },
];

export default function ContactPage(): JSX.Element {
  const [values, setValues] = useState({
    name: '',
    email: '',
    phone: '',
    subject: 'rendez-vous',
    message: '',
  });
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!values.name.trim() || !values.email.trim() || values.message.trim().length < 10) {
      toast.error('Merci de renseigner votre nom, votre email et un message d’au moins 10 caractères.');
      return;
    }
    setIsSent(true);
    toast.success('Message envoyé. Notre secrétariat vous répond sous 24h ouvrées.');
  };

  return (
    <div>
      <PageHero
        eyebrow="Nous contacter"
        title={
          <>
            Une équipe à votre écoute, <span className="gradient-text">du lundi au samedi</span>
          </>
        }
        description="Une question sur un rendez-vous, une facture ou votre dossier médical ? Écrivez-nous ou appelez directement le secrétariat."
        breadcrumb={[{ label: 'Contact' }]}
      />

      <section className="public-container py-14 sm:py-20">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: MapPin,
              title: 'Adresse',
              value: CLINIC_CONTACT.address,
              href: `https://maps.google.com/?q=${encodeURIComponent(CLINIC_CONTACT.address)}`,
              linkLabel: 'Ouvrir dans Maps',
            },
            {
              icon: Phone,
              title: 'Standard',
              value: CLINIC_CONTACT.phone,
              href: `tel:${CLINIC_CONTACT.phone.replace(/\s/g, '')}`,
              linkLabel: 'Appeler',
            },
            {
              icon: Mail,
              title: 'Email',
              value: CLINIC_CONTACT.email,
              href: `mailto:${CLINIC_CONTACT.email}`,
              linkLabel: 'Écrire',
            },
            {
              icon: HeartPulse,
              title: 'Urgences 24h/24',
              value: CLINIC_CONTACT.emergencyPhone,
              href: `tel:${CLINIC_CONTACT.emergencyPhone.replace(/\s/g, '')}`,
              linkLabel: 'Appeler les urgences',
            },
          ].map((item) => (
            <Card key={item.title} className="card-hover p-5">
              <span className="inline-flex rounded-xl bg-brand-50 p-2.5 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                <item.icon className="h-5 w-5" aria-hidden />
              </span>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {item.title}
              </p>
              <p className="mt-1 text-sm font-medium leading-relaxed text-slate-900 dark:text-white">
                {item.value}
              </p>
              <a
                href={item.href}
                target={item.href.startsWith('http') ? '_blank' : undefined}
                rel={item.href.startsWith('http') ? 'noreferrer' : undefined}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-400"
              >
                {item.linkLabel}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </a>
            </Card>
          ))}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Formulaire */}
          <Card className="p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-brand-50 p-2.5 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                <MessageSquare className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Envoyer un message</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Réponse sous 24h ouvrées. Pour une urgence médicale, appelez le{' '}
                  <a href={`tel:${CLINIC_CONTACT.emergencyPhone.replace(/\s/g, '')}`} className="link">
                    {CLINIC_CONTACT.emergencyPhone}
                  </a>
                  .
                </p>
              </div>
            </div>

            {isSent ? (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/60">
                <ShieldCheck className="mx-auto h-10 w-10 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <h3 className="mt-3 text-base font-semibold text-emerald-900 dark:text-emerald-200">
                  Message bien reçu
                </h3>
                <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
                  Merci {values.name.split(' ')[0]}. Notre secrétariat vous répondra à l’adresse{' '}
                  <span className="font-medium">{values.email}</span>.
                </p>
                <Button
                  className="mt-5"
                  variant="secondary"
                  onClick={() => {
                    setIsSent(false);
                    setValues({ name: '', email: '', phone: '', subject: 'rendez-vous', message: '' });
                  }}
                >
                  Envoyer un autre message
                </Button>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Nom complet"
                    required
                    value={values.name}
                    onChange={(event) => setValues({ ...values, name: event.target.value })}
                  />
                  <Input
                    label="Email"
                    type="email"
                    required
                    value={values.email}
                    onChange={(event) => setValues({ ...values, email: event.target.value })}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Téléphone"
                    type="tel"
                    value={values.phone}
                    onChange={(event) => setValues({ ...values, phone: event.target.value })}
                  />
                  <Select
                    label="Objet de la demande"
                    options={SUBJECTS}
                    value={values.subject}
                    onChange={(event) => setValues({ ...values, subject: event.target.value })}
                  />
                </div>
                <Textarea
                  label="Votre message"
                  required
                  rows={6}
                  value={values.message}
                  onChange={(event) => setValues({ ...values, message: event.target.value })}
                  placeholder="Décrivez votre demande en quelques lignes…"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Vos données ne sont utilisées que pour traiter votre demande.
                  </p>
                  <Button type="submit" rightIcon={<Send className="h-4 w-4" />}>
                    Envoyer le message
                  </Button>
                </div>
              </form>
            )}
          </Card>

          {/* Horaires & accès */}
          <div className="space-y-5">
            <Card className="p-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-brand-700 dark:text-brand-400" aria-hidden />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Horaires d’ouverture</h2>
              </div>
              <ul className="mt-4 space-y-2.5 text-sm">
                {CLINIC_HOURS.map((slot) => (
                  <li key={slot.days} className="flex items-center justify-between gap-4">
                    <span className="text-slate-600 dark:text-slate-300">{slot.days}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{slot.hours}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                <p className="font-semibold">Urgences médicales</p>
                <p className="mt-1">
                  Accueil 24h/24 et 7j/7 — {CLINIC_CONTACT.emergencyPhone}. En cas de danger vital,
                  composez le 15 ou le 112.
                </p>
              </div>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="relative h-52 bg-gradient-to-br from-brand-100 via-slate-100 to-sky-100 dark:from-brand-950 dark:via-slate-900 dark:to-sky-950">
                <div className="pattern-grid absolute inset-0 opacity-70" aria-hidden />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-700 text-white shadow-glow">
                    <MapPin className="h-6 w-6" aria-hidden />
                  </span>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Clinique MediClinic</p>
                  <p className="max-w-[16rem] text-xs text-slate-600 dark:text-slate-300">
                    {CLINIC_CONTACT.address}
                  </p>
                </div>
              </div>
              <div className="p-4">
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(CLINIC_CONTACT.address)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="secondary" className="w-full" rightIcon={<ArrowUpRight className="h-4 w-4" />}>
                    Itinéraire
                  </Button>
                </a>
                <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
                  Métro ligne 8 — arrêt « Santé » · Parking visiteurs sur place
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
