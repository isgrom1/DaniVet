import { openJson, sealJson } from '@/lib/crypto';
import { getAllRecords, getRecord as idbGetRecord, withDb, type StoredRecord } from '@/lib/idb';
import { newId, nowISO } from '@/lib/ids';
import { ConflictError, IntegrityError, LockedRecordError, ValidationError, type FieldIssue } from './errors';
import { incomingRefs, idsAtPath, refsOf } from './relations';
import { schemas, TABLES, type AuditEntry, type EntityOf, type NewEntity, type TableName } from './schema';
import { applyChanges, emptyTables, getRecord, useDataStore } from './store';
import { getDek, hasDek } from './vaultKey';

export const aadFor = (t: string, id: string) => `vetcasa:${t}:${id}`;

const looseSchemas = Object.fromEntries(TABLES.map((t) => [t, schemas[t].loose()])) as unknown as {
  [K in TableName]: (typeof schemas)[K];
};

/** Tablas cuyas modificaciones quedan en el historial de cambios. */
const AUDITED = new Set<TableName>([
  'profile',
  'tutors',
  'patients',
  'weights',
  'appointments',
  'consultations',
  'diagnoses',
  'treatments',
  'prescriptions',
  'vaccinations',
  'dewormings',
  'exams',
  'attachments',
  'documents',
  'charges',
  'payments',
  'expenses',
  'budgets',
  'inventoryMovements',
]);

export type AuditAction = AuditEntry['action'];

export interface WriteOpts {
  /** Motivo (obligatorio para enmiendas y anulaciones). */
  reason?: string;
  /** Revisión sobre la que se basó la edición (para detectar conflictos). */
  baseRev?: number;
  /** false = no registrar en el historial (p. ej. autoguardado de borradores). */
  audit?: boolean;
  action?: AuditAction;
  summary?: string;
  /** Permite modificar una consulta finalizada como enmienda (con motivo). */
  amend?: boolean;
}

interface PutOp {
  table: TableName;
  record: { id: string; rev: number } & Record<string, unknown>;
  expectedRev?: number;
}

interface DelOp {
  table: TableName;
  id: string;
}

// ---------------------------------------------------------------------------
// Carga inicial (al desbloquear)
// ---------------------------------------------------------------------------
export async function loadAll(): Promise<void> {
  useDataStore.setState({ status: 'loading' });
  const dek = getDek();
  const rows = await getAllRecords();
  const tables = emptyTables() as Record<TableName, Map<string, unknown>>;
  let issues = 0;
  await Promise.all(
    rows.map(async (row) => {
      const t = row.t as TableName;
      if (!(t in schemas)) {
        issues++;
        return;
      }
      try {
        const value = await openJson<Record<string, unknown>>(dek, aadFor(t, row.id), { iv: row.iv, ct: row.ct });
        if (!looseSchemas[t].safeParse(value).success) issues++;
        // Se conserva el valor original aunque no valide, para no ocultar ni perder información.
        tables[t].set(row.id, value);
      } catch {
        issues++;
      }
    }),
  );
  useDataStore.setState({ tables: tables as never, status: 'ready', loadIssues: issues });
}

// ---------------------------------------------------------------------------
// Validación e integridad
// ---------------------------------------------------------------------------
function validate(table: TableName, record: unknown): Record<string, unknown> {
  const res = looseSchemas[table].safeParse(record);
  if (!res.success) {
    const issues: FieldIssue[] = res.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ValidationError(issues);
  }
  return res.data as Record<string, unknown>;
}

const TABLE_LABELS: Partial<Record<TableName, string>> = {
  tutors: 'tutor',
  patients: 'paciente',
  species: 'especie',
  consultations: 'consulta',
  appointments: 'cita',
  attachments: 'archivo adjunto',
  prescriptions: 'receta',
  charges: 'cobro',
  budgets: 'presupuesto',
  services: 'servicio',
  exams: 'examen',
  documents: 'documento',
  inventoryItems: 'producto de inventario',
  inventoryLots: 'lote',
  vaccinations: 'vacunación',
  dewormings: 'desparasitación',
  protocols: 'pauta',
};

function checkRefs(puts: PutOp[], dels: DelOp[]) {
  const pending = new Set(puts.map((p) => `${p.table}:${p.record.id}`));
  const deleted = new Set(dels.map((d) => `${d.table}:${d.id}`));
  for (const p of puts) {
    for (const r of refsOf(p.table, p.record)) {
      const key = `${r.target}:${r.id}`;
      if (deleted.has(key)) throw new IntegrityError(`No se puede guardar: el registro vinculado (${TABLE_LABELS[r.target] ?? r.target}) se está eliminando.`);
      if (pending.has(key)) continue;
      if (!getRecord(r.target, r.id)) {
        throw new IntegrityError(`No se puede guardar: no existe el ${TABLE_LABELS[r.target] ?? r.target} vinculado.`);
      }
    }
  }
}

/** Devuelve los registros que referencian a (table, id). */
export function referencesTo(table: TableName, id: string, ignore: Set<string> = new Set()): Array<{ table: TableName; id: string }> {
  const out: Array<{ table: TableName; id: string }> = [];
  const state = useDataStore.getState().tables;
  for (const { table: src, path } of incomingRefs(table)) {
    for (const rec of state[src].values() as Iterable<{ id: string }>) {
      if (ignore.has(`${src}:${rec.id}`)) continue;
      if (idsAtPath(rec, path).includes(id)) out.push({ table: src, id: rec.id });
    }
  }
  return out;
}

function checkDeletes(dels: DelOp[], puts: PutOp[]) {
  const ignore = new Set([...dels.map((d) => `${d.table}:${d.id}`)]);
  const putKeys = new Map(puts.map((p) => [`${p.table}:${p.record.id}`, p]));
  for (const d of dels) {
    const refs = referencesTo(d.table, d.id, ignore).filter((r) => {
      // Si el registro que referencia se reescribe en este mismo lote, se evalúa su nueva versión.
      const p = putKeys.get(`${r.table}:${r.id}`);
      if (!p) return true;
      return refsOf(p.table, p.record).some((x) => x.target === d.table && x.id === d.id);
    });
    if (refs.length) {
      const what = TABLE_LABELS[refs[0].table] ?? refs[0].table;
      throw new IntegrityError(
        `No se puede eliminar: hay ${refs.length} registro(s) vinculado(s) (por ejemplo, ${what}). Archiva o anula en lugar de eliminar.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Registros bloqueados (fichas finalizadas, recetas y documentos emitidos)
// ---------------------------------------------------------------------------
function changedKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    if (k === 'updatedAt' || k === 'rev') continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k);
  }
  return out;
}

function parentConsultationFinal(rec: Record<string, unknown>): boolean {
  const cid = rec.consultationId as string | undefined;
  const c = cid ? getRecord('consultations', cid) : undefined;
  return c?.status === 'final';
}

function guardLocked(table: TableName, before: Record<string, unknown>, after: Record<string, unknown>, opts: WriteOpts) {
  const changed = changedKeys(before, after);
  if (!changed.length) return;
  const allow = (keys: string[]) => changed.every((k) => keys.includes(k));

  if (table === 'consultations' && before.status === 'final') {
    if (opts.amend) {
      if (!opts.reason?.trim()) throw new LockedRecordError('Indica el motivo de la corrección.');
      return;
    }
    if (after.status === 'voided' && allow(['status', 'voidReason'])) {
      if (!opts.reason?.trim()) throw new LockedRecordError('Indica el motivo de la anulación.');
      return;
    }
    throw new LockedRecordError();
  }
  if (table === 'consultations' && before.status === 'voided') throw new LockedRecordError('La consulta está anulada.');
  if ((table === 'diagnoses' || table === 'treatments') && parentConsultationFinal(before)) {
    // El estado de un tratamiento (activo/finalizado/suspendido) puede actualizarse durante el seguimiento.
    if (table === 'treatments' && allow(['status', 'endDate'])) return;
    if (opts.amend && opts.reason?.trim()) return;
    throw new LockedRecordError();
  }
  if (table === 'prescriptions' && before.status !== 'draft') {
    if (before.status === 'issued' && after.status === 'voided' && allow(['status', 'voidReason'])) {
      if (!opts.reason?.trim()) throw new LockedRecordError('Indica el motivo de la anulación.');
      return;
    }
    throw new LockedRecordError('La receta ya fue emitida. Para cambiarla, anúlala y emite una nueva.');
  }
  if (table === 'documents' && before.status !== 'draft') {
    if (allow(['signature', 'scanAttachmentId'])) return;
    if (before.status === 'issued' && after.status === 'voided' && allow(['status', 'voidReason'])) {
      if (!opts.reason?.trim()) throw new LockedRecordError('Indica el motivo de la anulación.');
      return;
    }
    throw new LockedRecordError('El documento ya fue emitido. Para cambiarlo, anúlalo y crea uno nuevo.');
  }
  if ((table === 'vaccinations' || table === 'dewormings') && before.status === 'voided') {
    throw new LockedRecordError('El registro está anulado.');
  }
  if ((table === 'charges' || table === 'payments') && before.voided === true) {
    throw new LockedRecordError('El registro está anulado.');
  }
}

// ---------------------------------------------------------------------------
// Historial de cambios
// ---------------------------------------------------------------------------
function flatten(obj: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) {
    out[prefix] = JSON.stringify(obj);
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (!prefix && (k === 'updatedAt' || k === 'rev' || k === 'createdAt')) continue;
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  out[prefix] = String(obj);
  return out;
}

const clip = (s: string | undefined) => (s && s.length > 400 ? `${s.slice(0, 399)}…` : s);

export function diffRecords(before: unknown, after: unknown): NonNullable<AuditEntry['changes']> {
  const a = flatten(before);
  const b = flatten(after);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes: NonNullable<AuditEntry['changes']> = [];
  for (const k of keys) {
    if (a[k] !== b[k]) changes.push({ field: k, before: clip(a[k]), after: clip(b[k]) });
  }
  return changes.slice(0, 80);
}

function auditRecord(entry: Omit<AuditEntry, 'id' | 'createdAt' | 'updatedAt' | 'rev' | 'at'>): PutOp {
  const now = nowISO();
  const record = { id: newId(), createdAt: now, updatedAt: now, rev: 1, at: now, ...entry };
  return { table: 'auditLog', record: record as PutOp['record'] };
}

// ---------------------------------------------------------------------------
// Lote de escritura atómico
// ---------------------------------------------------------------------------
export class Batch {
  private puts: PutOp[] = [];
  private dels: DelOp[] = [];

  private current<T extends TableName>(table: T, id: string): EntityOf<T> | undefined {
    const pending = [...this.puts].reverse().find((p) => p.table === table && p.record.id === id);
    if (pending) return pending.record as unknown as EntityOf<T>;
    return getRecord(table, id);
  }

  insert<T extends TableName>(table: T, data: NewEntity<T>, opts: WriteOpts = {}): EntityOf<T> {
    const now = nowISO();
    const record = { ...data, id: data.id ?? newId(), createdAt: now, updatedAt: now, rev: 1 } as Record<string, unknown>;
    const valid = validate(table, record) as PutOp['record'];
    this.puts.push({ table, record: valid });
    if (AUDITED.has(table) && opts.audit !== false) {
      this.puts.push(
        auditRecord({ entity: table, entityId: valid.id, action: opts.action ?? 'create', summary: opts.summary, reason: opts.reason }),
      );
    }
    return valid as unknown as EntityOf<T>;
  }

  update<T extends TableName>(
    table: T,
    id: string,
    change: Partial<EntityOf<T>> | ((cur: EntityOf<T>) => EntityOf<T>),
    opts: WriteOpts = {},
  ): EntityOf<T> {
    const cur = this.current(table, id);
    if (!cur) throw new IntegrityError('El registro que intentas modificar ya no existe.');
    const curRec = cur as unknown as Record<string, unknown> & { rev: number; createdAt: string };
    if (opts.baseRev !== undefined && opts.baseRev !== curRec.rev) throw new ConflictError();
    const next =
      typeof change === 'function'
        ? (change as (c: EntityOf<T>) => EntityOf<T>)(structuredClone(cur))
        : ({ ...structuredClone(cur), ...change } as EntityOf<T>);
    const nextRec = {
      ...(next as unknown as Record<string, unknown>),
      id,
      createdAt: curRec.createdAt,
      updatedAt: nowISO(),
      rev: curRec.rev + 1,
    };
    guardLocked(table, curRec, nextRec, opts);
    const valid = validate(table, nextRec) as PutOp['record'];
    const persistedRev = getRecord(table, id) as { rev: number } | undefined;
    const alreadyPending = this.puts.some((p) => p.table === table && p.record.id === id);
    this.puts.push({ table, record: valid, expectedRev: alreadyPending ? undefined : persistedRev?.rev });
    if (AUDITED.has(table) && opts.audit !== false) {
      const changes = diffRecords(cur, valid);
      if (changes.length) {
        this.puts.push(
          auditRecord({
            entity: table,
            entityId: id,
            action: opts.action ?? (opts.amend ? 'amend' : 'update'),
            summary: opts.summary,
            reason: opts.reason,
            changes,
          }),
        );
      }
    }
    return valid as unknown as EntityOf<T>;
  }

  remove(table: TableName, id: string, opts: WriteOpts = {}): void {
    const cur = this.current(table, id);
    if (!cur) return;
    this.dels.push({ table, id });
    this.puts = this.puts.filter((p) => !(p.table === table && p.record.id === id));
    if (AUDITED.has(table) && opts.audit !== false) {
      this.puts.push(
        auditRecord({ entity: table, entityId: id, action: 'delete', summary: opts.summary, reason: opts.reason }),
      );
    }
  }

  log(entry: { entity: string; entityId: string; action: AuditAction; summary?: string; reason?: string }) {
    this.puts.push(auditRecord(entry));
  }

  get size() {
    return this.puts.length + this.dels.length;
  }

  async commit(): Promise<void> {
    if (!this.size) return;
    const puts = this.dedupe();
    const dels = this.dels;
    checkRefs(puts, dels);
    checkDeletes(dels, puts);
    await persist(puts, dels);
    applyChanges(puts as never, dels);
    broadcastChange(puts, dels);
    this.puts = [];
    this.dels = [];
  }

  /** Si un registro se escribió varias veces en el lote, se guarda solo la última versión (con la primera revisión esperada). */
  private dedupe(): PutOp[] {
    const map = new Map<string, PutOp>();
    for (const p of this.puts) {
      const key = `${p.table}:${p.record.id}`;
      const prev = map.get(key);
      map.set(key, { ...p, expectedRev: prev ? prev.expectedRev : p.expectedRev });
    }
    return [...map.values()];
  }
}

async function persist(puts: PutOp[], dels: DelOp[]) {
  const dek = getDek();
  const sealed = await Promise.all(
    puts.map(async (p) => ({ p, s: await sealJson(dek, aadFor(p.table, p.record.id), p.record) })),
  );
  await withDb(async (db) => {
    const tx = db.transaction('records', 'readwrite');
    const done = tx.done;
    done.catch(() => undefined);
    const store = tx.store;
    try {
      for (const { p, s } of sealed) {
        if (p.expectedRev !== undefined) {
          const existing = await store.get([p.table, p.record.id]);
          if (existing && existing.rev !== p.expectedRev) throw new ConflictError();
        }
        const row: StoredRecord = { t: p.table, id: p.record.id, rev: p.record.rev, iv: s.iv, ct: s.ct };
        await store.put(row);
      }
      for (const d of dels) await store.delete([d.table, d.id]);
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* la transacción ya terminó */
      }
      throw e;
    }
    await done;
  });
}

// ---------------------------------------------------------------------------
// Atajos de una sola operación
// ---------------------------------------------------------------------------
export function batch() {
  return new Batch();
}

export async function insert<T extends TableName>(table: T, data: NewEntity<T>, opts?: WriteOpts): Promise<EntityOf<T>> {
  const b = new Batch();
  const rec = b.insert(table, data, opts);
  await b.commit();
  return rec;
}

export async function update<T extends TableName>(
  table: T,
  id: string,
  change: Partial<EntityOf<T>> | ((cur: EntityOf<T>) => EntityOf<T>),
  opts?: WriteOpts,
): Promise<EntityOf<T>> {
  const b = new Batch();
  const rec = b.update(table, id, change, opts);
  await b.commit();
  return rec;
}

export async function remove(table: TableName, id: string, opts?: WriteOpts): Promise<void> {
  const b = new Batch();
  b.remove(table, id, opts);
  await b.commit();
}

/** Inserta o reemplaza un registro con id fijo (perfil, ajustes, borradores). */
export async function upsert<T extends TableName>(table: T, id: string, data: NewEntity<T>, opts?: WriteOpts): Promise<EntityOf<T>> {
  const b = new Batch();
  const exists = getRecord(table, id);
  const rec = exists
    ? b.update(table, id, () => ({ ...(exists as object), ...(data as object), id }) as EntityOf<T>, opts)
    : b.insert(table, { ...data, id }, opts);
  await b.commit();
  return rec;
}

// ---------------------------------------------------------------------------
// Sincronización entre pestañas del mismo dispositivo
// ---------------------------------------------------------------------------
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    channel = new BroadcastChannel('vetcasa-data');
    channel.onmessage = (ev: MessageEvent) => void handleRemoteChange(ev.data);
  }
  return channel;
}

function broadcastChange(puts: PutOp[], dels: DelOp[]) {
  getChannel()?.postMessage({
    type: 'changed',
    puts: puts.map((p) => [p.table, p.record.id]),
    dels: dels.map((d) => [d.table, d.id]),
  });
}

async function handleRemoteChange(msg: { type: string; puts: Array<[TableName, string]>; dels: Array<[TableName, string]> }) {
  if (msg?.type !== 'changed' || !hasDek()) return;
  const dek = getDek();
  const updated: Array<{ table: TableName; record: { id: string } }> = [];
  for (const [t, id] of msg.puts) {
    const row = await idbGetRecord(t, id);
    if (!row) continue;
    try {
      updated.push({ table: t, record: await openJson(dek, aadFor(t, id), { iv: row.iv, ct: row.ct }) });
    } catch {
      /* se ignora: se recargará al volver a desbloquear */
    }
  }
  applyChanges(updated, msg.dels.map(([table, id]) => ({ table, id })));
}

export function startCrossTabSync() {
  getChannel();
}
