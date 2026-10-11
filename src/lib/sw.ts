import { useUiState } from './uiState';
import { flushAll } from './flush';

let updater: ((reload?: boolean) => Promise<void>) | null = null;

/** Registra el service worker (solo en producción). Las actualizaciones se aplican cuando la usuaria lo decide. */
export function setupServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void import('virtual:pwa-register').then(({ registerSW }) => {
    updater = registerSW({
      immediate: true,
      onNeedRefresh() {
        useUiState.setState({ updateReady: true });
      },
      onRegisteredSW(_url, reg) {
        // Busca actualizaciones cada hora mientras la app está abierta.
        if (reg) setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
      },
    });
  });
}

export async function applyUpdate() {
  await flushAll();
  await updater?.(true);
}
