import type { TableName } from './schema';

/**
 * Claves foráneas del modelo. IndexedDB no impone integridad referencial, por lo que la capa de datos
 * verifica estas relaciones en cada escritura (la referencia debe existir) y en cada eliminación
 * (no se puede eliminar un registro referenciado).
 *
 * Notación de rutas: 'campo', 'objeto.campo', 'lista[]' (lista de ids), 'lista[].campo'.
 */
export const REFS: Partial<Record<TableName, Array<[path: string, target: TableName]>>> = {
  profile: [
    ['logoAttachmentId', 'attachments'],
    ['signatureAttachmentId', 'attachments'],
  ],
  protocols: [['speciesId', 'species']],
  tutors: [['mergedIntoId', 'tutors']],
  patients: [
    ['speciesId', 'species'],
    ['tutors[].tutorId', 'tutors'],
    ['photoAttachmentId', 'attachments'],
  ],
  weights: [
    ['patientId', 'patients'],
    ['consultationId', 'consultations'],
  ],
  appointments: [
    ['tutorId', 'tutors'],
    ['patientIds[]', 'patients'],
    ['consultationIds[]', 'consultations'],
  ],
  consultations: [
    ['patientId', 'patients'],
    ['tutorId', 'tutors'],
    ['appointmentId', 'appointments'],
    ['followUpOfId', 'consultations'],
  ],
  diagnoses: [
    ['consultationId', 'consultations'],
    ['patientId', 'patients'],
  ],
  treatments: [
    ['consultationId', 'consultations'],
    ['patientId', 'patients'],
    ['prescriptionId', 'prescriptions'],
  ],
  consultationVersions: [['consultationId', 'consultations']],
  prescriptions: [
    ['patientId', 'patients'],
    ['tutorId', 'tutors'],
    ['consultationId', 'consultations'],
  ],
  vaccinations: [
    ['patientId', 'patients'],
    ['consultationId', 'consultations'],
    ['protocolId', 'protocols'],
    ['inventoryItemId', 'inventoryItems'],
    ['inventoryLotId', 'inventoryLots'],
  ],
  dewormings: [
    ['patientId', 'patients'],
    ['consultationId', 'consultations'],
    ['protocolId', 'protocols'],
    ['inventoryItemId', 'inventoryItems'],
    ['inventoryLotId', 'inventoryLots'],
  ],
  exams: [
    ['patientId', 'patients'],
    ['consultationId', 'consultations'],
  ],
  attachments: [
    ['patientId', 'patients'],
    ['consultationId', 'consultations'],
    ['examId', 'exams'],
    ['documentId', 'documents'],
  ],
  documents: [
    ['patientId', 'patients'],
    ['otherPatientIds[]', 'patients'],
    ['tutorId', 'tutors'],
    ['consultationId', 'consultations'],
    ['scanAttachmentId', 'attachments'],
    ['signature.attachmentId', 'attachments'],
  ],
  charges: [
    ['tutorId', 'tutors'],
    ['patientId', 'patients'],
    ['consultationId', 'consultations'],
    ['appointmentId', 'appointments'],
    ['budgetId', 'budgets'],
    ['items[].serviceId', 'services'],
  ],
  payments: [
    ['chargeId', 'charges'],
    ['tutorId', 'tutors'],
  ],
  expenses: [
    ['consultationId', 'consultations'],
    ['appointmentId', 'appointments'],
    ['patientId', 'patients'],
  ],
  budgets: [
    ['tutorId', 'tutors'],
    ['patientId', 'patients'],
    ['chargeId', 'charges'],
    ['items[].serviceId', 'services'],
  ],
  inventoryLots: [['itemId', 'inventoryItems']],
  inventoryMovements: [
    ['itemId', 'inventoryItems'],
    ['lotId', 'inventoryLots'],
    ['consultationId', 'consultations'],
    ['patientId', 'patients'],
    ['vaccinationId', 'vaccinations'],
    ['dewormingId', 'dewormings'],
  ],
  tasks: [
    ['patientId', 'patients'],
    ['consultationId', 'consultations'],
    ['examId', 'exams'],
  ],
  reminders: [
    ['patientId', 'patients'],
    ['tutorId', 'tutors'],
  ],
};

/** Extrae los ids referenciados por `record` según una ruta. */
export function idsAtPath(record: unknown, path: string): string[] {
  const parts = path.split('.');
  let current: unknown[] = [record];
  for (const part of parts) {
    const isList = part.endsWith('[]');
    const key = isList ? part.slice(0, -2) : part;
    const next: unknown[] = [];
    for (const c of current) {
      if (c === null || typeof c !== 'object') continue;
      const v = (c as Record<string, unknown>)[key];
      if (isList) {
        if (Array.isArray(v)) next.push(...v);
      } else if (v !== undefined && v !== null) {
        next.push(v);
      }
    }
    current = next;
  }
  return current.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export interface RefHit {
  path: string;
  target: TableName;
  id: string;
}

export function refsOf(table: TableName, record: unknown): RefHit[] {
  const defs = REFS[table] ?? [];
  const out: RefHit[] = [];
  for (const [path, target] of defs) {
    for (const id of idsAtPath(record, path)) out.push({ path, target, id });
  }
  return out;
}

/** Tablas (y rutas) que pueden referenciar a `target`. */
export function incomingRefs(target: TableName): Array<{ table: TableName; path: string }> {
  const out: Array<{ table: TableName; path: string }> = [];
  for (const [table, defs] of Object.entries(REFS) as Array<[TableName, Array<[string, TableName]>]>) {
    for (const [path, t] of defs) if (t === target) out.push({ table, path });
  }
  return out;
}
