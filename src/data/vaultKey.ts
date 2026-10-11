import { VaultLockedError } from './errors';

/** La clave de datos vive solo en memoria mientras la app está desbloqueada. */
let dek: CryptoKey | null = null;
const lockListeners = new Set<() => void>();

export function setDek(key: CryptoKey | null) {
  dek = key;
  if (!key) for (const l of lockListeners) l();
}

export function getDek(): CryptoKey {
  if (!dek) throw new VaultLockedError();
  return dek;
}

export function hasDek(): boolean {
  return dek !== null;
}

export function onLock(listener: () => void): () => void {
  lockListeners.add(listener);
  return () => lockListeners.delete(listener);
}
