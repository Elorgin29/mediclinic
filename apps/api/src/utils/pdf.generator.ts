/**
 * Génération des documents PDF (bibliothèque bas niveau).
 *
 * Chaque fonction publique renvoie une `Promise<Buffer>` : le contrôleur se
 * charge de l'envoyer. Tous les documents partagent :
 *  - un en-tête de page (logo ou monogramme, identité de la clinique) ;
 *  - un pied de page (pagination `Page X / Y`, date d'édition, mention de
 *    confidentialité) ;
 *  - une mise en page A4, marges de 50 pt, police Helvetica.
 *
 * Les tableaux sont dessinés à la main avec saut de page automatique et
 * réaffichage de l'en-tête de colonnes : aucune ligne n'est coupée en deux.
 */

import {
  formatDate,
  formatDateTime,
  formatMoney,
  type Appointment,
  type Consultation,
  type Invoice,
  type Patient,
  type Prescription,
} from '@mediclinic/shared';
import fs from 'node:fs';
import path from 'node:path';

import PDFDocument from 'pdfkit';

import { env } from '../config/env.js';

/* -------------------------------------------------------------------------- */
/* Constantes de mise en page                                                  */
/* -------------------------------------------------------------------------- */

const PAGE_WIDTH = 595.28; // A4 en points
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** Y maximal avant saut de page (réserve la place du pied de page). */
const BOTTOM_LIMIT = PAGE_HEIGHT - MARGIN - 40;

const BRAND = '#0f766e';
const INK = '#0f172a';
const MUTED = '#64748b';
const HAIRLINE = '#e2e8f0';

/* -------------------------------------------------------------------------- */
/* Utilitaires                                                                 */
/* -------------------------------------------------------------------------- */

/** Tronque un texte à une largeur donnée, avec une ellipse. */
function truncate(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string {
  if (doc.widthOfString(text) <= maxWidth) return text;

  let result = text;
  while (result.length > 1 && doc.widthOfString(`${result}...`) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
}

/** Vérifie qu'un logo exploitable existe ; renvoie son chemin absolu ou `null`. */
function findLogo(): string | null {
  const candidate = path.join(env.paths.static, 'logo.png');
  if (fs.existsSync(candidate)) return candidate;

  const fallback = path.join(env.paths.static, 'logo.jpg');
  return fs.existsSync(fallback) ? fallback : null;
}

/** Crée un document A4 avec ses métadonnées. */
function createDocument(title: string): PDFKit.PDFDocument {
  return new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true, // nécessaire pour numéroter « Page X / Y » en fin de course
    info: {
      Title: title,
      Author: env.CLINIC_NAME,
      Creator: 'MediClinic',
      Subject: title,
    },
  });
}

/** Assemble le buffer final. */
function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/**
 * En-tête de page : logo (ou monogramme), identité de la clinique, filet.
 * Dessiné sur la page courante, à la position absolue des marges.
 */
function drawHeader(doc: PDFKit.PDFDocument, documentTitle: string): void {
  const top = MARGIN;

  const logo = findLogo();
  if (logo) {
    try {
      doc.image(logo, MARGIN, top, { fit: [42, 42] });
    } catch {
      // Image illisible : on retombe sur le monogramme.
      drawMonogram(doc, top);
    }
  } else {
    drawMonogram(doc, top);
  }

  const textX = MARGIN + 54;
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(env.CLINIC_NAME, textX, top, { width: CONTENT_WIDTH - 54 });

  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text(env.CLINIC_ADDRESS, textX, top + 17, { width: CONTENT_WIDTH - 54 })
    .text(`Tél. ${env.CLINIC_PHONE} — ${env.CLINIC_EMAIL}`, textX, top + 28, {
      width: CONTENT_WIDTH - 54,
    });

  doc
    .fillColor(BRAND)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(documentTitle.toUpperCase(), MARGIN, top + 42, { width: CONTENT_WIDTH, align: 'right' });

  doc
    .moveTo(MARGIN, top + 56)
    .lineTo(PAGE_WIDTH - MARGIN, top + 56)
    .lineWidth(1.5)
    .strokeColor(BRAND)
    .stroke();

  doc.y = top + 68;
}

/** Monogramme utilisé en l'absence de logo. */
function drawMonogram(doc: PDFKit.PDFDocument, top: number): void {
  doc.roundedRect(MARGIN, top, 42, 42, 8).fillColor(BRAND).fill();
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(15)
    .text('MC', MARGIN, top + 13, { width: 42, align: 'center' });
}

/**
 * Pieds de page numérotés.
 * Appelé une fois tout le contenu écrit : `bufferPages` permet de revenir sur
 * chaque page pour y inscrire le numéro.
 */
function drawFooters(doc: PDFKit.PDFDocument, documentTitle: string): void {
  const range = doc.bufferedPageRange();
  const savedY = doc.y;
  const footerY = PAGE_HEIGHT - MARGIN + 8;
  const editedAt = formatDateTime(new Date());

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);

    // Le pied de page se dessine dans la marge basse (zone réservée, hors du
    // flux du contenu). PDFKit déclenche sinon un saut de page dès que `doc.y`
    // dépasse `hauteur - marge basse` : on neutralise temporairement cette
    // limite pour chaque page, puis on la restaure immédiatement.
    const page = doc.page;
    const bottomMargin = page.margins.bottom;
    page.margins.bottom = 0;
    doc.y = MARGIN;

    doc
      .moveTo(MARGIN, footerY - 8)
      .lineTo(PAGE_WIDTH - MARGIN, footerY - 8)
      .lineWidth(0.5)
      .strokeColor(HAIRLINE)
      .stroke();

    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7.5)
      .text(`Page ${index + 1} / ${range.count}`, MARGIN, footerY, { width: 120 })
      .text(`Édité le ${editedAt}`, MARGIN, footerY, {
        width: CONTENT_WIDTH,
        align: 'center',
      })
      .text('Document confidentiel — usage médical', MARGIN, footerY, {
        width: CONTENT_WIDTH,
        align: 'right',
      });

    doc
      .fillColor(MUTED)
      .fontSize(6.5)
      .text(documentTitle, MARGIN, footerY + 10, { width: CONTENT_WIDTH, align: 'center' });

    page.margins.bottom = bottomMargin;
    doc.y = MARGIN;
  }

  doc.y = savedY;
}

/** Ajoute une page (avec en-tête) si `needed` dépasse l'espace restant. */
function ensureSpace(doc: PDFKit.PDFDocument, needed: number, title: string): void {
  if (doc.y + needed <= BOTTOM_LIMIT) return;

  doc.addPage();
  drawHeader(doc, title);
}

/** Titre de section. */
function sectionTitle(doc: PDFKit.PDFDocument, title: string, pageTitle: string): void {
  ensureSpace(doc, 34, pageTitle);
  doc.moveDown(0.6);
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(11).text(title.toUpperCase(), MARGIN, doc.y);
  doc.moveDown(0.25);
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(PAGE_WIDTH - MARGIN, doc.y)
    .lineWidth(0.5)
    .strokeColor(HAIRLINE)
    .stroke();
  doc.moveDown(0.5);
}

/** Paire libellé / valeur sur deux colonnes. */
function field(doc: PDFKit.PDFDocument, label: string, value: string, pageTitle: string): void {
  ensureSpace(doc, 15, pageTitle);
  const y = doc.y;
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(label, MARGIN, y, { width: 140 });

  // Une valeur longue ne doit jamais se chevaucher avec la ligne suivante :
  // on la tronque sur une seule ligne plutôt que de laisser PDFKit la couper.
  doc.fillColor(INK).font('Helvetica').fontSize(9);
  doc.text(truncate(doc, value || '—', CONTENT_WIDTH - 145), MARGIN + 145, y, {
    width: CONTENT_WIDTH - 145,
    lineBreak: false,
  });
  doc.y = y + 14;
}

/**
 * Écrit un bloc de texte en évitant qu'un saut de page automatique ne coupe le
 * paragraphe sur une page sans en-tête : la hauteur réelle est calculée avant.
 */
function textBlock(
  doc: PDFKit.PDFDocument,
  text: string,
  pageTitle: string,
  options: { fontSize?: number; color?: string; italic?: boolean } = {},
): void {
  const value = text || '—';
  const fontSize = options.fontSize ?? 9.5;
  const font = options.italic ? 'Helvetica-Oblique' : 'Helvetica';

  doc.fillColor(options.color ?? INK).font(font).fontSize(fontSize);
  const height = doc.heightOfString(value, { width: CONTENT_WIDTH });
  ensureSpace(doc, height + 10, pageTitle);
  doc.text(value, MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'justify' });
  doc.moveDown(0.6);
}

/** Paragraphe de texte libre. */
function paragraph(doc: PDFKit.PDFDocument, text: string, pageTitle: string): void {
  textBlock(doc, text, pageTitle);
}

/* -------------------------------------------------------------------------- */
/* Tableau générique                                                           */
/* -------------------------------------------------------------------------- */

export interface TableColumn {
  header: string;
  /** Largeur relative : la somme des `width` est normalisée sur la largeur utile. */
  width: number;
  align?: 'left' | 'right' | 'center';
}

/**
 * Dessine un tableau paginé.
 *
 * @param rows lignes déjà converties en chaînes (une cellule par colonne)
 */
function drawTable(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  rows: string[][],
  pageTitle: string,
  onPageBreak?: () => void,
): void {
  const totalWeight = columns.reduce((sum, column) => sum + column.width, 0);
  const widths = columns.map((column) => (column.width / totalWeight) * CONTENT_WIDTH);

  /** Dessine l'en-tête de colonnes. */
  const drawTableHeader = (): void => {
    const y = doc.y;
    doc.rect(MARGIN, y, CONTENT_WIDTH, 18).fillColor('#f1f5f9').fill();

    let x = MARGIN;
    columns.forEach((column, index) => {
      const width = widths[index] ?? 0;
      const padding = 4;
      const align = column.align ?? 'left';
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(column.header.toUpperCase(), x + padding, y + 5, {
          width: width - padding * 2,
          align,
          lineBreak: false,
        });
      x += width;
    });

    doc.y = y + 18;
    doc.moveTo(MARGIN, doc.y).lineTo(PAGE_WIDTH - MARGIN, doc.y).lineWidth(0.5).strokeColor(HAIRLINE).stroke();
  };

  ensureSpace(doc, 40, pageTitle);
  drawTableHeader();

  for (const row of rows) {
    // Une ligne occupe au plus la hauteur d'une ligne de texte + padding.
    if (doc.y + 18 > BOTTOM_LIMIT) {
      onPageBreak?.();
      doc.addPage();
      drawHeader(doc, pageTitle);
      drawTableHeader();
    }

    const y = doc.y;
    let x = MARGIN;

    row.forEach((cell, index) => {
      const width = widths[index] ?? 0;
      const padding = 4;
      const align = columns[index]?.align ?? 'left';

      doc
        .fillColor(INK)
        .font('Helvetica')
        .fontSize(8.5)
        .text(truncate(doc, cell, width - padding * 2), x + padding, y + 5, {
          width: width - padding * 2,
          align,
          lineBreak: false,
        });

      x += width;
    });

    doc.y = y + 17;
    doc.moveTo(MARGIN, doc.y).lineTo(PAGE_WIDTH - MARGIN, doc.y).lineWidth(0.4).strokeColor(HAIRLINE).stroke();
  }

  doc.moveDown(0.8);
}

/* -------------------------------------------------------------------------- */
/* Document 1 — Dossier patient                                                */
/* -------------------------------------------------------------------------- */

export interface PatientRecordData {
  patient: Patient;
  appointments: Appointment[];
  consultations: Consultation[];
  prescriptions: Array<Prescription & { items?: Array<{ medication_name?: string; quantity: number }> }>;
  invoices: Invoice[];
  generatedBy: string;
}

export function generatePatientRecordPdf(data: PatientRecordData): Promise<Buffer> {
  const title = `Dossier patient n° ${data.patient.id}`;
  const doc = createDocument(title);

  drawHeader(doc, title);

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(
    `${data.patient.last_name.toUpperCase()} ${data.patient.first_name}`,
    MARGIN,
    doc.y,
  );
  doc.moveDown(0.3);
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(9)
    .text(`Né(e) le ${formatDate(data.patient.birth_date)} · Dossier créé le ${formatDate(data.patient.created_at)}`);
  doc.moveDown(0.8);

  sectionTitle(doc, 'Identité et coordonnées', title);
  field(doc, 'Nom et prénom', `${data.patient.last_name} ${data.patient.first_name}`, title);
  field(doc, 'Date de naissance', formatDate(data.patient.birth_date), title);
  field(
    doc,
    'Genre',
    data.patient.gender === 'FEMALE' ? 'Femme' : data.patient.gender === 'MALE' ? 'Homme' : 'Autre',
    title,
  );
  field(doc, 'Téléphone', data.patient.phone ?? '—', title);
  field(doc, 'Email', data.patient.email ?? '—', title);
  field(
    doc,
    'Adresse',
    [data.patient.address, data.patient.postal_code, data.patient.city].filter(Boolean).join(', ') || '—',
    title,
  );
  field(doc, 'Groupe sanguin', data.patient.blood_group ?? 'Inconnu', title);
  field(doc, 'N° d’assurance', data.patient.insurance_number ?? 'Non renseigné', title);
  field(
    doc,
    'Contact d’urgence',
    `${data.patient.emergency_contact_name ?? '—'} · ${data.patient.emergency_contact_phone ?? '—'}`,
    title,
  );

  sectionTitle(doc, 'Allergies et antécédents', title);
  paragraph(doc, `Allergies connues : ${data.patient.allergies ?? 'aucune allergie signalée'}`, title);
  paragraph(doc, `Antécédents médicaux : ${data.patient.medical_history ?? 'aucun antécédent renseigné'}`, title);

  sectionTitle(doc, 'Historique des rendez-vous', title);
  if (data.appointments.length === 0) {
    paragraph(doc, 'Aucun rendez-vous enregistré.', title);
  } else {
    drawTable(
      doc,
      [
        { header: 'Date', width: 24 },
        { header: 'Médecin', width: 30 },
        { header: 'Motif', width: 34 },
        { header: 'Statut', width: 18, align: 'right' },
      ],
      data.appointments.map((appointment) => [
        formatDateTime(appointment.scheduled_at),
        appointment.doctor_name ?? '—',
        appointment.reason ?? 'Sans motif',
        appointment.status,
      ]),
      title,
    );
  }

  sectionTitle(doc, 'Consultations', title);
  if (data.consultations.length === 0) {
    paragraph(doc, 'Aucune consultation enregistrée.', title);
  } else {
    for (const consultation of data.consultations) {
      ensureSpace(doc, 60, title);
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .text(`${formatDateTime(consultation.created_at)} — ${consultation.doctor_name ?? 'Médecin'}`);
      textBlock(doc, `Diagnostic : ${consultation.diagnosis}`, title, { fontSize: 9 });
      if (consultation.notes) {
        textBlock(doc, consultation.notes, title, { fontSize: 8.5, color: MUTED });
      }
      if (consultation.follow_up_at) {
        doc.fillColor(BRAND).fontSize(8.5).text(`Suivi prévu le ${formatDate(consultation.follow_up_at)}`);
      }
      doc.moveDown(0.7);
    }
  }

  sectionTitle(doc, 'Ordonnances', title);
  if (data.prescriptions.length === 0) {
    paragraph(doc, 'Aucune ordonnance enregistrée.', title);
  } else {
    for (const prescription of data.prescriptions) {
      ensureSpace(doc, 44, title);
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .text(`Ordonnance n° ${prescription.id} — ${formatDate(prescription.issued_at)} (${prescription.status})`);
      const items = prescription.items ?? [];
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8.5)
        .text(
          items.length > 0
            ? items.map((item) => `${item.medication_name ?? 'Médicament'} × ${item.quantity}`).join(' · ')
            : 'Aucun médicament',
          { width: CONTENT_WIDTH },
        );
      doc.moveDown(0.6);
    }
  }

  sectionTitle(doc, 'Factures', title);
  drawTable(
    doc,
    [
      { header: 'Numéro', width: 26 },
      { header: 'Émission', width: 24 },
      { header: 'Total TTC', width: 20, align: 'right' },
      { header: 'Payé', width: 18, align: 'right' },
      { header: 'Statut', width: 18, align: 'right' },
    ],
    data.invoices.map((invoice) => [
      invoice.number,
      formatDate(invoice.issued_at),
      formatMoney(invoice.total_amount),
      formatMoney(invoice.paid_amount),
      invoice.status,
    ]),
    title,
  );

  doc.moveDown(1);
  textBlock(doc, `Document généré par ${data.generatedBy}.`, title, {
    fontSize: 8,
    color: MUTED,
    italic: true,
  });

  drawFooters(doc, title);
  return toBuffer(doc);
}

/* -------------------------------------------------------------------------- */
/* Document 2 — Ordonnance                                                     */
/* -------------------------------------------------------------------------- */

export interface PrescriptionDocumentData {
  prescription: Prescription & {
    items: Array<{
      medication_name?: string;
      unit?: string;
      dosage: string;
      frequency: string;
      duration: string;
      instructions: string | null;
      quantity: number;
    }>;
    specialty_name?: string;
    license_number?: string;
    patient: Patient;
  };
  generatedBy: string;
}

export function generatePrescriptionPdf(data: PrescriptionDocumentData): Promise<Buffer> {
  const prescription = data.prescription;
  const title = `Ordonnance n° ${prescription.id}`;
  const doc = createDocument(title);

  drawHeader(doc, title);

  sectionTitle(doc, 'Prescripteur', title);
  field(doc, 'Médecin', prescription.doctor_name ?? '—', title);
  field(doc, 'Spécialité', prescription.specialty_name ?? '—', title);
  field(doc, 'N° d’ordre', prescription.license_number ?? '—', title);

  sectionTitle(doc, 'Patient', title);
  field(doc, 'Nom et prénom', `${prescription.patient.last_name} ${prescription.patient.first_name}`, title);
  field(doc, 'Date de naissance', formatDate(prescription.patient.birth_date), title);
  field(doc, 'Allergies', prescription.patient.allergies ?? 'Aucune connue', title);
  field(doc, 'Date de prescription', formatDate(prescription.issued_at), title);

  sectionTitle(doc, 'Prescription', title);
  drawTable(
    doc,
    [
      { header: 'Médicament', width: 30 },
      { header: 'Dosage', width: 16 },
      { header: 'Fréquence', width: 18 },
      { header: 'Durée', width: 14 },
      { header: 'Qté', width: 8, align: 'right' },
      { header: 'Instructions', width: 24 },
    ],
    prescription.items.map((item) => [
      item.medication_name ?? '—',
      item.dosage,
      item.frequency,
      item.duration,
      String(item.quantity),
      item.instructions ?? '—',
    ]),
    title,
  );

  doc.moveDown(1.4);
  ensureSpace(doc, 70, title);
  const signatureY = doc.y;
  doc
    .rect(PAGE_WIDTH - MARGIN - 190, signatureY, 190, 62)
    .lineWidth(0.6)
    .strokeColor(HAIRLINE)
    .stroke();
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text('Signature et cachet du prescripteur', PAGE_WIDTH - MARGIN - 185, signatureY + 5, {
      width: 180,
    });

  doc
    .fillColor(MUTED)
    .font('Helvetica-Oblique')
    .fontSize(7.5)
    .text(
      'Ordonnance valable 12 mois. Ne pas dépasser les doses prescrites. Conserver hors de portée des enfants.',
      MARGIN,
      signatureY + 70,
      { width: CONTENT_WIDTH },
    );

  drawFooters(doc, title);
  return toBuffer(doc);
}

/* -------------------------------------------------------------------------- */
/* Document 3 — Compte-rendu de consultation                                    */
/* -------------------------------------------------------------------------- */

export interface ConsultationDocumentData {
  consultation: Consultation & { patient_name?: string };
  patient: Patient;
  prescriptions: Array<Prescription & { items?: Array<{ medication_name?: string; quantity: number }> }>;
  generatedBy: string;
}

export function generateConsultationReportPdf(data: ConsultationDocumentData): Promise<Buffer> {
  const title = `Compte-rendu de consultation n° ${data.consultation.id}`;
  const doc = createDocument(title);

  drawHeader(doc, title);

  sectionTitle(doc, 'Patient', title);
  field(doc, 'Nom et prénom', `${data.patient.last_name} ${data.patient.first_name}`, title);
  field(doc, 'Date de naissance', formatDate(data.patient.birth_date), title);
  field(doc, 'Allergies', data.patient.allergies ?? 'Aucune connue', title);

  sectionTitle(doc, 'Consultation', title);
  field(doc, 'Date', formatDateTime(data.consultation.created_at), title);
  field(doc, 'Médecin', data.consultation.doctor_name ?? '—', title);

  sectionTitle(doc, 'Diagnostic', title);
  paragraph(doc, data.consultation.diagnosis, title);

  sectionTitle(doc, 'Observations', title);
  paragraph(doc, data.consultation.notes ?? 'Aucune observation complémentaire.', title);

  if (data.consultation.follow_up_at) {
    sectionTitle(doc, 'Suivi', title);
    paragraph(doc, `Consultation de suivi prévue le ${formatDate(data.consultation.follow_up_at)}.`, title);
  }

  sectionTitle(doc, 'Ordonnances associées', title);
  if (data.prescriptions.length === 0) {
    paragraph(doc, 'Aucune ordonnance associée.', title);
  } else {
    for (const prescription of data.prescriptions) {
      ensureSpace(doc, 30, title);
      const items = prescription.items ?? [];
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(`Ordonnance n° ${prescription.id} (${formatDate(prescription.issued_at)})`);
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8.5)
        .text(
          items.map((item) => `${item.medication_name ?? 'Médicament'} × ${item.quantity}`).join(' · ') ||
            'Aucun médicament',
          { width: CONTENT_WIDTH },
        );
      doc.moveDown(0.5);
    }
  }

  doc.moveDown(1.5);
  ensureSpace(doc, 60, title);
  const y = doc.y;
  doc.rect(PAGE_WIDTH - MARGIN - 190, y, 190, 58).lineWidth(0.6).strokeColor(HAIRLINE).stroke();
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text('Signature du médecin', PAGE_WIDTH - MARGIN - 185, y + 5, { width: 180 });

  drawFooters(doc, title);
  return toBuffer(doc);
}

/* -------------------------------------------------------------------------- */
/* Document 4 — Facture                                                        */
/* -------------------------------------------------------------------------- */

export interface InvoiceDocumentData {
  invoice: Invoice & { items: Array<{ label: string; quantity: number; unit_price: string; line_total: string }> };
  patient: Patient;
  payments: Array<{ amount: string; method: string; paid_at: string; reference: string | null }>;
  generatedBy: string;
}

export function generateInvoicePdf(data: InvoiceDocumentData): Promise<Buffer> {
  const invoice = data.invoice;
  const title = `Facture ${invoice.number}`;
  const doc = createDocument(title);

  drawHeader(doc, title);

  sectionTitle(doc, 'Facturation', title);
  field(doc, 'Numéro de facture', invoice.number, title);
  field(doc, 'Date d’émission', formatDate(invoice.issued_at), title);
  field(doc, 'Date d’échéance', formatDate(invoice.due_date), title);
  field(doc, 'Statut', invoice.status, title);

  sectionTitle(doc, 'Patient', title);
  field(doc, 'Nom et prénom', `${data.patient.last_name} ${data.patient.first_name}`, title);
  field(
    doc,
    'Adresse',
    [data.patient.address, data.patient.postal_code, data.patient.city].filter(Boolean).join(', ') || '—',
    title,
  );
  field(doc, 'Email', data.patient.email ?? '—', title);

  sectionTitle(doc, 'Détail des prestations', title);
  drawTable(
    doc,
    [
      { header: 'Libellé', width: 48 },
      { header: 'Qté', width: 8, align: 'right' },
      { header: 'Prix unitaire', width: 20, align: 'right' },
      { header: 'Total HT', width: 22, align: 'right' },
    ],
    invoice.items.map((item) => [
      item.label,
      String(item.quantity),
      formatMoney(item.unit_price),
      formatMoney(item.line_total),
    ]),
    title,
  );

  // Bloc des totaux, aligné à droite.
  ensureSpace(doc, 90, title);
  const subtotal = invoice.items.reduce((sum, item) => sum + Number(item.line_total), 0);
  const vatRate = Number(invoice.vat_rate);
  const vatAmount = (subtotal * vatRate) / 100;
  const total = subtotal + vatAmount;

  const totalsX = PAGE_WIDTH - MARGIN - 220;
  const rows: Array<[string, string, boolean]> = [
    ['Total HT', formatMoney(subtotal), false],
    [`TVA (${vatRate.toFixed(2)} %)`, formatMoney(vatAmount), false],
    ['Total TTC', formatMoney(total), true],
    ['Montant payé', formatMoney(invoice.paid_amount), false],
    ['Solde dû', formatMoney(total - Number(invoice.paid_amount)), true],
  ];

  let y = doc.y;
  for (const [label, value, strong] of rows) {
    doc
      .fillColor(strong ? INK : MUTED)
      .font(strong ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(9)
      .text(label, totalsX, y, { width: 120 })
      .text(value, totalsX + 120, y, { width: 100, align: 'right' });
    y += 15;
  }
  doc.y = y + 8;

  if (data.payments.length > 0) {
    sectionTitle(doc, 'Paiements enregistrés', title);
    drawTable(
      doc,
      [
        { header: 'Date', width: 30 },
        { header: 'Moyen', width: 22 },
        { header: 'Référence', width: 28 },
        { header: 'Montant', width: 20, align: 'right' },
      ],
      data.payments.map((payment) => [
        formatDateTime(payment.paid_at),
        payment.method,
        payment.reference ?? '—',
        formatMoney(payment.amount),
      ]),
      title,
    );
  }

  doc.moveDown(0.6);
  textBlock(
    doc,
    `TVA acquittée sur les encaissements. Règlement à effectuer avant le ${formatDate(invoice.due_date)}. ` +
      'Passé ce délai, des pénalités de retard peuvent être appliquées.',
    title,
    { fontSize: 7.5, color: MUTED },
  );

  drawFooters(doc, title);
  return toBuffer(doc);
}

/* -------------------------------------------------------------------------- */
/* Document 5 — Bon de dispensation                                            */
/* -------------------------------------------------------------------------- */

export interface DispensationDocumentData {
  prescription: Prescription & {
    items: Array<{
      medication_name?: string;
      unit?: string;
      quantity: number;
      dosage: string;
      duration: string;
      instructions: string | null;
    }>;
    patient: Patient;
    license_number?: string;
  };
  generatedBy: string;
}

export function generateDispensationSlipPdf(data: DispensationDocumentData): Promise<Buffer> {
  const prescription = data.prescription;
  const title = `Bon de dispensation — ordonnance n° ${prescription.id}`;
  const doc = createDocument(title);

  drawHeader(doc, title);

  sectionTitle(doc, 'Patient', title);
  field(doc, 'Nom et prénom', `${prescription.patient.last_name} ${prescription.patient.first_name}`, title);
  field(doc, 'Date de naissance', formatDate(prescription.patient.birth_date), title);
  field(doc, 'Allergies', prescription.patient.allergies ?? 'Aucune connue', title);

  sectionTitle(doc, 'Prescripteur', title);
  field(doc, 'Médecin', prescription.doctor_name ?? '—', title);
  field(doc, 'N° d’ordre', prescription.license_number ?? '—', title);

  sectionTitle(doc, 'Produits à délivrer', title);
  drawTable(
    doc,
    [
      { header: 'Médicament', width: 36 },
      { header: 'Dosage', width: 18 },
      { header: 'Durée', width: 16 },
      { header: 'Qté', width: 8, align: 'right' },
      { header: 'Dispensé', width: 12, align: 'center' },
    ],
    prescription.items.map((item) => [
      item.medication_name ?? '—',
      item.dosage,
      item.duration,
      String(item.quantity),
      '[ ]',
    ]),
    title,
  );

  if (prescription.items.some((item) => item.instructions)) {
    sectionTitle(doc, 'Instructions de prise', title);
    for (const item of prescription.items) {
      if (!item.instructions) continue;
      ensureSpace(doc, 16, title);
      doc
        .fillColor(INK)
        .font('Helvetica')
        .fontSize(8.5)
        .text(`• ${item.medication_name ?? 'Médicament'} : ${item.instructions}`, MARGIN, doc.y, {
          width: CONTENT_WIDTH,
        });
      doc.moveDown(0.3);
    }
  }

  sectionTitle(doc, 'Dispensation', title);
  field(doc, 'Pharmacien', '____________________________', title);
  field(doc, 'Date de délivrance', '____________________________', title);
  field(doc, 'Observations', '____________________________', title);

  doc.moveDown(1.2);
  textBlock(
    doc,
    'Les médicaments délivrés sont tracés dans le stock de la pharmacie. Conserver ce bon jusqu’à la fin du traitement.',
    title,
    { fontSize: 7.5, color: MUTED, italic: true },
  );

  drawFooters(doc, title);
  return toBuffer(doc);
}

/* -------------------------------------------------------------------------- */
/* Document 6 — Planning des gardes                                            */
/* -------------------------------------------------------------------------- */

export interface ShiftPlanningData {
  from: string;
  to: string;
  entries: Array<{
    shift_date: string;
    doctor_name: string;
    department_name: string;
    start_time: string;
    end_time: string;
    hours: string | number;
    type: string;
    status: string;
  }>;
  summary: Array<{ doctorName: string; shiftCount: number; hours: number }>;
  generatedBy: string;
}

export function generateShiftPlanningPdf(data: ShiftPlanningData): Promise<Buffer> {
  const title = `Planning des gardes du ${formatDate(data.from)} au ${formatDate(data.to)}`;
  const doc = createDocument(title);

  drawHeader(doc, title);

  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(
    `Période couverte : du ${formatDate(data.from)} au ${formatDate(data.to)} · ${data.entries.length} garde(s) planifiée(s)`,
  );
  doc.moveDown(0.8);

  sectionTitle(doc, 'Planning détaillé', title);
  if (data.entries.length === 0) {
    paragraph(doc, 'Aucune garde planifiée sur cette période.', title);
  } else {
    drawTable(
      doc,
      [
        { header: 'Date', width: 16 },
        { header: 'Médecin', width: 26 },
        { header: 'Département', width: 24 },
        { header: 'Horaires', width: 16 },
        { header: 'Durée', width: 8, align: 'right' },
        { header: 'Type', width: 10 },
      ],
      data.entries.map((entry) => [
        formatDate(entry.shift_date),
        entry.doctor_name,
        entry.department_name,
        `${entry.start_time} – ${entry.end_time}`,
        `${entry.hours} h`,
        entry.type,
      ]),
      title,
    );
  }

  sectionTitle(doc, 'Récapitulatif par médecin', title);
  if (data.summary.length === 0) {
    paragraph(doc, 'Aucune charge à récapituler.', title);
  } else {
    drawTable(
      doc,
      [
        { header: 'Médecin', width: 50 },
        { header: 'Gardes', width: 16, align: 'right' },
        { header: 'Total heures', width: 20, align: 'right' },
      ],
      data.summary.map((row) => [row.doctorName, String(row.shiftCount), `${row.hours} h`]),
      title,
    );
  }

  doc.moveDown(0.8);
  textBlock(
    doc,
    'Planning susceptible d’ajustements. Toute modification doit être validée par le chef de département concerné.',
    title,
    { fontSize: 7.5, color: MUTED, italic: true },
  );

  drawFooters(doc, title);
  return toBuffer(doc);
}
