import { UserError } from '@/data/errors';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import * as C from '@/lib/crypto';
import { getAllRecords, getBlob, getMeta, setMeta, wipeAll, withDb, type StoredBlob, type StoredRecord } from '@/lib/idb';
import { aadFor, loadAll } from '@/data/repo';
import { setDek } from '@/data/vaultKey';
import { currentDataVersion, DATA_VERSION_KEY } from '@/data/migrations';
import { APP_SLUG, APP_VERSION, DEFAULT_APP_NAME } from '@/lib/platform';
import { allOf, useDataStore } from '@/data/store';
import { toCSV } from '@/lib/csv';
import { readBlob } from '@/features/attachments/attachments';

/**
 * Respaldo cifrado (archivo .<nombre de la app>, p. ej. .dapp; también se aceptan los .vetcasa):
 *  - Es un archivo ZIP con: manifest.json (cabecera con la clave de datos envuelta por la contraseña y por la clave
 *    de recuperación), records.json (registros tal como están guardados: cifrados) y blobs/<id>.bin (adjuntos cifrados).
 *  - Nada del contenido clínico queda legible sin la contraseña o la clave de recuperación vigentes al crear el respaldo.
 *  - Incluye una suma SHA-256 de records.json para detectar archivos dañados.
 */
// Identificador interno del formato: no cambia aunque cambie el nombre de la app.
export const BACKUP_FORMAT = 'vetcasa-backup';
/** Extensión de los respaldos nuevos (según el nombre de la app). */
export const BACKUP_EXT = APP_SLUG;
/** Archivos que se ofrecen al elegir un respaldo. El contenido se valida, no la extensión. */
export const BACKUP_ACCEPT = [...new Set([`.${BACKUP_EXT}`, '.vetcasa'])].join(',') + ',application/octet-stream,application/zip';
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
  /** Versión del modelo de datos (ausente en respaldos de la versión 1). */
  dataVersion?: number;
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
    dataVersion: (await getMeta<number>(DATA_VERSION_KEY)) ?? currentDataVersion(),
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  files['records.json'] = [recordsBytes, { level: 6 }];
  files['LEEME.txt'] = strToU8(
    `Respaldo cifrado de ${DEFAULT_APP_NAME}.\nPara restaurarlo, abre ${DEFAULT_APP_NAME} y elige "Restaurar desde un respaldo". Se necesita la contraseña vigente al crear el respaldo o la clave de recuperación.\nEl contenido está cifrado con AES-256-GCM: este archivo no puede leerse sin esas claves.\n`,
  );
  const zipped = zipSync(files);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const blob = new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' });
  await setMeta('lastBackupAt', new Date().toISOString());
  return { blob, fileName: `respaldo-${APP_SLUG}-${stamp}.${BACKUP_EXT}`, stats: { records: rowsJson.length, blobs: blobCount, bytes: zipped.byteLength } };
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
    throw new BackupFormatError(`El archivo no es un respaldo válido de ${DEFAULT_APP_NAME} o está dañado.`);
  }
  const mf = entries['manifest.json'];
  const rec = entries['records.json'];
  if (!mf || !rec) throw new BackupFormatError(`El archivo no es un respaldo válido de ${DEFAULT_APP_NAME}.`);
  let manifest: Manifest;
  try {
    manifest = JSON.parse(strFromU8(mf)) as Manifest;
  } catch {
    throw new BackupFormatError('El índice del respaldo está dañado.');
  }
  if (manifest.format !== BACKUP_FORMAT) throw new BackupFormatError(`El archivo no es un respaldo de ${DEFAULT_APP_NAME}.`);
  if (manifest.version > BACKUP_VERSION || (manifest.dataVersion ?? 1) > currentDataVersion())
    throw new BackupFormatError(`Este respaldo fue creado con una versión más nueva de ${DEFAULT_APP_NAME}. Cierra la app por completo y vuelve a abrirla con conexión a Internet para que se actualice.`);
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
    // Si el respaldo es de un modelo anterior, las migraciones se aplican al cargar.
    await tx.objectStore('meta').put({ key: DATA_VERSION_KEY, value: parsed.manifest.dataVersion ?? 1 });
    for (const r of parsed.rows) await tx.objectStore('records').put(r);
    for (const b of parsed.blobs) await tx.objectStore('blobs').put(b);
    await done;
  });
}

// ---------------------------------------------------------------------------
// Verificación de un respaldo (sin reemplazar los datos actuales)
// ---------------------------------------------------------------------------
export interface VerifyResult {
  records: number;
  recordsFailed: number;
  blobs: number;
  blobsFailed: number;
  byTable: Record<string, number>;
  createdAt: string;
}

/** Descifra todo el contenido del respaldo en memoria para comprobar que se puede recuperar. No escribe nada. */
export async function verifyBackup(parsed: ParsedBackup, secret: { passphrase?: string; recoveryKey?: string }): Promise<VerifyResult> {
  const dek = await unlockBackup(parsed, secret);
  const res: VerifyResult = { records: 0, recordsFailed: 0, blobs: 0, blobsFailed: 0, byTable: {}, createdAt: parsed.manifest.createdAt };
  for (const r of parsed.rows) {
    try {
      await C.openJson(dek, aadFor(r.t, r.id), { iv: r.iv, ct: r.ct });
      res.records++;
      res.byTable[r.t] = (res.byTable[r.t] ?? 0) + 1;
    } catch {
      res.recordsFailed++;
    }
  }
  for (const b of parsed.blobs) {
    try {
      await C.openBytes(dek, `vetcasa:blob:${b.id}`, { iv: b.iv, ct: b.ct });
      res.blobs++;
    } catch {
      res.blobsFailed++;
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Exportación abierta (sin cifrar) para migrar a otro sistema
// ---------------------------------------------------------------------------
const OPEN_README = `EXPORTACIÓN DE DATOS DE ${DEFAULT_APP_NAME.toUpperCase()} (SIN CIFRAR)
============================================

ATENCIÓN: este archivo contiene datos personales y clínicos legibles. Guárdalo en un lugar seguro y
elimínalo cuando ya no lo necesites.

Estructura
- datos/<tabla>.json : todos los registros de cada tabla, en formato JSON.
- info.json          : versión de la app y del modelo de datos con que se exportó.
- csv/*.csv          : resúmenes en CSV (separador ";") para abrir en planillas.
- adjuntos/          : fotografías y documentos, con el nombre "<id del adjunto>__<nombre original>".

Relaciones (claves foráneas)
- Cada registro tiene un "id" estable (UUID).
- patients.tutors[].tutorId -> tutors.id ; patients.speciesId -> species.id
- consultations.patientId -> patients.id ; consultations.tutorId -> tutors.id ; consultations.appointmentId -> appointments.id
- diagnoses.consultationId / treatments.consultationId -> consultations.id
- prescriptions, vaccinations, dewormings, exams, documents, weights: patientId -> patients.id (y consultationId cuando corresponde)
- attachments.blobId -> archivo en adjuntos/ ; attachments.patientId / consultationId / examId / documentId
- charges.tutorId -> tutors.id ; payments.chargeId -> charges.id
- inventoryLots.itemId / inventoryMovements.itemId -> inventoryItems.id
- auditLog: historial de cambios (entity = tabla, entityId = id del registro)

Convenciones
- Fechas sin hora: AAAA-MM-DD. Instantes: ISO 8601 en UTC.
- Unidades en el nombre del campo: weightKg (kg), temperatureC (°C), heartRateBpm (lpm), respRateRpm (rpm), crtSec (s), *CLP (pesos).
`;

export async function exportOpenData(opts: { includeAttachments: boolean }): Promise<{ blob: Blob; fileName: string }> {
  const t = useDataStore.getState().tables;
  const files: Zippable = {
    'LEEME.txt': strToU8(OPEN_README),
    'info.json': strToU8(JSON.stringify({ app: DEFAULT_APP_NAME, appVersion: APP_VERSION, dataVersion: currentDataVersion(), exportedAt: new Date().toISOString() }, null, 2)),
  };
  for (const [name, map] of Object.entries(t)) {
    if (name === 'drafts') continue;
    files[`datos/${name}.json`] = strToU8(JSON.stringify([...(map as Map<string, unknown>).values()], null, 1));
  }
  const pname = (id?: string) => (id ? (t.patients.get(id)?.name ?? '') : '');
  files['csv/tutores.csv'] = strToU8(
    toCSV(
      ['id', 'Nombre', 'RUT', 'Teléfono', 'Correo', 'Dirección principal', 'Comuna'],
      [...t.tutors.values()].map((x) => {
        const a = x.addresses.find((y) => y.primary) ?? x.addresses[0];
        return [x.id, x.fullName, x.rut, x.phone, x.email, a?.street, a?.comuna];
      }),
    ),
  );
  files['csv/pacientes.csv'] = strToU8(
    toCSV(
      ['id', 'Nombre', 'Especie', 'Raza', 'Sexo', 'Nacimiento', 'Microchip', 'Estado', 'Tutor principal (id)'],
      [...t.patients.values()].map((p) => [p.id, p.name, t.species.get(p.speciesId)?.name, p.breed, p.sex, p.birthDate, p.microchip, p.status, p.tutors.find((x) => x.role === 'primary')?.tutorId]),
    ),
  );
  files['csv/consultas.csv'] = strToU8(
    toCSV(
      ['id', 'Fecha', 'Paciente', 'Estado', 'Motivo', 'Diagnósticos', 'Tratamientos'],
      [...t.consultations.values()].map((c) => [
        c.id,
        c.startedAt,
        pname(c.patientId),
        c.status,
        c.reason.main,
        [...t.diagnoses.values()].filter((d) => d.consultationId === c.id).map((d) => `${d.name} (${d.kind})`).join(' | '),
        [...t.treatments.values()].filter((x) => x.consultationId === c.id).map((x) => [x.name, x.dose, x.frequency].filter(Boolean).join(' ')).join(' | '),
      ]),
    ),
  );
  files['csv/vacunas.csv'] = strToU8(
    toCSV(['id', 'Fecha', 'Paciente', 'Vacuna', 'Lote', 'Vencimiento producto', 'Próxima dosis', 'Estado'], [...t.vaccinations.values()].map((v) => [v.id, v.date, pname(v.patientId), v.vaccineName, v.lotNumber, v.productExpiry, v.nextDueDate, v.status])),
  );
  files['csv/desparasitaciones.csv'] = strToU8(
    toCSV(['id', 'Fecha', 'Paciente', 'Tipo', 'Producto', 'Peso (kg)', 'Próximo control', 'Estado'], [...t.dewormings.values()].map((d) => [d.id, d.date, pname(d.patientId), d.kind, d.product, d.weightKgUsed, d.nextDueDate, d.status])),
  );
  files['csv/recetas.csv'] = strToU8(
    toCSV(['id', 'Fecha', 'Paciente', 'Estado', 'Medicamentos'], [...t.prescriptions.values()].map((r) => [r.id, r.date, r.patientSnap.name, r.status, r.items.map((i) => `${i.medicationName}: ${i.dose}`).join(' | ')])),
  );
  if (opts.includeAttachments) {
    for (const a of t.attachments.values()) {
      try {
        const b = await readBlob(a.blobId, a.mimeType);
        files[`adjuntos/${a.id}__${a.fileName.replace(/[\\/:*?"<>|]/g, '_')}`] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }];
      } catch {
        /* adjunto no disponible en este dispositivo */
      }
    }
  }
  const zipped = zipSync(files);
  const stamp = new Date().toISOString().slice(0, 10);
  return { blob: new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), fileName: `exportacion-abierta-${APP_SLUG}-${stamp}.zip` };
}
