/**
 * Foire aux questions : réponses rapides sur les rendez-vous, la
 * téléconsultation, le dossier patient et la facturation.
 */

import { ChevronDown, HelpCircle, MessageSquare, Phone } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button, Card } from '@/components/ui';
import { PageHero } from '@/components/public/PageHero';
import { CLINIC_CONTACT } from '@/lib/clinic';
import { cn } from '@/lib/utils';

interface FaqEntry {
  question: string;
  answer: string;
}

interface FaqCategory {
  id: string;
  label: string;
  entries: FaqEntry[];
}

const CATEGORIES: FaqCategory[] = [
  {
    id: 'rendez-vous',
    label: 'Rendez-vous',
    entries: [
      {
        question: 'Comment prendre rendez-vous ?',
        answer:
          'Vous pouvez réserver en ligne depuis la page « Prendre rendez-vous », choisir votre praticien et votre créneau, puis recevoir une confirmation immédiate. Le secrétariat reste joignable par téléphone pour les demandes particulières.',
      },
      {
        question: 'Puis-je annuler ou déplacer un rendez-vous ?',
        answer:
          'Oui. Depuis votre espace patient, sélectionnez le rendez-vous concerné puis choisissez « Annuler ». Merci de prévenir au moins 24h à l’avance afin de libérer le créneau pour un autre patient.',
      },
      {
        question: 'Que dois-je apporter le jour de la consultation ?',
        answer:
          'Votre carte Vitale, une pièce d’identité, votre carte de mutuelle et, si possible, vos ordonnances et résultats d’analyses récents. Pour un premier rendez-vous, arrivez dix minutes en avance.',
      },
    ],
  },
  {
    id: 'teleconsultation',
    label: 'Téléconsultation',
    entries: [
      {
        question: 'La téléconsultation est-elle remboursée ?',
        answer:
          'Elle est prise en charge dans les mêmes conditions qu’une consultation au cabinet, si elle est réalisée par un médecin conventionné. Votre mutuelle peut compléter le remboursement.',
      },
      {
        question: 'Comment accéder à ma visioconférence ?',
        answer:
          'Une fois votre demande approuvée, un lien sécurisé apparaît dans « Mes téléconsultations ». Le bouton de connexion s’active dix minutes avant l’heure prévue.',
      },
      {
        question: 'Quel matériel est nécessaire ?',
        answer:
          'Un ordinateur ou un smartphone récent, une connexion internet stable, une webcam et un microphone. Un endroit calme et lumineux améliore nettement la qualité de l’échange.',
      },
    ],
  },
  {
    id: 'dossier',
    label: 'Dossier patient',
    entries: [
      {
        question: 'Comment créer mon espace patient ?',
        answer:
          'Cliquez sur « Créer mon espace », renseignez vos informations et validez votre email. Vous pourrez ensuite consulter vos rendez-vous, ordonnances, résultats et factures.',
      },
      {
        question: 'Mes données sont-elles protégées ?',
        answer:
          'Oui. Les données de santé sont hébergées en France, chiffrées et accessibles uniquement aux professionnels autorisés. Chaque accès est journalisé conformément au RGPD.',
      },
      {
        question: 'Puis-je télécharger mon dossier ?',
        answer:
          'Vous pouvez télécharger vos ordonnances et factures au format PDF. Pour obtenir une copie complète de votre dossier, adressez une demande écrite au secrétariat.',
      },
    ],
  },
  {
    id: 'facturation',
    label: 'Facturation',
    entries: [
      {
        question: 'Quand ma facture est-elle disponible ?',
        answer:
          'Elle est générée à l’issue de la consultation et apparaît immédiatement dans votre espace, rubrique « Mes factures ». Vous pouvez la régler au guichet ou en ligne.',
      },
      {
        question: 'Comment obtenir une facture pour ma mutuelle ?',
        answer:
          'La facture PDF contient toutes les mentions requises. Si votre organisme demande un document spécifique, contactez le service facturation avec votre numéro d’adhérent.',
      },
      {
        question: 'Que faire en cas d’erreur de facturation ?',
        answer:
          'Signalez-la via le formulaire de contact en précisant le numéro de facture. Une régularisation est généralement traitée sous 48h ouvrées.',
      },
    ],
  },
];

export default function FaqPage(): JSX.Element {
  const [activeCategory, setActiveCategory] = useState('rendez-vous');
  const [openQuestion, setOpenQuestion] = useState<string | null>(CATEGORIES[0]?.entries[0]?.question ?? null);

  const category = CATEGORIES.find((item) => item.id === activeCategory) ?? CATEGORIES[0]!;

  return (
    <div>
      <PageHero
        eyebrow="Aide & questions fréquentes"
        title={
          <>
            Toutes les réponses, <span className="gradient-text">au même endroit</span>
          </>
        }
        description="Rendez-vous, téléconsultation, dossier médical, facturation : retrouvez les réponses aux questions les plus courantes."
        breadcrumb={[{ label: 'FAQ' }]}
      />

      <section className="public-container py-14 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card className="p-2">
              <ul className="space-y-1">
                {CATEGORIES.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCategory(item.id);
                        setOpenQuestion(item.entries[0]?.question ?? null);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                        item.id === activeCategory
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                      )}
                    >
                      {item.label}
                      <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
                        {item.entries.length}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="mt-4 p-5">
              <MessageSquare className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden />
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">Une autre question ?</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Notre équipe vous répond sous 24h ouvrées.
              </p>
              <Link to="/contact" className="mt-3 block">
                <Button size="sm" variant="secondary" className="w-full">
                  Nous écrire
                </Button>
              </Link>
              <a href={`tel:${CLINIC_CONTACT.phone.replace(/\s/g, '')}`} className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-brand-700 dark:text-slate-400">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {CLINIC_CONTACT.phone}
              </a>
            </Card>
          </aside>

          <div>
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{category.label}</h2>
            </div>

            <div className="mt-4 space-y-3">
              {category.entries.map((entry) => {
                const isOpen = openQuestion === entry.question;
                return (
                  <Card key={entry.question} className="overflow-hidden p-0">
                    <button
                      type="button"
                      onClick={() => setOpenQuestion(isOpen ? null : entry.question)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                    >
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{entry.question}</span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 text-slate-400 transition-transform',
                          isOpen && 'rotate-180',
                        )}
                        aria-hidden
                      />
                    </button>
                    {isOpen && (
                      <div className="border-t border-slate-100 px-5 py-4 text-sm leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-300">
                        {entry.answer}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
