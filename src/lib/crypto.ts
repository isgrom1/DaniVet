/**
 * Criptografía local de la app (WebCrypto, sin dependencias externas).
 *
 * Esquema:
 * - Se genera una clave de datos (DEK) aleatoria de 256 bits al crear la cuenta.
 * - La DEK se guarda "envuelta" (cifrada con AES-GCM) dos veces:
 *     1) con una clave derivada de la contraseña (PBKDF2-SHA256, 600.000 iteraciones);
 *     2) con una clave derivada de la clave de recuperación (160 bits aleatorios).
 * - Cada registro y cada archivo se cifra con AES-256-GCM usando la DEK, IV aleatorio de 96 bits
 *   y datos asociados (AAD) que lo vinculan a su tabla e identificador.
 */

import { APP_SLUG } from './platform';

const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITERATIONS = 600_000;
export const RECOVERY_KDF_ITERATIONS = 100_000;
export const PIN_KDF_ITERATIONS = 150_000;
const DEK_AAD = 'vetcasa:dek:v1';

export class WrongSecretError extends Error {
  constructor(message = 'Contraseña o clave incorrecta') {
    super(message);
    this.name = 'WrongSecretError';
  }
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(b);
  return b;
}

export function toB64(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface WrappedKey {
  salt: string;
  iterations: number;
  iv: string;
  ct: string;
}

export interface VaultHeader {
  v: 1;
  createdAt: string;
  pass: WrappedKey;
  recovery: WrappedKey;
}

function normalizeSecret(secret: string): string {
  return secret.normalize('NFC');
}

async function deriveKek(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(normalizeSecret(secret)), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function wrapRaw(rawDek: Uint8Array<ArrayBuffer>, secret: string, iterations: number): Promise<WrappedKey> {
  const salt = randomBytes(16);
  const kek = await deriveKek(secret, salt, iterations);
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(DEK_AAD) }, kek, rawDek);
  return { salt: toB64(salt), iterations, iv: toB64(iv), ct: toB64(ct) };
}

async function unwrapRaw(w: WrappedKey, secret: string): Promise<Uint8Array<ArrayBuffer>> {
  const kek = await deriveKek(secret, fromB64(w.salt), w.iterations);
  try {
    const raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(w.iv), additionalData: enc.encode(DEK_AAD) },
      kek,
      fromB64(w.ct),
    );
    return new Uint8Array(raw);
  } catch {
    throw new WrongSecretError();
  }
}

export async function importDek(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ---------- Clave de recuperación (Crockford base32, 32 caracteres en 8 grupos) ----------
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateRecoveryKey(): string {
  const bytes = randomBytes(20); // 160 bits
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g)!.join('-');
}

export function normalizeRecoveryKey(input: string): string {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V');
  return cleaned.match(/.{1,4}/g)?.join('-') ?? '';
}

export function isPlausibleRecoveryKey(input: string): boolean {
  const n = normalizeRecoveryKey(input).replace(/-/g, '');
  return n.length === 32 && [...n].every((c) => B32.includes(c));
}

// ---------- Ciclo de vida de la bóveda ----------
export interface NewVault {
  header: VaultHeader;
  dek: CryptoKey;
  recoveryKey: string;
}

export async function createVault(passphrase: string, iterations = KDF_ITERATIONS): Promise<NewVault> {
  const raw = randomBytes(32);
  const recoveryKey = generateRecoveryKey();
  const [pass, recovery, dek] = await Promise.all([
    wrapRaw(raw, passphrase, iterations),
    wrapRaw(raw, normalizeRecoveryKey(recoveryKey), RECOVERY_KDF_ITERATIONS),
    importDek(raw),
  ]);
  raw.fill(0);
  return { header: { v: 1, createdAt: new Date().toISOString(), pass, recovery }, dek, recoveryKey };
}

export async function unlockWithPassphrase(header: VaultHeader, passphrase: string): Promise<CryptoKey> {
  const raw = await unwrapRaw(header.pass, passphrase);
  const dek = await importDek(raw);
  raw.fill(0);
  return dek;
}

export async function unlockWithRecoveryKey(header: VaultHeader, recoveryKey: string): Promise<CryptoKey> {
  const raw = await unwrapRaw(header.recovery, normalizeRecoveryKey(recoveryKey));
  const dek = await importDek(raw);
  raw.fill(0);
  return dek;
}

/** Cambia la contraseña. `current` puede ser la contraseña actual o la clave de recuperación. */
export async function rewrapPassphrase(
  header: VaultHeader,
  current: { passphrase?: string; recoveryKey?: string },
  newPassphrase: string,
  iterations = KDF_ITERATIONS,
): Promise<VaultHeader> {
  const raw = current.recoveryKey
    ? await unwrapRaw(header.recovery, normalizeRecoveryKey(current.recoveryKey))
    : await unwrapRaw(header.pass, current.passphrase ?? '');
  const pass = await wrapRaw(raw, newPassphrase, iterations);
  raw.fill(0);
  return { ...header, pass };
}

export async function regenerateRecoveryKey(
  header: VaultHeader,
  passphrase: string,
): Promise<{ header: VaultHeader; recoveryKey: string }> {
  const raw = await unwrapRaw(header.pass, passphrase);
  const recoveryKey = generateRecoveryKey();
  const recovery = await wrapRaw(raw, normalizeRecoveryKey(recoveryKey), RECOVERY_KDF_ITERATIONS);
  raw.fill(0);
  return { header: { ...header, recovery }, recoveryKey };
}

export async function verifyPassphrase(header: VaultHeader, passphrase: string): Promise<boolean> {
  try {
    const raw = await unwrapRaw(header.pass, passphrase);
    raw.fill(0);
    return true;
  } catch {
    return false;
  }
}

// ---------- Cifrado de registros y archivos ----------
export interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
}

export async function sealJson(dek: CryptoKey, aad: string, value: unknown): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    dek,
    enc.encode(JSON.stringify(value)),
  );
  return { iv, ct };
}

export async function openJson<T = unknown>(dek: CryptoKey, aad: string, sealed: Sealed): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: sealed.iv, additionalData: enc.encode(aad) },
    dek,
    sealed.ct,
  );
  return JSON.parse(dec.decode(pt)) as T;
}

export async function sealBytes(dek: CryptoKey, aad: string, data: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, dek, data);
  return { iv, ct };
}

export async function openBytes(dek: CryptoKey, aad: string, sealed: Sealed): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv, additionalData: enc.encode(aad) }, dek, sealed.ct);
}

// ---------- PIN de desbloqueo rápido ----------
export interface PinVerifier {
  salt: string;
  iterations: number;
  hash: string;
}

async function pinBits(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
  return new Uint8Array(bits);
}

export async function makePinVerifier(pin: string, iterations = PIN_KDF_ITERATIONS): Promise<PinVerifier> {
  const salt = randomBytes(16);
  const hash = await pinBits(pin, salt, iterations);
  return { salt: toB64(salt), iterations, hash: toB64(hash) };
}

export async function checkPin(v: PinVerifier, pin: string): Promise<boolean> {
  const hash = await pinBits(pin, fromB64(v.salt), v.iterations);
  const expected = fromB64(v.hash);
  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];
  return diff === 0;
}

/** Evaluación simple de la contraseña: longitud y variedad. Devuelve 0 (débil) a 4 (fuerte). */
export function passphraseStrength(p: string): { score: number; label: string; ok: boolean } {
  let score = 0;
  if (p.length >= 10) score++;
  if (p.length >= 14) score++;
  const classes = [/[a-záéíóúñü]/, /[A-ZÁÉÍÓÚÑÜ]/, /\d/, /[^A-Za-z0-9áéíóúñüÁÉÍÓÚÑÜ]/].filter((r) => r.test(p)).length;
  if (classes >= 2) score++;
  if (classes >= 3 || (p.length >= 18 && /\s/.test(p))) score++;
  const common = /^(1234|password|contrase|qwerty|vetcasa|111111|abcd)/i.test(p) || p.toLowerCase().startsWith(APP_SLUG);
  if (common) score = Math.min(score, 1);
  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Muy buena'];
  return { score, label: labels[score], ok: p.length >= 10 && score >= 2 };
}
