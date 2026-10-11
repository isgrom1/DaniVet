import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Almacenamiento persistente en IndexedDB.
 * - `meta`: datos técnicos NO sensibles (cabecera de la bóveda con claves envueltas, sesión de PIN, fechas de respaldo).
 * - `records`: un registro por entidad, siempre cifrado (solo tabla, id y número de revisión quedan en claro).
 * - `blobs`: fotografías y documentos adjuntos, cifrados.
 */
export interface StoredRecord {
  t: string;
  id: string;
  rev: number;
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
}

export interface StoredBlob {
  id: string;
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
  size: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

interface VetDB extends DBSchema {
  meta: { key: string; value: MetaEntry };
  records: { key: [string, string]; value: StoredRecord; indexes: { byTable: string } };
  blobs: { key: string; value: StoredBlob };
}

export type VetDatabase = IDBPDatabase<VetDB>;

export const DB_NAME = 'vetcasa';
let dbName = DB_NAME;
let dbPromise: Promise<VetDatabase> | null = null;

/** Solo para pruebas: usa otra base de datos. */
export function setDbNameForTests(name: string) {
  dbName = name;
  dbPromise = null;
}

function open(): Promise<VetDatabase> {
  return openDB<VetDB>(dbName, 1, {
    upgrade(db) {
      db.createObjectStore('meta', { keyPath: 'key' });
      const records = db.createObjectStore('records', { keyPath: ['t', 'id'] });
      records.createIndex('byTable', 't');
      db.createObjectStore('blobs', { keyPath: 'id' });
    },
    blocking() {
      // Otra pestaña necesita una versión nueva de la base: cerramos esta conexión.
      void dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
    terminated() {
      // iOS puede cerrar la conexión cuando la app pasa mucho tiempo en segundo plano.
      dbPromise = null;
    },
  });
}

export function getDb(): Promise<VetDatabase> {
  if (!dbPromise) {
    dbPromise = open().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

function isConnectionError(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? '';
  const msg = String((e as { message?: string })?.message ?? '');
  return name === 'InvalidStateError' || name === 'UnknownError' || /connection.*lost|closing/i.test(msg);
}

/** Ejecuta una operación sobre la base; si la conexión se perdió (problema conocido de iOS), reabre y reintenta una vez. */
export async function withDb<T>(fn: (db: VetDatabase) => Promise<T>): Promise<T> {
  try {
    return await fn(await getDb());
  } catch (e) {
    if (!isConnectionError(e)) throw e;
    dbPromise = null;
    return fn(await getDb());
  }
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return withDb(async (db) => (await db.get('meta', key))?.value as T | undefined);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await withDb((db) => db.put('meta', { key, value }).then(() => undefined));
}

export async function deleteMeta(key: string): Promise<void> {
  await withDb((db) => db.delete('meta', key));
}

export async function getAllRecords(): Promise<StoredRecord[]> {
  return withDb((db) => db.getAll('records'));
}

export async function getRecord(t: string, id: string): Promise<StoredRecord | undefined> {
  return withDb((db) => db.get('records', [t, id]));
}

export async function getBlob(id: string): Promise<StoredBlob | undefined> {
  return withDb((db) => db.get('blobs', id));
}

export async function getAllBlobIds(): Promise<string[]> {
  return withDb((db) => db.getAllKeys('blobs'));
}

export async function putBlob(blob: StoredBlob): Promise<void> {
  await withDb((db) => db.put('blobs', blob).then(() => undefined));
}

export async function deleteBlob(id: string): Promise<void> {
  await withDb((db) => db.delete('blobs', id));
}

/** Borra absolutamente todo el contenido local (registros, archivos y cabecera de la bóveda). */
export async function wipeAll(): Promise<void> {
  await withDb(async (db) => {
    const tx = db.transaction(['meta', 'records', 'blobs'], 'readwrite');
    await Promise.all([tx.objectStore('meta').clear(), tx.objectStore('records').clear(), tx.objectStore('blobs').clear()]);
    await tx.done;
  });
}

export async function estimateStorage(): Promise<{ usage?: number; quota?: number; persisted?: boolean }> {
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    return { usage: est?.usage, quota: est?.quota, persisted };
  } catch {
    return {};
  }
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
