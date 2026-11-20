/**
 * Configuration de la navigation.
 *
 * Chaque entrée déclare la permission requise : le menu du back-office est donc
 * généré automatiquement en fonction des droits réels de l'utilisateur — un
 * pharmacien ne voit pas le module de facturation, un comptable ne voit pas la
 * pharmacie. `labelKey` est la clé de traduction ; `label` reste le libellé
 * français de repli.
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
  Newspaper,
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
  to: string;
  label: string;
  labelKey: string;
  icon: LucideIcon;
  permission: string;
  exact?: boolean;
  badgeKey?: 'pendingMeetings' | 'lowStock' | 'overdueInvoices' | 'unreadNotifications';
}

export interface NavGroup {
  title: string;
  labelKey: string;
  items: NavItem[];
}

/** Menu du back-office, regroupé par domaine métier. */
export const ADMIN_NAV: NavGroup[] = [
  {
    title: 'Pilotage',
    labelKey: 'nav.pilotage',
    items: [
      { to: '/admin', label: 'Tableau de bord', labelKey: 'nav.dashboard', icon: LayoutDashboard, permission: 'dashboard:read', exact: true },
      { to: '/admin/agenda', label: 'Agenda du jour', labelKey: 'nav.agenda', icon: CalendarDays, permission: 'appointment:read' },
      { to: '/admin/rapports', label: 'Rapports', labelKey: 'nav.reports', icon: BarChart3, permission: 'report:read' },
    ],
  },
  {
    title: 'Soins',
    labelKey: 'nav.soins',
    items: [
      { to: '/admin/rendez-vous', label: 'Rendez-vous', labelKey: 'nav.appointments', icon: CalendarCheck, permission: 'appointment:read' },
      { to: '/admin/patients', label: 'Patients', labelKey: 'nav.patients', icon: Users, permission: 'patient:read' },
      { to: '/admin/consultations', label: 'Consultations', labelKey: 'nav.consultations', icon: ClipboardList, permission: 'consultation:read' },
      { to: '/admin/ordonnances', label: 'Ordonnances', labelKey: 'nav.prescriptions', icon: FileText, permission: 'prescription:read' },
      { to: '/admin/teleconsultations', label: 'Téléconsultations', labelKey: 'nav.meetings', icon: Video, permission: 'meeting:read', badgeKey: 'pendingMeetings' },
      { to: '/admin/laboratoire', label: 'Laboratoire', labelKey: 'nav.lab', icon: FlaskConical, permission: 'lab:read' },
      { to: '/admin/gardes', label: 'Planning des gardes', labelKey: 'nav.shifts', icon: CalendarClock, permission: 'shift:read' },
    ],
  },
  {
    title: 'Pharmacie',
    labelKey: 'nav.pharmacie',
    items: [
      { to: '/admin/medicaments', label: 'Médicaments', labelKey: 'nav.medications', icon: Pill, permission: 'medication:read' },
      { to: '/admin/stock', label: 'Stock', labelKey: 'nav.stock', icon: PackageSearch, permission: 'stock:read', badgeKey: 'lowStock' },
    ],
  },
  {
    title: 'Finance',
    labelKey: 'nav.finance',
    items: [
      { to: '/admin/factures', label: 'Factures', labelKey: 'nav.invoices', icon: Receipt, permission: 'invoice:read', badgeKey: 'overdueInvoices' },
      { to: '/admin/paiements', label: 'Paiements', labelKey: 'nav.payments', icon: CreditCard, permission: 'payment:read' },
    ],
  },
  {
    title: 'Communication',
    labelKey: 'nav.communication',
    items: [
      { to: '/admin/actualites', label: 'Actualités', labelKey: 'nav.news', icon: Newspaper, permission: 'news:read' },
    ],
  },
  {
    title: 'Administration',
    labelKey: 'nav.administration',
    items: [
      { to: '/admin/medecins', label: 'Médecins', labelKey: 'nav.doctors', icon: Stethoscope, permission: 'doctor:read' },
      { to: '/admin/specialites', label: 'Spécialités', labelKey: 'nav.specialties', icon: Tags, permission: 'specialty:read' },
      { to: '/admin/departements', label: 'Départements', labelKey: 'nav.departments', icon: Building2, permission: 'department:read' },
      { to: '/admin/utilisateurs', label: 'Utilisateurs', labelKey: 'nav.users', icon: UserCog, permission: 'user:read' },
      { to: '/admin/roles', label: 'Rôles & permissions', labelKey: 'nav.roles', icon: KeyRound, permission: 'role:read' },
      { to: '/admin/audit', label: "Journal d'audit", labelKey: 'nav.audit', icon: ShieldCheck, permission: 'audit:read' },
      { to: '/admin/parametres', label: 'Paramètres', labelKey: 'nav.settings', icon: Settings, permission: 'settings:read' },
    ],
  },
];

export interface PatientNavItem {
  to: string;
  label: string;
  labelKey: string;
  icon: LucideIcon;
  exact?: boolean;
}

/** Menu de l'espace patient. */
export const PATIENT_NAV: PatientNavItem[] = [
  { to: '/patient', label: 'Mon tableau de bord', labelKey: 'nav.myDashboard', icon: LayoutDashboard, exact: true },
  { to: '/patient/rendez-vous', label: 'Mes rendez-vous', labelKey: 'nav.myAppointments', icon: CalendarCheck },
  { to: '/patient/dossier', label: 'Mon dossier médical', labelKey: 'nav.myRecord', icon: ClipboardList },
  { to: '/patient/ordonnances', label: 'Mes ordonnances', labelKey: 'nav.myPrescriptions', icon: FileText },
  { to: '/patient/factures', label: 'Mes factures', labelKey: 'nav.myInvoices', icon: Receipt },
  { to: '/patient/teleconsultations', label: 'Mes téléconsultations', labelKey: 'nav.myMeetings', icon: Video },
  { to: '/patient/profil', label: 'Mon profil', labelKey: 'nav.myProfile', icon: UserCog },
];

/** Liens principaux du site public (barre de navigation). */
export const PUBLIC_NAV = [
  { to: '/', label: 'Accueil', labelKey: 'nav.home' },
  { to: '/medecins', label: 'Nos médecins', labelKey: 'nav.ourDoctors' },
  { to: '/specialites', label: 'Spécialités', labelKey: 'nav.specialties' },
  { to: '/services', label: 'Services', labelKey: 'nav.services' },
  { to: '/actualites', label: 'Actualités', labelKey: 'nav.news' },
  { to: '/contact', label: 'Contact', labelKey: 'nav.contact' },
];

/** Colonnes du pied de page public. */
export const PUBLIC_FOOTER_NAV: Array<{
  title: string;
  labelKey: string;
  items: Array<{ to: string; label: string; labelKey: string }>;
}> = [
  {
    title: 'Soins & parcours',
    labelKey: 'nav.soins',
    items: [
      { to: '/medecins', label: 'Annuaire des médecins', labelKey: 'nav.ourDoctors' },
      { to: '/specialites', label: 'Spécialités', labelKey: 'nav.specialties' },
      { to: '/services', label: 'Nos services', labelKey: 'nav.services' },
      { to: '/rendez-vous', label: 'Prendre rendez-vous', labelKey: 'nav.book' },
      { to: '/teleconsultation', label: 'Téléconsultation', labelKey: 'nav.teleconsultation' },
    ],
  },
  {
    title: 'La clinique',
    labelKey: 'nav.about',
    items: [
      { to: '/a-propos', label: 'À propos', labelKey: 'nav.about' },
      { to: '/actualites', label: 'Actualités santé', labelKey: 'nav.news' },
      { to: '/faq', label: 'Questions fréquentes', labelKey: 'nav.faq' },
      { to: '/contact', label: 'Nous contacter', labelKey: 'nav.contact' },
      { to: '/urgences', label: 'Urgences 24h/24', labelKey: 'nav.emergency' },
    ],
  },
  {
    title: 'Informations',
    labelKey: 'nav.administration',
    items: [
      { to: '/inscription', label: 'Créer un espace patient', labelKey: 'nav.createAccount' },
      { to: '/connexion', label: 'Espace patient', labelKey: 'nav.mySpace' },
      { to: '/mentions-legales', label: 'Mentions légales', labelKey: 'footer.legal' },
      { to: '/mentions-legales#confidentialite', label: 'Confidentialité', labelKey: 'footer.privacy' },
      { to: '/mentions-legales#accessibilite', label: 'Accessibilité', labelKey: 'footer.accessibility' },
    ],
  },
];
