/**
 * Informations de la clinique affichées dans l'interface.
 *
 * Valeurs de repli utilisées par le site public et les pieds de page. Elles
 * peuvent être surchargées par les paramètres enregistrés en base
 * (`clinic_settings`, exposés par `GET /api/settings`).
 */

/** Contact affiché sur le site public. */
export const CLINIC_CONTACT = {
  address: '12 avenue de la Santé, 75015 Paris, France',
  phone: '+33 1 45 67 89 00',
  email: 'contact@mediclinic.fr',
  emergencyPhone: '+33 1 45 67 89 99',
} as const;

/** Horaires d'ouverture présentés sur la page d'accueil. */
export const CLINIC_HOURS = [
  { days: 'Lundi – Vendredi', hours: '08h00 – 19h00' },
  { days: 'Samedi', hours: '09h00 – 13h00' },
  { days: 'Dimanche', hours: 'Fermé (urgences assurées)' },
] as const;

/** Chiffres clés affichés sur la page d'accueil. */
export const CLINIC_HIGHLIGHTS = [
  { label: 'Médecins spécialistes', value: '8' },
  { label: 'Spécialités couvertes', value: '10' },
  { label: 'Départements', value: '8' },
  { label: 'Urgences', value: '24h/24' },
] as const;
