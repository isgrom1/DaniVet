import { EXAM_SYSTEMS, type Consultation, type Diagnosis, type Treatment } from '@/data/schema';
import { addDays, localDateOf } from '@/lib/dates';
import { newId, nowISO } from '@/lib/ids';
import { getPath, setPath } from '@/lib/objects';
import type { EditorState } from '@/features/consultations/actions';
import { fold } from './text';
import type { Change, ParsedItem } from './consultation';

/** Largo máximo de una transcripción guardada (el esquema admite 20.000 caracteres). */
const MAX_TRANSCRIPT = 20000;

const same = (a: string, b: string) => fold(a).trim() === fold(b).trim();

function joinText(existing: string | undefined, value: string): string {
  const cur = (existing ?? '').trim();
  if (!cur) return value;
  if (fold(cur).includes(fold(value))) return cur;
  return `${cur}${/[.!?]$/.test(cur) ? '' : '.'} ${value}`;
}

/**
 * Agrega a la consulta los datos dictados que la profesional dejó marcados.
 * Cada dato queda con origen "dictado" sin revisar, y la transcripción completa se guarda con la consulta.
 */
export function applyDictation(state: EditorState, items: ParsedItem[], transcript: string, at = nowISO()): { state: EditorState; paths: string[] } {
  const dictationId = newId();
  let c: Consultation = state.consultation;
  const diagnoses = [...state.diagnoses];
  const treatments = [...state.treatments];
  const paths: string[] = [];
  const touched = new Set<string>();
  const now = nowISO();

  const apply = (ch: Change) => {
    switch (ch.kind) {
      case 'text': {
        const cur = getPath(c, ch.path) as string | undefined;
        c = setPath(c, ch.path, ch.replace ? ch.value : joinText(cur, ch.value));
        paths.push(ch.path);
        break;
      }
      case 'number':
        c = setPath(c, ch.path, ch.value);
        paths.push(ch.path);
        break;
      case 'finding': {
        c = setPath(c, ch.path, { status: ch.status, notes: ch.notes });
        touched.add(ch.path);
        paths.push(ch.path);
        break;
      }
      case 'mucous':
        c = setPath(c, 'exam.mucous', { status: ch.status, color: ch.color, notes: ch.notes });
        paths.push('exam.mucous');
        break;
      case 'hydration':
        c = setPath(c, 'exam.hydration', { status: ch.status, dehydrationPct: ch.pct, notes: ch.notes });
        paths.push('exam.hydration');
        break;
      case 'bcs':
        c = setPath(c, 'exam.bcs', { value: ch.value, scale: ch.scale });
        paths.push('exam.bcs');
        break;
      case 'controlDate':
        c = setPath(c, 'plan.controlDate', ch.date);
        paths.push('plan.controlDate');
        break;
      case 'diagnosis': {
        if (diagnoses.some((d) => same(d.name, ch.name))) break;
        const d: Diagnosis = { id: newId(), createdAt: now, updatedAt: now, rev: 0, consultationId: c.id, patientId: c.patientId, kind: ch.dxKind, name: ch.name, status: 'active' };
        diagnoses.push(d);
        paths.push(`diagnoses.${d.id}`);
        break;
      }
      case 'treatment': {
        if (treatments.some((t) => same(t.name, ch.name))) break;
        const start = localDateOf(c.startedAt);
        const t: Treatment = {
          id: newId(),
          createdAt: now,
          updatedAt: now,
          rev: 0,
          consultationId: c.id,
          patientId: c.patientId,
          kind: ch.txKind,
          name: ch.name,
          dose: ch.dose,
          route: ch.route,
          frequency: ch.frequency,
          durationDays: ch.durationDays,
          instructions: ch.instructions,
          status: 'active',
          startDate: start,
          endDate: ch.durationDays ? addDays(start, ch.durationDays - 1) : undefined,
        };
        treatments.push(t);
        paths.push(`treatments.${t.id}`);
        break;
      }
      case 'restNormal':
        break;
    }
  };

  const selected = items.filter((i) => i.selected);
  for (const it of selected) apply(it.change);
  // "Resto normal": solo los sistemas que siguen sin evaluar y que no se dictaron ahora.
  if (selected.some((i) => i.change.kind === 'restNormal')) {
    for (const s of EXAM_SYSTEMS) {
      const path = `exam.systems.${s}`;
      if (touched.has(path) || (c.exam.systems[s]?.status ?? 'not_evaluated') !== 'not_evaluated') continue;
      c = setPath(c, path, { status: 'normal' });
      paths.push(path);
    }
  }

  const unique = [...new Set(paths)];
  const provenance = [
    ...c.provenance.filter((p) => !unique.includes(p.path)),
    ...unique.map((path) => ({ path, source: 'dictated' as const, fromId: dictationId, reviewed: false })),
  ];
  const text = transcript.trim().slice(0, MAX_TRANSCRIPT);
  const dictations = text ? [...(c.dictations ?? []), { id: dictationId, at, text }] : c.dictations;
  return { state: { consultation: { ...c, provenance, dictations }, diagnoses, treatments }, paths: unique };
}
