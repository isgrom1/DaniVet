import { useUiState } from './uiState';
import { flushAll } from './flush';
import { useDataStore } from '@/data/store';

let updater: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let lastCheck = 0;
let applying = false;

/**
 * Registra el service worker (solo en producción) y mantiene la app al día sin intervención:
 * - Busca una versión nueva al abrir la app, al volver a ella y cada hora.
 * - Si la app está bloqueada (pantalla de contraseña: no hay nada abierto), la versión nueva se instala sola.
 * - Si está en uso, se muestra el aviso "Actualizar ahora"; si no se toca, se instala al bloquearse
 *   (bloqueo automático o manual), después de guardar lo que estaba abierto.
 */
export function setupServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void import('virtual:pwa-register').then(({ registerSW }) => {
    updater = registerSW({
      immediate: true,
      onNeedRefresh() {
        useUiState.setState({ updateReady: true });
        if (useDataStore.getState().status === 'locked') void applyUpdate();
      },
      onRegisteredSW(_url, reg) {
        registration = reg;
        if (reg) setInterval(() => void checkForUpdate(), 60 * 60 * 1000);
      },
    });
  });
  // iOS mantiene la app suspendida en segundo plano: al volver a ella se revisa si hay versión nueva.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate(10 * 60 * 1000);
  });
  useDataStore.subscribe((s, prev) => {
    if (s.status === 'locked' && prev.status !== 'locked' && useUiState.getState().updateReady) void applyUpdate();
  });
}

export type UpdateCheck = 'available' | 'current' | 'offline' | 'unsupported';

/** Busca una versión nueva en el servidor y espera a que termine de descargarse. */
export async function checkForUpdate(minIntervalMs = 0): Promise<UpdateCheck> {
  if (!registration) return 'unsupported';
  if (useUiState.getState().updateReady) return 'available';
  if (Date.now() - lastCheck < minIntervalMs) return 'current';
  lastCheck = Date.now();
  try {
    await registration.update();
  } catch {
    return 'offline';
  }
  const sw = registration.installing ?? registration.waiting;
  if (!sw) return 'current';
  if (sw.state === 'installing') {
    await new Promise<void>((resolve) => {
      const done = () => {
        if (sw.state !== 'installing') {
          sw.removeEventListener('statechange', done);
          resolve();
        }
      };
      sw.addEventListener('statechange', done);
      setTimeout(resolve, 30_000);
    });
  }
  return registration.waiting ? 'available' : 'current';
}

/** Guarda lo que esté abierto e instala la versión nueva (la app se recarga). */
export async function applyUpdate() {
  if (applying) return;
  applying = true;
  setTimeout(() => {
    applying = false;
  }, 15_000);
  await flushAll();
  await updater?.(true);
}
