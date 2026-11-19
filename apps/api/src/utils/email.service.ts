/**
 * Service d'envoi d'emails (nodemailer).
 *
 * En développement, l'application pointe vers **MailHog** (`127.0.0.1:1025`,
 * interface web sur `http://localhost:8025`) : aucun email réel n'est envoyé.
 *
 * IMPORTANT : l'envoi d'un email ne doit jamais faire échouer une opération
 * métier. Toutes les fonctions renvoient un booléen et journalisent l'erreur.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { env } from '../config/env.js';

let transporter: Transporter | null = null;

/** Crée (une seule fois) le transporteur SMTP. */
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      ...(env.SMTP_USER === ''
        ? {}
        : { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }),
      // MailHog n'utilise ni TLS ni authentification.
      ignoreTLS: env.SMTP_USER === '',
    });
  }
  return transporter;
}

export interface MailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/** Envoie un email. Renvoie `true` si l'envoi a réussi. Ne lève jamais. */
export async function sendMail(input: MailInput): Promise<boolean> {
  try {
    await getTransporter().sendMail({
      from: env.MAIL_FROM,
      to: Array.isArray(input.to) ? input.to.join(', ') : input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? stripHtml(input.html),
    });
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[mail] envoi vers ${String(input.to)} impossible :`, error);
    return false;
  }
}

/** Vérifie la disponibilité du serveur SMTP (diagnostic). */
export async function verifyMailTransport(): Promise<boolean> {
  try {
    await getTransporter().verify();
    return true;
  } catch {
    return false;
  }
}

/** Convertit grossièrement du HTML en texte brut (version texte du message). */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Gabarit HTML commun à tous les emails (charte de la clinique). */
function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:#0f766e;color:#ffffff;padding:20px 24px">
        <h1 style="margin:0;font-size:20px">${env.CLINIC_NAME}</h1>
        <p style="margin:4px 0 0;font-size:13px;opacity:.85">${title}</p>
      </div>
      <div style="padding:24px;font-size:14px;line-height:1.6">${body}</div>
      <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
        ${env.CLINIC_ADDRESS}<br />
        Tél. ${env.CLINIC_PHONE} — ${env.CLINIC_EMAIL}
      </div>
    </div>
  </body>
</html>`;
}

/** Notifie la création d'un rendez-vous. */
export function appointmentConfirmationEmail(params: {
  patientName: string;
  doctorName: string;
  dateTime: string;
  reason?: string | null;
}): MailInput {
  return {
    to: '',
    subject: 'Confirmation de votre rendez-vous — MediClinic',
    html: layout(
      'Confirmation de rendez-vous',
      `<p>Bonjour <strong>${params.patientName}</strong>,</p>
       <p>Votre rendez-vous est confirmé :</p>
       <ul>
         <li><strong>Médecin :</strong> ${params.doctorName}</li>
         <li><strong>Date :</strong> ${params.dateTime}</li>
         ${params.reason ? `<li><strong>Motif :</strong> ${params.reason}</li>` : ''}
       </ul>
       <p>Merci de vous présenter 10 minutes avant l'heure prévue, muni de votre carte vitale
       et de votre carte de mutuelle.</p>`,
    ),
  };
}

/** Notifie l'approbation d'une téléconsultation. */
export function meetingApprovedEmail(params: {
  patientName: string;
  doctorName: string;
  dateTime: string;
  joinUrl: string | null;
  password: string | null;
}): MailInput {
  return {
    to: '',
    subject: 'Votre téléconsultation est approuvée — MediClinic',
    html: layout(
      'Téléconsultation approuvée',
      `<p>Bonjour <strong>${params.patientName}</strong>,</p>
       <p>Votre demande de téléconsultation a été approuvée.</p>
       <ul>
         <li><strong>Médecin :</strong> ${params.doctorName}</li>
         <li><strong>Date :</strong> ${params.dateTime}</li>
         ${params.password ? `<li><strong>Code d'accès :</strong> ${params.password}</li>` : ''}
       </ul>
       ${
         params.joinUrl
           ? `<p>Le bouton de connexion s'active 10 minutes avant le début :<br />
              <a href="${params.joinUrl}">${params.joinUrl}</a></p>`
           : '<p>Le lien de connexion sera communiqué avant la séance.</p>'
       }`,
    ),
  };
}

/** Notifie la disponibilité d'une facture. */
export function invoiceReadyEmail(params: {
  patientName: string;
  invoiceNumber: string;
  total: string;
  dueDate: string;
}): MailInput {
  return {
    to: '',
    subject: `Facture ${params.invoiceNumber} disponible — MediClinic`,
    html: layout(
      'Nouvelle facture',
      `<p>Bonjour <strong>${params.patientName}</strong>,</p>
       <p>Votre facture <strong>${params.invoiceNumber}</strong> d'un montant de
       <strong>${params.total}</strong> est disponible.</p>
       <p>Date d'échéance : ${params.dueDate}. Vous pouvez la télécharger depuis votre
       espace patient.</p>`,
    ),
  };
}

/** Notifie le patient qu'une ordonnance a été dispensée. */
export function prescriptionDispensedEmail(params: {
  patientName: string;
  prescriptionId: number;
  medicationCount: number;
}): MailInput {
  return {
    to: '',
    subject: 'Votre ordonnance est prête — MediClinic',
    html: layout(
      'Ordonnance dispensée',
      `<p>Bonjour <strong>${params.patientName}</strong>,</p>
       <p>Votre ordonnance n° ${params.prescriptionId} (${params.medicationCount} médicament(s))
       a été préparée par notre pharmacie. Vous pouvez venir la retirer au comptoir.</p>`,
    ),
  };
}

/** Alerte l'équipe sur un réapprovisionnement nécessaire. */
export function lowStockAlertEmail(params: {
  medicationName: string;
  stockQuantity: number;
  alertThreshold: number;
}): MailInput {
  return {
    to: '',
    subject: `[Stock] Réapprovisionnement nécessaire : ${params.medicationName}`,
    html: layout(
      'Alerte de stock',
      `<p>La référence <strong>${params.medicationName}</strong> est passée sous son seuil d'alerte.</p>
       <ul>
         <li><strong>Stock actuel :</strong> ${params.stockQuantity}</li>
         <li><strong>Seuil d'alerte :</strong> ${params.alertThreshold}</li>
       </ul>
       <p>Merci de lancer une commande auprès du fournisseur.</p>`,
    ),
  };
}
