/**
 * Intégration Zoom.
 *
 * Deux mécanismes distincts sont utilisés :
 *  1. **Zoom REST API v2 en Server-to-Server OAuth** pour créer et supprimer
 *     les réunions (côté serveur, avec `ZOOM_ACCOUNT_ID` / `CLIENT_ID` /
 *     `CLIENT_SECRET`).
 *  2. **Meeting SDK** côté navigateur : le back génère une signature JWT
 *     (`ZOOM_SDK_KEY` / `ZOOM_SDK_SECRET`) que le front passe au SDK.
 *
 * MODE DÉGRADÉ : si les identifiants sont absents — cas de cette installation
 * de démonstration — toutes les fonctions renvoient des données **simulées**
 * cohérentes. L'application reste donc entièrement fonctionnelle hors ligne,
 * ce qui correspond aux « 5 réunions Zoom simulées » du jeu de données.
 */

import { MEETING_JOIN_WINDOW_MINUTES, type MeetingSignature } from '@mediclinic/shared';
import jwt from 'jsonwebtoken';

import { env } from './env.js';

/** Indique si les identifiants Server-to-Server OAuth sont renseignés. */
export function isZoomConfigured(): boolean {
  return env.zoomEnabled;
}

/** Indique si les identifiants du Meeting SDK sont renseignés. */
export function isZoomSdkConfigured(): boolean {
  return env.ZOOM_SDK_KEY !== '' && env.ZOOM_SDK_SECRET !== '';
}

/** Réunion Zoom telle que manipulée par l'application. */
export interface ZoomMeeting {
  /** Identifiant numérique de la réunion (11 chiffres en général). */
  id: string;
  topic: string;
  join_url: string;
  start_url: string;
  password: string;
  start_time: string;
  duration: number;
  simulated: boolean;
}

export interface CreateZoomMeetingInput {
  topic: string;
  /** Date/heure de début au format MySQL (`AAAA-MM-JJ HH:MM:SS`). */
  startTime: string;
  duration: number;
  agenda?: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;
let degradedWarningEmitted = false;

/** Avertit une seule fois que l'on fonctionne en mode simulé. */
function warnDegraded(): void {
  if (degradedWarningEmitted) return;
  degradedWarningEmitted = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[zoom] Identifiants Zoom absents : les téléconsultations sont SIMULÉES. ' +
      'Renseignez ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET dans .env pour activer Zoom.',
  );
}

/**
 * Récupère un jeton d'accès Server-to-Server OAuth.
 * Le jeton est mis en cache jusqu'à 60 secondes avant son expiration.
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.value;

  const credentials = Buffer.from(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(
      env.ZOOM_ACCOUNT_ID,
    )}`,
    { method: 'POST', headers: { Authorization: `Basic ${credentials}` } },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Zoom OAuth a répondu ${response.status} : ${body}`);
  }

  const payload = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: payload.access_token,
    expiresAt: now + Math.max(payload.expires_in - 60, 30) * 1000,
  };
  return cachedToken.value;
}

/** Génère un identifiant de réunion simulé (11 chiffres, comme Zoom). */
function simulatedMeetingId(): string {
  const part = () => String(Math.floor(Math.random() * 900) + 100);
  return `8${part()}${part()}${part()}`.slice(0, 11);
}

/**
 * Crée une réunion Zoom.
 * En l'absence d'identifiants, renvoie une réunion simulée déterministe.
 */
export async function createZoomMeeting(input: CreateZoomMeetingInput): Promise<ZoomMeeting> {
  if (!isZoomConfigured()) {
    warnDegraded();
    const id = simulatedMeetingId();
    return {
      id,
      topic: input.topic,
      join_url: `https://zoom.us/j/${id}`,
      start_url: `https://zoom.us/s/${id}`,
      password: Math.random().toString(36).slice(2, 8),
      start_time: input.startTime,
      duration: input.duration,
      simulated: true,
    };
  }

  const token = await getAccessToken();
  const response = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(env.ZOOM_USER_ID)}/meetings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic: input.topic,
      type: 2, // réunion planifiée
      start_time: input.startTime.replace(' ', 'T'),
      duration: input.duration,
      timezone: 'Europe/Paris',
      agenda: input.agenda,
      settings: {
        join_before_host: true,
        waiting_room: false,
        approval_type: 2,
        audio: 'both',
        auto_recording: 'none',
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Zoom a refusé la création de la réunion (${response.status}) : ${body}`);
  }

  const payload = (await response.json()) as {
    id: number;
    topic: string;
    join_url: string;
    start_url: string;
    password?: string;
    start_time: string;
    duration: number;
  };

  return {
    id: String(payload.id),
    topic: payload.topic,
    join_url: payload.join_url,
    start_url: payload.start_url,
    password: payload.password ?? '',
    start_time: payload.start_time,
    duration: payload.duration,
    simulated: false,
  };
}

/** Supprime une réunion Zoom. Silencieux en mode simulé. */
export async function deleteZoomMeeting(meetingId: string): Promise<void> {
  if (!isZoomConfigured()) return;

  const token = await getAccessToken();
  const response = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  // 404 = réunion déjà supprimée : ce n'est pas une erreur pour l'application.
  if (!response.ok && response.status !== 404) {
    const body = await response.text();
    throw new Error(`Zoom a refusé la suppression (${response.status}) : ${body}`);
  }
}

/**
 * Génère la signature attendue par le Zoom Meeting SDK.
 *
 * @param meetingNumber identifiant de la réunion
 * @param role          `0` = participant, `1` = hôte
 * @param userName      nom affiché dans la réunion
 */
export function generateZoomSignature(
  meetingNumber: string,
  role: 0 | 1,
  userName: string,
): MeetingSignature {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 60 * 60 * 2; // 2 heures

  // En mode simulé, la signature est produite avec un secret de développement :
  // elle n'est pas acceptée par Zoom, mais le SDK est bien chargé côté front et
  // l'écran de démonstration reste utilisable.
  const secret = isZoomSdkConfigured() ? env.ZOOM_SDK_SECRET : 'mediclinic-simulated-sdk-secret';
  const sdkKey = isZoomSdkConfigured() ? env.ZOOM_SDK_KEY : 'mediclinic-simulated-sdk-key';

  const signature = jwt.sign(
    {
      sdkKey,
      appKey: sdkKey,
      mn: meetingNumber,
      role,
      iat: now,
      exp: now + expiresIn,
      tokenExp: now + expiresIn,
    },
    secret,
    { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT' } },
  );

  return {
    signature,
    meetingNumber,
    password: '',
    userName,
    role,
    sdkKey,
  };
}

/**
 * La fenêtre de connexion est-elle ouverte ?
 * Un participant peut rejoindre de `MEETING_JOIN_WINDOW_MINUTES` avant le début
 * jusqu'à la fin prévue de la réunion.
 */
export function isJoinWindowOpen(
  startTime: string | Date | null,
  duration: number,
  reference: Date = new Date(),
): boolean {
  if (!startTime) return false;

  const start = startTime instanceof Date ? startTime : new Date(String(startTime).replace(' ', 'T'));
  if (Number.isNaN(start.getTime())) return false;

  const opensAt = start.getTime() - MEETING_JOIN_WINDOW_MINUTES * 60_000;
  const closesAt = start.getTime() + duration * 60_000;
  return reference.getTime() >= opensAt && reference.getTime() <= closesAt;
}

/** Message d'aide affiché dans l'interface lorsque Zoom est simulé. */
export function zoomModeLabel(): string {
  return isZoomConfigured() ? 'Zoom (Server-to-Server OAuth)' : 'Zoom simulé (mode démonstration)';
}
