/**
 * Mentions légales, politique de confidentialité et accessibilité.
 * Les ancres permettent d'arriver directement sur une section depuis le footer.
 */

import { Lock, ShieldCheck, Scale, Accessibility } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui';
import { PageHero } from '@/components/public/PageHero';
import { APP_NAME } from '@mediclinic/shared';
import { CLINIC_CONTACT } from '@/lib/clinic';

const SECTIONS = [
  { id: 'editeur', label: 'Éditeur du site' },
  { id: 'confidentialite', label: 'Confidentialité' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'accessibilite', label: 'Accessibilité' },
  { id: 'responsabilite', label: 'Responsabilité' },
];

export default function LegalPage(): JSX.Element {
  return (
    <div>
      <PageHero
        eyebrow="Informations légales"
        title="Mentions légales & confidentialité"
        description="Transparence sur l’éditeur du site, la protection de vos données de santé et les engagements d’accessibilité de la clinique."
        breadcrumb={[{ label: 'Mentions légales' }]}
      />

      <section className="public-container py-14 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card className="p-2">
              <nav aria-label="Sommaire des mentions légales">
                <ul className="space-y-1">
                  {SECTIONS.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                      >
                        {section.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </Card>
          </aside>

          <div className="prose-clinic max-w-3xl">
            <section id="editeur" className="scroll-mt-24">
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden />
                <h2 className="mt-0">Éditeur du site</h2>
              </div>
              <p>
                Le site {APP_NAME} est édité par la clinique {APP_NAME}, établissement de santé privé
                d’intérêt collectif, dont le siège social est situé {CLINIC_CONTACT.address}.
              </p>
              <ul>
                <li>Téléphone : {CLINIC_CONTACT.phone}</li>
                <li>Email : {CLINIC_CONTACT.email}</li>
                <li>Directeur de la publication : direction de la clinique</li>
                <li>Hébergement : prestataire certifié HDS, données hébergées en France</li>
              </ul>
              <p>
                Ce site est réalisé dans le cadre d’un projet académique de gestion de clinique médicale.
                Les informations présentées ont une valeur illustrative.
              </p>
            </section>

            <section id="confidentialite" className="scroll-mt-24">
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden />
                <h2 className="mt-0">Politique de confidentialité</h2>
              </div>
              <p>
                Les données collectées via ce site sont utilisées uniquement pour la gestion des
                rendez-vous, le suivi médical et la facturation. Elles ne sont jamais cédées à des tiers
                à des fins commerciales.
              </p>
              <h3>Données concernées</h3>
              <ul>
                <li>Identité, coordonnées et date de naissance ;</li>
                <li>Données de santé strictement nécessaires à la prise en charge ;</li>
                <li>Données de connexion et journaux d’accès.</li>
              </ul>
              <h3>Durée de conservation</h3>
              <p>
                Les données médicales sont conservées pendant la durée légale applicable aux
                établissements de santé. Les données de facturation sont conservées dix ans.
              </p>
              <h3>Vos droits</h3>
              <p>
                Conformément au RGPD, vous disposez d’un droit d’accès, de rectification, d’effacement,
                de limitation et d’opposition. Pour l’exercer, écrivez à {CLINIC_CONTACT.email} en
                précisant votre demande et en joignant un justificatif d’identité.
              </p>
            </section>

            <section id="cookies" className="scroll-mt-24">
              <h2>Cookies et stockage local</h2>
              <p>
                Le site utilise uniquement des cookies techniques nécessaires à l’authentification et à
                la mémorisation de vos préférences d’affichage (thème clair ou sombre). Aucun cookie
                publicitaire ou de mesure d’audience tiers n’est déposé sans votre consentement.
              </p>
            </section>

            <section id="accessibilite" className="scroll-mt-24">
              <div className="flex items-center gap-2">
                <Accessibility className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden />
                <h2 className="mt-0">Accessibilité</h2>
              </div>
              <p>
                La clinique s’engage à rendre son site accessible au plus grand nombre. Les pages
                respectent les bonnes pratiques suivantes :
              </p>
              <ul>
                <li>navigation complète au clavier et focus visible ;</li>
                <li>contrastes de couleurs conformes aux recommandations WCAG ;</li>
                <li>libellés explicites pour les champs et les boutons ;</li>
                <li>prise en charge des préférences de thème clair et sombre.</li>
              </ul>
              <p>
                Si vous rencontrez une difficulté d’accès, contactez-nous à {CLINIC_CONTACT.email} afin
                que nous puissions vous accompagner.
              </p>
            </section>

            <section id="responsabilite" className="scroll-mt-24">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-brand-700 dark:text-brand-400" aria-hidden />
                <h2 className="mt-0">Limitation de responsabilité</h2>
              </div>
              <p>
                Les informations publiées sur ce site sont fournies à titre informatif et ne constituent
                pas un avis médical. Elles ne remplacent en aucun cas une consultation avec un
                professionnel de santé.
              </p>
              <p>
                En cas d’urgence vitale, composez immédiatement le 15 (SAMU), le 112 (numéro européen)
                ou le 18 (pompiers). Le service d’urgences de la clinique est joignable au{' '}
                {CLINIC_CONTACT.emergencyPhone}.
              </p>
            </section>

            <p className="mt-10 rounded-xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}. Pour toute question,{' '}
              <Link to="/contact" className="link">
                contactez-nous
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
