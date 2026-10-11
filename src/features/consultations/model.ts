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

/** Requisitos mínimos para finalizar una consulta. */
export function finalizeBlockers(c: Consultation): string[] {
  const out: string[] = [];
  if (!c.reason.main?.trim()) out.push('Falta el motivo principal de la consulta.');
  const pending = c.provenance.filter((p) => !p.reviewed);
  if (pending.length) out.push(`Hay ${pending.length} campo(s) copiado(s) o de plantilla sin revisar.`);
  return out;
}
