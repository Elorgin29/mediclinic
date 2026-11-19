/**
 * Salle de visioconférence (Zoom Web SDK).
 *
 * Deux modes de fonctionnement :
 *  1. **Mode réel** — si `ZOOM_SDK_KEY` / `ZOOM_SDK_SECRET` sont configurés, le
 *     composant charge dynamiquement `@zoom/meetingsdk` depuis le CDN Zoom,
 *     demande une signature à l'API (`GET /api/meetings/:id/signature`) et
 *     démarre la réunion.
 *  2. **Mode simulé** — si le SDK n'est pas disponible (pas de dépendance
 *     installée, pas de credentials, ou CDN inaccessible), un panneau de
 *     démonstration s'affiche avec les informations de la réunion, le compte à
 *     rebours et un bouton de connexion factice. L'application reste utilisable
 *     pour la soutenance, sans réseau ni comptes Zoom.
 *
 * La signature est toujours demandée à l'API : elle est indispensable au SDK et
 * permet de vérifier côté serveur que l'utilisateur a le droit de se connecter.
 */

import { MEETING_JOIN_WINDOW_MINUTES, type MeetingSignature } from '@mediclinic/shared';
import { AlertTriangle, Loader2, LogOut, Mic, MicOff, PhoneOff, ScreenShare, Video, VideoOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge, Button, Modal } from '@/components/ui';
import { apiGet, getApiErrorMessage } from '@/lib/apiClient';
import { cn } from '@/lib/utils';

/** Fenêtre de connexion renvoyée par `GET /api/meetings/:id/join-token`. */
interface JoinToken {
  meetingNumber: string;
  password: string;
  joinUrl: string | null;
  role: 0 | 1;
  userName: string;
  expiresInMinutes: number;
  simulated: boolean;
}

interface MeetingRoomProps {
  meetingId: number;
  role: 0 | 1;
  title: string;
  onClose: () => void;
}

/** État du chargement du SDK. */
type SdkStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export function MeetingRoom({ meetingId, role, title, onClose }: MeetingRoomProps): JSX.Element {
  const [status, setStatus] = useState<SdkStatus>('idle');
  const [joinToken, setJoinToken] = useState<JoinToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInMeeting, setIsInMeeting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  /** Référence au client Zoom, conservée hors du rendu React. */
  const clientRef = useRef<{ init: (options: unknown) => Promise<void>; join: (options: unknown) => Promise<void>; leave: () => Promise<void> } | null>(null);

  /* ------------------------------------------------------------------ */
  /* Chargement du SDK depuis le CDN                                     */
  /* ------------------------------------------------------------------ */
  const loadSdk = useCallback(async (): Promise<boolean> => {
    // Le SDK est chargé depuis le CDN officiel : il n'est pas embarqué dans le
    // bundle, ce qui évite d'alourdir l'application pour tous les visiteurs.
    const globalWindow = window as unknown as { ZoomMtgEmbedded?: unknown };
    if (globalWindow.ZoomMtgEmbedded) return true;

    return new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://source.zoom.us/3.6.0/zoom-meeting-embedded-3.6.0.min.js';
      script.async = true;
      script.onload = () => resolve(Boolean((window as unknown as { ZoomMtgEmbedded?: unknown }).ZoomMtgEmbedded));
      script.onerror = () => resolve(false);
      // Un délai maximal évite de bloquer l'interface si le CDN ne répond pas.
      window.setTimeout(() => resolve(false), 8_000);
      document.head.appendChild(script);
    });
  }, []);

  /* ------------------------------------------------------------------ */
  /* Démarrage de la réunion                                             */
  /* ------------------------------------------------------------------ */
  const startMeeting = useCallback(async (): Promise<void> => {
    setError(null);
    setStatus('loading');

    try {
      // 1. Autorisation et fenêtre de connexion (contrôlées côté serveur).
      const token = await apiGet<JoinToken>(`/meetings/${meetingId}/join-token`);
      setJoinToken(token);

      // 2. Signature du Meeting SDK.
      const signature = await apiGet<MeetingSignature>(`/meetings/${meetingId}/signature?role=${role}`);

      // 3. Chargement du SDK.
      const available = await loadSdk();
      if (!available) {
        setStatus('unavailable');
        toast.info('SDK Zoom indisponible : passage en mode démonstration.');
        setIsInMeeting(true);
        return;
      }

      const ZoomEmbedded = (window as unknown as {
        ZoomMtgEmbedded: { createClient: () => unknown };
      }).ZoomMtgEmbedded;

      const client = ZoomEmbedded.createClient() as unknown as {
        init: (options: unknown) => Promise<void>;
        join: (options: unknown) => Promise<void>;
        leave: () => Promise<void>;
      };
      clientRef.current = client;

      await client.init({
        zoomAppRoot: containerRef.current ?? undefined,
        language: 'fr-FR',
        customize: {
          video: { isResizable: true, viewSizes: { default: { width: '100%', height: 420 } } },
        },
      });

      await client.join({
        signature: signature.signature,
        sdkKey: signature.sdkKey,
        meetingNumber: signature.meetingNumber,
        password: token.password || signature.password || '',
        userName: signature.userName,
      });

      setStatus('ready');
      setIsInMeeting(true);
    } catch (caught) {
      const message = getApiErrorMessage(caught);
      setError(message);
      setStatus('unavailable');
      toast.error(message);
    }
  }, [meetingId, role, loadSdk]);

  /* ------------------------------------------------------------------ */
  /* Nettoyage                                                           */
  /* ------------------------------------------------------------------ */
  const leaveMeeting = async (): Promise<void> => {
    try {
      await clientRef.current?.leave();
    } catch {
      // La sortie doit rester possible même si le SDK échoue.
    }
    setIsInMeeting(false);
    onClose();
  };

  useEffect(() => {
    return () => {
      // Sortie silencieuse si le composant est démonté pendant la réunion.
      void clientRef.current?.leave().catch(() => undefined);
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /* Rendu                                                               */
  /* ------------------------------------------------------------------ */
  return (
    <Modal
      isOpen
      onClose={() => void leaveMeeting()}
      title={title}
      size="xl"
      isBusy={status === 'loading'}
      footer={
        <>
          <Button variant="secondary" onClick={() => void leaveMeeting()}>
            Fermer
          </Button>
          {status !== 'ready' && status !== 'unavailable' && (
            <Button onClick={() => void startMeeting()} isLoading={status === 'loading'} leftIcon={<Video className="h-4 w-4" />}>
              Rejoindre la réunion
            </Button>
          )}
          {isInMeeting && (
            <Button variant="danger" onClick={() => void leaveMeeting()} leftIcon={<PhoneOff className="h-4 w-4" />}>
              Quitter
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Zone vidéo ou panneau de démonstration */}
        {status === 'idle' && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-slate-50 py-16 text-center dark:bg-slate-800/50">
            <span className="rounded-full bg-brand-100 p-4 text-brand-700 dark:bg-brand-900 dark:text-brand-300">
              <Video className="h-7 w-7" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Prêt à rejoindre la téléconsultation
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                Le bouton de connexion s’active {MEETING_JOIN_WINDOW_MINUTES} minutes avant l’heure prévue.
                Vérifiez votre caméra et votre microphone avant de commencer.
              </p>
            </div>
          </div>
        )}

        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-slate-50 py-16 dark:bg-slate-800/50">
            <Loader2 className="h-8 w-8 animate-spin text-brand-700" aria-hidden />
            <p className="text-sm text-slate-600 dark:text-slate-300">Connexion à la salle en cours…</p>
          </div>
        )}

        {/* Conteneur du SDK (toujours monté pour permettre l'initialisation) */}
        <div ref={containerRef} className={cn('overflow-hidden rounded-xl', status !== 'ready' && 'hidden')} />

        {/* Mode démonstration */}
        {status === 'unavailable' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Mode démonstration</p>
                <p className="mt-0.5">
                  {error ??
                    'Le SDK Zoom n’est pas disponible dans cet environnement. Les informations de la réunion restent accessibles et l’interface est pleinement démontrable.'}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-900 p-6">
              <div className="flex items-center justify-between">
                <Badge tone="success" dot>
                  Connecté (simulation)
                </Badge>
                <p className="font-mono text-xs text-slate-400">
                  Réunion {joinToken?.meetingNumber ?? '—'}
                </p>
              </div>

              {/* Vignettes simulées */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="flex h-40 flex-col items-center justify-center rounded-lg bg-slate-800 text-slate-400">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-lg font-bold text-white">
                    {role === 1 ? 'DR' : 'PA'}
                  </span>
                  <p className="mt-2 text-xs">{joinToken?.userName ?? 'Vous'}</p>
                </div>
                <div className="flex h-40 flex-col items-center justify-center rounded-lg bg-slate-800 text-slate-500">
                  <Video className="h-8 w-8" aria-hidden />
                  <p className="mt-2 text-xs">En attente du participant…</p>
                </div>
              </div>

              {/* Barre de contrôles */}
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMuted((value) => !value)}
                  aria-label={isMuted ? 'Réactiver le microphone' : 'Couper le microphone'}
                  className={cn(
                    'rounded-full p-3 text-white transition-colors',
                    isMuted ? 'bg-rose-600' : 'bg-slate-700 hover:bg-slate-600',
                  )}
                >
                  {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsVideoOff((value) => !value)}
                  aria-label={isVideoOff ? 'Activer la caméra' : 'Couper la caméra'}
                  className={cn(
                    'rounded-full p-3 text-white transition-colors',
                    isVideoOff ? 'bg-rose-600' : 'bg-slate-700 hover:bg-slate-600',
                  )}
                >
                  {isVideoOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  aria-label="Partager l’écran"
                  className="rounded-full bg-slate-700 p-3 text-white hover:bg-slate-600"
                >
                  <ScreenShare className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void leaveMeeting()}
                  aria-label="Quitter la réunion"
                  className="rounded-full bg-rose-600 p-3 text-white hover:bg-rose-700"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>

            {joinToken?.joinUrl && (
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                Lien Zoom :{' '}
                <a href={joinToken.joinUrl} target="_blank" rel="noreferrer" className="link">
                  {joinToken.joinUrl}
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
