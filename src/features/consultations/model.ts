import { EXAM_SYSTEMS, type Consultation, type ConsultationKind, type NewEntity } from '@/data/schema';
import { nowISO } from '@/lib/ids';

/** Consulta nueva en blanco. El examen físico comienza completamente como "No evaluado". */
export function newConsultation(input: {
  patientId: string;
  tutorId: string;
  professionalName: string;
  kind?: ConsultationKind;
  appointmentId?: string;
  followUpOfId?: string;
  startedAt?: string;
}): NewEntity<'consultations'> {
  const systems = Object.fromEntries(EXAM_SYSTEMS.map((s) => [s, { status: 'not_evaluated' as const }]));
  return {
    patientId: input.patientId,
    tutorId: input.tutorId,
    appointmentId: input.appointmentId,
    followUpOfId: input.followUpOfId,
    kind: input.kind ?? (input.followUpOfId ? 'control' : 'consultation'),
    professionalName: input.professionalName,
    startedAt: input.startedAt ?? nowISO(),
    status: 'draft',
    version: 1,
    reason: {},
    anamnesis: { custom: [] },
    exam: {
      mucous: { status: 'not_evaluated' },
      hydration: { status: 'not_evaluated' },
      bcs: { scale: 9 },
      generalState: { status: 'not_evaluated' },
      systems,
    },
    assessment: { problems: [] },
    plan: {},
    followUp: input.followUpOfId ? {} : undefined,
    provenance: [],
  };
}

/** Campos que pueden copiarse desde una consulta anterior (nunca examen físico, diagnóstico ni tratamiento). */
export const COPYABLE_FIELDS = [
  { path: 'reason.related', label: 'Antecedentes relacionados (motivo)' },
  { path: 'anamnesis.medical', label: 'Antecedentes médicos relevantes' },
  { path: 'anamnesis.diet', label: 'Alimentación' },
  { path: 'anamnesis.behaviorElimination', label: 'Conducta y eliminación' },
  { path: 'anamnesis.previousTreatments', label: 'Tratamientos previos' },
  { path: 'anamnesis.other', label: 'Otros antecedentes' },
] as const;

/** Campos de texto que pueden rellenarse desde una plantilla de la profesional. */
export const TEMPLATABLE_FIELDS = [
  { path: 'reason.main', label: 'Motivo principal' },
  { path: 'anamnesis.current', label: 'Historia actual' },
  { path: 'plan.homeCare', label: 'Cuidados domiciliarios' },
  { path: 'plan.ownerRecommendations', label: 'Recomendaciones al tutor' },
  { path: 'plan.finalNotes', label: 'Observaciones finales' },
] as const;

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const clone = structuredClone(obj) as Record<string, unknown>;
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return clone as T;
}

/**
 * Al editar un dato dictado, la profesional lo está revisando: queda como revisado.
 * (Los datos copiados o de plantilla siguen exigiendo "Marcar revisado".)
 */
export function reviewDictatedOnEdit(c: Consultation, path: string): Consultation {
  const hit = (p: Consultation['provenance'][number]) => p.source === 'dictated' && !p.reviewed && (p.path === path || path.startsWith(`${p.path}.`));
  if (!c.provenance.some(hit)) return c;
  return { ...c, provenance: c.provenance.map((p) => (hit(p) ? { ...p, reviewed: true } : p)) };
}

/** Quita la marca de origen de un diagnóstico o tratamiento eliminado. */
export function dropProvenance(c: Consultation, path: string): Consultation {
  return c.provenance.some((p) => p.path === path) ? { ...c, provenance: c.provenance.filter((p) => p.path !== path) } : c;
}

export interface MissingItem {
  label: string;
  /** Sección del editor donde se completa. */
  section: 'reason' | 'exam' | 'assessment' | 'plan';
}

/**
 * Datos importantes que aún no se registran (aviso, no impide finalizar).
 * Solo se informa lo que falta: nunca se completa nada por defecto.
 */
export function missingImportant(c: Consultation, diagnoses: Array<{ name: string }>, treatments: Array<{ name: string }>): MissingItem[] {
  const out: MissingItem[] = [];
  const e = c.exam;
  if (!c.reason.main?.trim()) out.push({ label: 'Motivo de consulta', section: 'reason' });
  if (e.weightKg === undefined) out.push({ label: 'Peso', section: 'exam' });
  if (e.temperatureC === undefined) out.push({ label: 'Temperatura', section: 'exam' });
  if (e.heartRateBpm === undefined) out.push({ label: 'Frecuencia cardíaca', section: 'exam' });
  if (e.respRateRpm === undefined) out.push({ label: 'Frecuencia respiratoria', section: 'exam' });
  if (e.mucous.status === 'not_evaluated') out.push({ label: 'Mucosas', section: 'exam' });
  if (e.crtSec === undefined) out.push({ label: 'Llenado capilar', section: 'exam' });
  if (e.hydration.status === 'not_evaluated') out.push({ label: 'Hidratación', section: 'exam' });
  if (e.bcs.value === undefined) out.push({ label: 'Condición corporal', section: 'exam' });
  if (!diagnoses.some((d) => d.name.trim())) out.push({ label: 'Diagnóstico', section: 'assessment' });
  if (!treatments.some((t) => t.name.trim()) && !c.plan.homeCare?.trim() && !c.plan.ownerRecommendations?.trim()) {
    out.push({ label: 'Tratamiento o indicaciones', section: 'plan' });
  }
  return out;
}

/** Requisitos mínimos para finalizar una consulta. */
export function finalizeBlockers(c: Consultation): string[] {
  const out: string[] = [];
  if (!c.reason.main?.trim()) out.push('Falta el motivo principal de la consulta.');
  const pending = c.provenance.filter((p) => !p.reviewed);
  if (pending.length) out.push(`Hay ${pending.length} dato(s) copiado(s), de plantilla o dictado(s) sin revisar.`);
  return out;
}
