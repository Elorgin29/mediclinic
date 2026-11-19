/**
 * Téléchargement et ouverture des PDF produits par l'API.
 *
 * Le jeton d'accès est indispensable : on ne peut donc pas simplement pointer
 * un `<a href>` vers l'API. Deux stratégies sont proposées :
 *  - `downloadPdf()` récupère le binaire via axios (avec l'en-tête
 *    d'autorisation) puis déclenche le téléchargement ;
 *  - `openPdfInNewTab()` fait la même chose mais ouvre le document dans un
 *    nouvel onglet, ce qui permet de l'imprimer directement.
 */

import { toast } from 'sonner';

import { API_BASE_URL, api, getApiErrorMessage } from './apiClient';

/** Extrait le nom de fichier d'un en-tête `Content-Disposition`. */
function filenameFromHeader(header: unknown, fallback: string): string {
  if (typeof header !== 'string') return fallback;

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);

  const simpleMatch = /filename="?([^";]+)"?/i.exec(header);
  return simpleMatch?.[1] ?? fallback;
}

/** Récupère un PDF auprès de l'API. */
async function fetchPdf(path: string, method: 'GET' | 'POST' = 'GET'): Promise<{ blob: Blob; filename: string }> {
  const response = await api.request<Blob>({
    url: path,
    method,
    responseType: 'blob',
    headers: { Accept: 'application/pdf' },
  });

  return {
    blob: response.data,
    filename: filenameFromHeader(response.headers['content-disposition'], 'document-mediclinic.pdf'),
  };
}

/** Télécharge un PDF sur le poste de l'utilisateur. */
export async function downloadPdf(path: string, method: 'GET' | 'POST' = 'GET', fallbackName?: string): Promise<void> {
  try {
    const { blob, filename } = await fetchPdf(path, method);
    triggerDownload(blob, fallbackName ?? filename);
  } catch (error) {
    toast.error(getApiErrorMessage(error));
  }
}

/** Ouvre un PDF dans un nouvel onglet (impression immédiate possible). */
export async function openPdfInNewTab(path: string, method: 'GET' | 'POST' = 'GET'): Promise<void> {
  try {
    const { blob } = await fetchPdf(path, method);
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');

    if (!opened) {
      // Le navigateur a bloqué la fenêtre : on propose le téléchargement.
      triggerDownload(blob, 'document-mediclinic.pdf');
      toast.info('Ouverture bloquée par le navigateur : le document a été téléchargé.');
    }

    // L'URL est libérée dès que l'onglet a eu le temps de charger le document.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    toast.error(getApiErrorMessage(error));
  }
}

/** Déclenche le téléchargement d'un blob. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** URL absolue d'un document (utile pour un lien direct ou un QR code). */
export function pdfUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/* -------------------------------------------------------------------------- */
/* Raccourcis par type de document                                             */
/* -------------------------------------------------------------------------- */

export const pdf = {
  patientRecord: (patientId: number) => `/pdf/patient/${patientId}`,
  prescription: (prescriptionId: number) => `/pdf/prescription/${prescriptionId}`,
  dispensation: (prescriptionId: number) => `/pdf/dispensation/${prescriptionId}`,
  consultation: (consultationId: number) => `/pdf/consultation/${consultationId}`,
  invoice: (invoiceId: number) => `/pdf/invoice/${invoiceId}`,
  shiftPlanning: (from: string, to: string) => `/pdf/shifts/planning?from=${from}&to=${to}`,
  invoicePost: (invoiceId: number) => `/invoices/${invoiceId}/pdf`,
  consultationPost: (consultationId: number) => `/consultations/${consultationId}/pdf`,
};
