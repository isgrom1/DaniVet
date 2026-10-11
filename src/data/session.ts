import * as C from '@/lib/crypto';
import { deleteMeta, getMeta, requestPersistence, setMeta, wipeAll } from '@/lib/idb';
import { batch, loadAll } from './repo';
import { defaultSettings, defaultSpecies, defaultTemplates } from './defaults';
import { emptyTables, useDataStore } from './store';
import { getDek, hasDek, setDek } from './vaultKey';

const VAULT_KEY = 'vault';
const PIN_KEY = 'pinSession';
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_SESSION_DAYS = 14;

interface PinSession {
  key: CryptoKey;
  verifier: C.PinVerifier;
  createdAt: string;
  expiresAt: string;
  failed: number;
}

export class PinLockedOutError extends Error {
  constructor() {
    super('Demasiados intentos con PIN. Por seguridad, ingresa tu contraseña.');
    this.name = 'PinLockedOutError';
  }
}

export async function readVaultHeader(): Promise<C.VaultHeader | undefined> {
  return getMeta<C.VaultHeader>(VAULT_KEY);
}

export async function refreshVaultStatus(): Promise<void> {
  const header = await readVaultHeader();
  if (hasDek()) return;
  useDataStore.setState({ status: header ? 'locked' : 'none' });
}

export interface AccountInit {
  fullName: string;
  title: string;
  email?: string;
  phone?: string;
}

/** Crea la cuenta local cifrada en este dispositivo y devuelve la clave de recuperación (se muestra una sola vez). */
export async function createAccount(passphrase: string, init: AccountInit, iterations?: number): Promise<string> {
  if (await readVaultHeader()) throw new Error('Ya existe una cuenta en este dispositivo.');
  const vault = await C.createVault(passphrase, iterations);
  await setMeta(VAULT_KEY, vault.header);
  setDek(vault.dek);
  useDataStore.setState({ tables: emptyTables(), status: 'ready', loadIssues: 0 });
  const b = batch();
  b.insert(
    'profile',
    {
      id: 'profile',
      fullName: init.fullName.trim(),
      title: init.title.trim() || 'Médica Veterinaria',
      email: init.email?.trim() || undefined,
      phone: init.phone?.trim() || undefined,
      appName: 'VetCasa',
      paperSize: 'letter',
    },
    { audit: false },
  );
  b.insert('settings', defaultSettings(), { audit: false });
  for (const s of defaultSpecies()) b.insert('species', s);
  for (const t of defaultTemplates()) b.insert('templates', t);
  await b.commit();
  await setMeta('accountCreatedAt', new Date().toISOString());
  void requestPersistence();
  return vault.recoveryKey;
}

export async function unlockWithPassphrase(passphrase: string): Promise<void> {
  const header = await readVaultHeader();
  if (!header) throw new Error('No hay una cuenta en este dispositivo.');
  const dek = await C.unlockWithPassphrase(header, passphrase);
  setDek(dek);
  await loadAll();
  void requestPersistence();
}

/** Recupera el acceso con la clave de recuperación y define una nueva contraseña. */
export async function recoverWithKey(recoveryKey: string, newPassphrase: string): Promise<void> {
  const header = await readVaultHeader();
  if (!header) throw new Error('No hay una cuenta en este dispositivo.');
  const dek = await C.unlockWithRecoveryKey(header, recoveryKey);
  const newHeader = await C.rewrapPassphrase(header, { recoveryKey }, newPassphrase);
  await setMeta(VAULT_KEY, newHeader);
  await deleteMeta(PIN_KEY);
  setDek(dek);
  await loadAll();
}

export async function changePassphrase(current: string, next: string): Promise<void> {
  const header = await readVaultHeader();
  if (!header) throw new Error('No hay una cuenta en este dispositivo.');
  const newHeader = await C.rewrapPassphrase(header, { passphrase: current }, next);
  await setMeta(VAULT_KEY, newHeader);
}

export async function regenerateRecovery(passphrase: string): Promise<string> {
  const header = await readVaultHeader();
  if (!header) throw new Error('No hay una cuenta en este dispositivo.');
  const res = await C.regenerateRecoveryKey(header, passphrase);
  await setMeta(VAULT_KEY, res.header);
  return res.recoveryKey;
}

export async function verifyPassphrase(passphrase: string): Promise<boolean> {
  const header = await readVaultHeader();
  return header ? C.verifyPassphrase(header, passphrase) : false;
}

export function lock(): void {
  setDek(null);
  useDataStore.setState({ tables: emptyTables(), status: 'locked', loadIssues: 0 });
}

// ---------- PIN de desbloqueo rápido (opcional) ----------
export async function hasPinSession(): Promise<boolean> {
  const s = await getMeta<PinSession>(PIN_KEY);
  if (!s) return false;
  if (Date.parse(s.expiresAt) < Date.now()) {
    await deleteMeta(PIN_KEY);
    return false;
  }
  return true;
}

export async function enablePin(pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('El PIN debe tener entre 4 y 8 dígitos.');
  const verifier = await C.makePinVerifier(pin);
  const now = new Date();
  const expires = new Date(now.getTime() + PIN_SESSION_DAYS * 86_400_000);
  const session: PinSession = { key: getDek(), verifier, createdAt: now.toISOString(), expiresAt: expires.toISOString(), failed: 0 };
  await setMeta(PIN_KEY, session);
}

export async function disablePin(): Promise<void> {
  await deleteMeta(PIN_KEY);
}

export async function unlockWithPin(pin: string): Promise<void> {
  const s = await getMeta<PinSession>(PIN_KEY);
  if (!s || Date.parse(s.expiresAt) < Date.now()) {
    await deleteMeta(PIN_KEY);
    throw new PinLockedOutError();
  }
  const ok = await C.checkPin(s.verifier, pin);
  if (!ok) {
    const failed = s.failed + 1;
    if (failed >= PIN_MAX_ATTEMPTS) {
      await deleteMeta(PIN_KEY);
      throw new PinLockedOutError();
    }
    await setMeta(PIN_KEY, { ...s, failed });
    throw new C.WrongSecretError(`PIN incorrecto. Te quedan ${PIN_MAX_ATTEMPTS - failed} intento(s).`);
  }
  if (s.failed) await setMeta(PIN_KEY, { ...s, failed: 0 });
  setDek(s.key);
  await loadAll();
}

export async function pinSessionInfo(): Promise<{ expiresAt: string } | null> {
  const s = await getMeta<PinSession>(PIN_KEY);
  return s ? { expiresAt: s.expiresAt } : null;
}

/** Elimina TODOS los datos de este dispositivo. Irreversible. */
export async function wipeDevice(): Promise<void> {
  setDek(null);
  await wipeAll();
  useDataStore.setState({ tables: emptyTables(), status: 'none', loadIssues: 0 });
}

export { getDek };
