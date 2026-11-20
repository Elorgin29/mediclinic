/**
 * Configuration de la navigation.
 *
 * Chaque entrée déclare la permission requise : le menu du back-office est donc
 * généré automatiquement en fonction des droits réels de l'utilisateur — un
 * pharmacien ne voit pas le module de facturation, un comptable ne voit pas la
 * pharmacie. C'est la partie visible du RBAC modulaire.
 */

import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  FlaskConical,
  KeyRound,
  LayoutDashboard,
  PackageSearch,
  Pill,
  Receipt,
  Settings,
  ShieldCheck,
  Stethoscope,
  Tags,
  UserCog,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  /** Chemin de la route (aussi utilisé comme clé de rendu). */
  to: string;
  label: string;
  icon: LucideIcon;
  /** Permission requise pour afficher l'entrée. */
  permission: string;
  /** Correspondance exacte du chemin (page d'index). */
  exact?: boolean;
  /** Badge dynamique (notifications, alertes). */
  badgeKey?: 'pendingMeetings' | 'lowStock' | 'overdueInvoices' | 'unreadNotifications';
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Menu du back-office, regroupé par domaine métier. */
export const ADMIN_NAV: NavGroup[] = [
  {
    title: 'Pilotage',
    items: [
      { to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, permission: 'dashboard:read', exact: true },
      { to: '/admin/agenda', label: 'Agenda du jour', icon: CalendarDays, permission: 'appointment:read' },
      { to: '/admin/rapports', label: 'Rapports', icon: BarChart3, permission: 'report:read' },
    ],
  },
  {
    title: 'Soins',
    items: [
      { to: '/admin/rendez-vous', label: 'Rendez-vous', icon: CalendarCheck, permission: 'appointment:read' },
      { to: '/admin/patients', label: 'Patients', icon: Users, permission: 'patient:read' },
      { to: '/admin/consultations', label: 'Consultations', icon: ClipboardList, permission: 'consultation:read' },
      { to: '/admin/ordonnances', label: 'Ordonnances', icon: FileText, permission: 'prescription:read' },
      { to: '/admin/teleconsultations', label: 'Téléconsultations', icon: Video, permission: 'meeting:read', badgeKey: 'pendingMeetings' },
      { to: '/admin/laboratoire', label: 'Laboratoire', icon: FlaskConical, permission: 'lab:read' },
      { to: '/admin/gardes', label: 'Planning des gardes', icon: CalendarClock, permission: 'shift:read' },
    ],
  },
  {
    title: 'Pharmacie',
    items: [
      { to: '/admin/medicaments', label: 'Médicaments', icon: Pill, permission: 'medication:read' },
      { to: '/admin/stock', label: 'Stock', icon: PackageSearch, permission: 'stock:read', badgeKey: 'lowStock' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/admin/factures', label: 'Factures', icon: Receipt, permission: 'invoice:read', badgeKey: 'overdueInvoices' },
      { to: '/admin/paiements', label: 'Paiements', icon: CreditCard, permission: 'payment:read' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/admin/medecins', label: 'Médecins', icon: Stethoscope, permission: 'doctor:read' },
      { to: '/admin/specialites', label: 'Spécialités', icon: Tags, permission: 'specialty:read' },
      { to: '/admin/departements', label: 'Départements', icon: Building2, permission: 'department:read' },
      { to: '/admin/utilisateurs', label: 'Utilisateurs', icon: UserCog, permission: 'user:read' },
      { to: '/admin/roles', label: 'Rôles & permissions', icon: KeyRound, permission: 'role:read' },
      { to: '/admin/audit', label: "Journal d'audit", icon: ShieldCheck, permission: 'audit:read' },
      { to: '/admin/parametres', label: 'Paramètres', icon: Settings, permission: 'settings:read' },
    ],
  },
];

export interface PatientNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

/** Menu de l'espace patient. */
export const PATIENT_NAV: PatientNavItem[] = [
  { to: '/patient', label: 'Mon tableau de bord', icon: LayoutDashboard, exact: true },
  { to: '/patient/rendez-vous', label: 'Mes rendez-vous', icon: CalendarCheck },
  { to: '/patient/dossier', label: 'Mon dossier médical', icon: ClipboardList },
  { to: '/patient/ordonnances', label: 'Mes ordonnances', icon: FileText },
  { to: '/patient/factures', label: 'Mes factures', icon: Receipt },
  { to: '/patient/teleconsultations', label: 'Mes téléconsultations', icon: Video },
  { to: '/patient/profil', label: 'Mon profil', icon: UserCog },
];

/** Liens principaux du site public (barre de navigation). */
export const PUBLIC_NAV = [
  { to: '/', label: 'Accueil' },
  { to: '/medecins', label: 'Nos médecins' },
  { to: '/specialites', label: 'Spécialités' },
  { to: '/services', label: 'Services' },
  { to: '/actualites', label: 'Actualités' },
  { to: '/contact', label: 'Contact' },
];

/** Colonnes du pied de page public. */
export const PUBLIC_FOOTER_NAV: Array<{ title: string; items: Array<{ to: string; label: string }> }> = [
  {
    title: 'Soins & parcours',
    items: [
      { to: '/medecins', label: 'Annuaire des médecins' },
      { to: '/specialites', label: 'Spécialités' },
      { to: '/services', label: 'Nos services' },
      { to: '/rendez-vous', label: 'Prendre rendez-vous' },
      { to: '/teleconsultation', label: 'Téléconsultation' },
    ],
  },
  {
    title: 'La clinique',
    items: [
      { to: '/a-propos', label: 'À propos' },
      { to: '/actualites', label: 'Actualités santé' },
      { to: '/faq', label: 'Questions fréquentes' },
      { to: '/contact', label: 'Nous contacter' },
      { to: '/urgences', label: 'Urgences 24h/24' },
    ],
  },
  {
    title: 'Informations',
    items: [
      { to: '/inscription', label: 'Créer un espace patient' },
      { to: '/connexion', label: 'Espace patient' },
      { to: '/mentions-legales', label: 'Mentions légales' },
      { to: '/mentions-legales#confidentialite', label: 'Confidentialité' },
      { to: '/mentions-legales#accessibilite', label: 'Accessibilité' },
    ],
  },
];
