import { UserError } from '@/data/errors';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import * as C from '@/lib/crypto';
import { getAllRecords, getBlob, getMeta, setMeta, wipeAll, withDb, type StoredBlob, type StoredRecord } from '@/lib/idb';
import { aadFor, loadAll } from '@/data/repo';
import { setDek } from '@/data/vaultKey';
import { APP_VERSION } from '@/lib/platform';
import { allOf, useDataStore } from '@/data/store';

/**
 * Respaldo cifrado (.vetcasa):
 *  - Es un archivo ZIP con: manifest.json (cabecera con la clave de datos envuelta por la contraseña y por la clave
 *    de recuperación), records.json (registros tal como están guardados: cifrados) y blobs/<id>.bin (adjuntos cifrados).
 *  - Nada del contenido clínico queda legible sin la contraseña o la clave de recuperación vigentes al crear el respaldo.
 *  - Incluye una suma SHA-256 de records.json para detectar archivos dañados.
 */
export const BACKUP_FORMAT = 'vetcasa-backup';
export const BACKUP_VERSION = 1;

interface Manifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  appVersion: string;
  createdAt: string;
  header: C.VaultHeader;
  recordCount: number;
  blobCount: number;
  includesAttachments: boolean;
  recordsSha256: string;
}

interface RowJson {
  t: string;
  id: string;
  rev: number;
  iv: string;
  ct: string;
}

async function sha256Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createEncryptedBackup(opts: { includeAttachments: boolean }): Promise<{ blob: Blob; fileName: string; stats: { records: number; blobs: number; bytes: number } }> {
  const header = await getMeta<C.VaultHeader>('vault');
  if (!header) throw new UserError('No hay una cuenta en este dispositivo.');
  const rows = (await getAllRecords()).filter((r) => r.t !== 'drafts');
  const rowsJson: RowJson[] = rows.map((r) => ({ t: r.t, id: r.id, rev: r.rev, iv: C.toB64(r.iv), ct: C.toB64(r.ct) }));
  const recordsBytes = strToU8(JSON.stringify(rowsJson));

  const files: Zippable = {};
  let blobCount = 0;
  if (opts.includeAttachments) {
    const ids = new Set<string>();
    for (const a of allOf('attachments')) {
      ids.add(a.blobId);
      if (a.thumbBlobId) ids.add(a.thumbBlobId);
    }
    for (const id of ids) {
      const b = await getBlob(id);
      if (!b) continue;
      const packed = new Uint8Array(12 + b.ct.byteLength);
      packed.set(b.iv, 0);
      packed.set(new Uint8Array(b.ct), 12);
      files[`blobs/${id}.bin`] = [packed, { level: 0 }];
      blobCount++;
    }
  }
  const manifest: Manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    header,
    recordCount: rowsJson.length,
    blobCount,
    includesAttachments: opts.includeAttachments,
    recordsSha256: await sha256Hex(recordsBytes as Uint8Array<ArrayBuffer>),
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  files['records.json'] = [recordsBytes, { level: 6 }];
  files['LEEME.txt'] = strToU8(
    'Respaldo cifrado de VetCasa.\nPara restaurarlo, abre VetCasa y elige "Restaurar desde un respaldo". Se necesita la contraseña vigente al crear el respaldo o la clave de recuperación.\nEl contenido está cifrado con AES-256-GCM: este archivo no puede leerse sin esas claves.\n',
  );
  const zipped = zipSync(files);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const blob = new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' });
  await setMeta('lastBackupAt', new Date().toISOString());
  return { blob, fileName: `respaldo-vetcasa-${stamp}.vetcasa`, stats: { records: rowsJson.length, blobs: blobCount, bytes: zipped.byteLength } };
}

export interface ParsedBackup {
  manifest: Manifest;
  rows: StoredRecord[];
  blobs: StoredBlob[];
}

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

export async function parseBackup(file: Blob): Promise<ParsedBackup> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new BackupFormatError('El archivo no es un respaldo válido de VetCasa o está dañado.');
  }
  const mf = entries['manifest.json'];
  const rec = entries['records.json'];
  if (!mf || !rec) throw new BackupFormatError('El archivo no es un respaldo válido de VetCasa.');
  let manifest: Manifest;
  try {
    manifest = JSON.parse(strFromU8(mf)) as Manifest;
  } catch {
    throw new BackupFormatError('El índice del respaldo está dañado.');
  }
  if (manifest.format !== BACKUP_FORMAT) throw new BackupFormatError('El archivo no es un respaldo de VetCasa.');
  if (manifest.version > BACKUP_VERSION) throw new BackupFormatError('Este respaldo fue creado con una versión más nueva de VetCasa. Actualiza la app.');
  const sum = await sha256Hex(rec as Uint8Array<ArrayBuffer>);
  if (sum !== manifest.recordsSha256) throw new BackupFormatError('El respaldo está dañado (la verificación de integridad no coincide).');
  const rowsJson = JSON.parse(strFromU8(rec)) as RowJson[];
  const rows: StoredRecord[] = rowsJson.map((r) => ({ t: r.t, id: r.id, rev: r.rev, iv: C.fromB64(r.iv), ct: C.fromB64(r.ct).buffer }));
  const blobs: StoredBlob[] = [];
  for (const [name, data] of Object.entries(entries)) {
    const m = /^blobs\/(.+)\.bin$/.exec(name);
    if (!m) continue;
    const iv = new Uint8Array(new ArrayBuffer(12));
    iv.set(data.subarray(0, 12));
    const ct = data.slice(12).buffer as ArrayBuffer;
    blobs.push({ id: m[1], iv, ct, size: ct.byteLength });
  }
  if (rows.length !== manifest.recordCount) throw new BackupFormatError('El respaldo está incompleto.');
  return { manifest, rows, blobs };
}

/** Obtiene la clave de datos del respaldo usando contraseña o clave de recuperación, y verifica que descifra. */
export async function unlockBackup(parsed: ParsedBackup, secret: { passphrase?: string; recoveryKey?: string }): Promise<CryptoKey> {
  const dek = secret.recoveryKey
    ? await C.unlockWithRecoveryKey(parsed.manifest.header, secret.recoveryKey)
    : await C.unlockWithPassphrase(parsed.manifest.header, secret.passphrase ?? '');
  const sample = parsed.rows.find((r) => r.t === 'profile') ?? parsed.rows[0];
  if (sample) {
    try {
      await C.openJson(dek, aadFor(sample.t, sample.id), { iv: sample.iv, ct: sample.ct });
    } catch {
      throw new BackupFormatError('No se pudo descifrar el contenido del respaldo.');
    }
  }
  return dek;
}

/**
 * Reemplaza TODOS los datos de este dispositivo por los del respaldo y desbloquea la app.
 * La contraseña pasa a ser la que estaba vigente cuando se creó el respaldo.
 */
export async function restoreBackup(parsed: ParsedBackup, dek: CryptoKey): Promise<RestoreResult> {
  await writeRestore(parsed.manifest.header, parsed);
  setDek(dek);
  await loadAll();
  return { records: parsed.rows.length, blobs: parsed.blobs.length, issues: useDataStore.getState().loadIssues };
}

/** Restauración con clave de recuperación: además se define una contraseña nueva para este dispositivo. */
export async function restoreBackupWithRecovery(parsed: ParsedBackup, recoveryKey: string, newPassphrase: string): Promise<RestoreResult> {
  const dek = await unlockBackup(parsed, { recoveryKey });
  const header = await C.rewrapPassphrase(parsed.manifest.header, { recoveryKey }, newPassphrase);
  await writeRestore(header, parsed);
  setDek(dek);
  await loadAll();
  return { records: parsed.rows.length, blobs: parsed.blobs.length, issues: useDataStore.getState().loadIssues };
}

export interface RestoreResult {
  records: number;
  blobs: number;
  issues: number;
}

async function writeRestore(header: C.VaultHeader, parsed: ParsedBackup) {
  setDek(null);
  await wipeAll();
  await withDb(async (db) => {
    const tx = db.transaction(['meta', 'records', 'blobs'], 'readwrite');
    const done = tx.done;
    done.catch(() => undefined);
    await tx.objectStore('meta').put({ key: 'vault', value: header });
    await tx.objectStore('meta').put({ key: 'restoredAt', value: new Date().toISOString() });
    for (const r of parsed.rows) await tx.objectStore('records').put(r);
    for (const b of parsed.blobs) await tx.objectStore('blobs').put(b);
    await done;
  });
}
