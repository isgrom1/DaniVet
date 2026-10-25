import type { Tables } from '@/data/store';
import type { Patient, Tutor } from '@/data/schema';
import { ageText, formatDate, localDateOf, localTimeOf } from '@/lib/dates';
import { CONSULT_KIND, DEWORM_KIND, DOC_KIND, EXAM_TYPE } from '@/data/labels';

export function speciesName(t: Tables, id: string | undefined): string {
  return (id && t.species.get(id)?.name) || 'Especie sin registrar';
}

export function primaryTutorId(p: Patient): string | undefined {
  return (p.tutors.find((x) => x.role === 'primary') ?? p.tutors[0])?.tutorId;
}

export function primaryTutor(t: Tables, p: Patient): Tutor | undefined {
  const id = primaryTutorId(p);
  return id ? t.tutors.get(id) : undefined;
}

export function tutorsOf(t: Tables, p: Patient): Array<{ tutor: Tutor; role: 'primary' | 'secondary' }> {
  return p.tutors
    .map((x) => ({ tutor: t.tutors.get(x.tutorId), role: x.role }))
    .filter((x): x is { tutor: Tutor; role: 'primary' | 'secondary' } => !!x.tutor);
}

export function patientsOfTutor(t: Tables, tutorId: string): Patient[] {
  return [...t.patients.values()]
    .filter((p) => p.tutors.some((x) => x.tutorId === tutorId))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function latestWeight(t: Tables, patientId: string): { weightKg: number; date: string; source: string } | undefined {
  let best: { weightKg: number; date: string; source: string; createdAt: string } | undefined;
  for (const w of t.weights.values()) {
    if (w.patientId !== patientId) continue;
    if (!best || w.date > best.date || (w.date === best.date && w.createdAt > best.createdAt)) {
      best = { weightKg: w.weightKg, date: w.date, source: w.source, createdAt: w.createdAt };
    }
  }
  return best;
}

export function weightHistory(t: Tables, patientId: string) {
  return [...t.weights.values()].filter((w) => w.patientId === patientId).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt.localeCompare(a.createdAt)));
}

export function patientSubtitle(t: Tables, p: Patient): string {
  const parts = [speciesName(t, p.speciesId), p.breed, ageText(p.birthDate, undefined, p.birthDateEstimated)].filter(Boolean);
  return parts.join(' · ');
}

export interface ClinicalAlert {
  level: 'critical' | 'warning' | 'info';
  label: string;
  text: string;
  pending: boolean;
}

/** Alertas visibles al abrir la ficha: se derivan solo de datos registrados (nunca se infieren). */
export function patientAlerts(p: Patient, t?: Tables): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  for (const a of p.allergies) {
    out.push({
      level: 'critical',
      label: 'Alergia',
      text: `${a.substance}${a.reaction ? `: ${a.reaction}` : ''}`,
      pending: !a.confirmed,
    });
  }
  for (const a of p.adverseReactions) {
    out.push({ level: 'critical', label: 'Reacción adversa', text: `${a.substance}${a.reaction ? `: ${a.reaction}` : ''}`, pending: !a.confirmed });
  }
  for (const c of p.conditions) {
    if (c.status === 'resolved') continue;
    out.push({ level: 'warning', label: c.chronic ? 'Enfermedad crónica' : 'Condición activa', text: c.name, pending: !c.confirmed });
  }
  for (const m of p.currentMedications) {
    out.push({ level: 'info', label: 'Medicación actual', text: [m.name, m.dose, m.frequency].filter(Boolean).join(' · '), pending: !m.confirmed });
  }
  for (const a of p.alerts) {
    out.push({ level: a.level, label: 'Alerta', text: a.text, pending: a.pendingConfirmation });
  }
  if (t) {
    for (const tr of t.treatments.values()) {
      if (tr.patientId !== p.id || tr.status !== 'active' || tr.kind !== 'medication') continue;
      const c = t.consultations.get(tr.consultationId);
      if (!c || c.status === 'voided') continue;
      out.push({ level: 'info', label: 'Tratamiento en curso', text: [tr.name, tr.dose, tr.frequency].filter(Boolean).join(' · '), pending: false });
    }
  }
  if (p.status === 'deceased') out.unshift({ level: 'critical', label: 'Estado', text: `Paciente fallecido${p.deceasedDate ? ` (${formatDate(p.deceasedDate)})` : ''}`, pending: false });
  const order = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export type TimelineKind = 'consultation' | 'vaccination' | 'deworming' | 'exam' | 'prescription' | 'document' | 'weight' | 'appointment';

export interface TimelineEvent {
  kind: TimelineKind;
  id: string;
  date: string; // AAAA-MM-DD o ISO
  title: string;
  subtitle?: string;
  to: string;
  status?: string;
}

/** Cronología clínica unificada del paciente, de lo más reciente a lo más antiguo. */
export function patientTimeline(t: Tables, patientId: string): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  for (const c of t.consultations.values()) {
    if (c.patientId !== patientId) continue;
    const dx = [...t.diagnoses.values()].filter((d) => d.consultationId === c.id && d.kind !== 'differential').map((d) => d.name);
    ev.push({
      kind: 'consultation',
      id: c.id,
      date: c.startedAt,
      title: `${CONSULT_KIND[c.kind]}${c.reason.main ? `: ${c.reason.main}` : ''}`,
      subtitle: dx.length ? `Dx: ${dx.join(', ')}` : undefined,
      to: `/consultas/${c.id}`,
      status: c.status,
    });
  }
  for (const v of t.vaccinations.values()) {
    if (v.patientId !== patientId) continue;
    ev.push({
      kind: 'vaccination',
      id: v.id,
      date: v.date,
      title: `Vacuna: ${v.vaccineName}`,
      subtitle: v.nextDueDate ? `Próxima dosis: ${formatDate(v.nextDueDate)}` : undefined,
      to: `/vacunas/${v.id}`,
      status: v.status,
    });
  }
  for (const d of t.dewormings.values()) {
    if (d.patientId !== patientId) continue;
    ev.push({
      kind: 'deworming',
      id: d.id,
      date: d.date,
      title: `Desparasitación ${DEWORM_KIND[d.kind].toLowerCase()}: ${d.product}`,
      subtitle: d.nextDueDate ? `Próximo control: ${formatDate(d.nextDueDate)}` : undefined,
      to: `/desparasitaciones/${d.id}`,
      status: d.status,
    });
  }
  for (const e of t.exams.values()) {
    if (e.patientId !== patientId) continue;
    ev.push({ kind: 'exam', id: e.id, date: e.requestedAt, title: `Examen: ${e.name || EXAM_TYPE[e.type]}`, to: `/examenes/${e.id}`, status: e.status });
  }
  for (const r of t.prescriptions.values()) {
    if (r.patientId !== patientId) continue;
    ev.push({
      kind: 'prescription',
      id: r.id,
      date: r.date,
      title: `Receta: ${r.items.map((i) => i.medicationName).join(', ') || 'sin medicamentos'}`,
      to: `/recetas/${r.id}`,
      status: r.status,
    });
  }
  for (const d of t.documents.values()) {
    if (d.patientId !== patientId && !d.otherPatientIds?.includes(patientId)) continue;
    ev.push({ kind: 'document', id: d.id, date: d.date, title: `${DOC_KIND[d.kind]}`, subtitle: d.title, to: `/documentos/${d.id}`, status: d.status });
  }
  for (const w of t.weights.values()) {
    if (w.patientId !== patientId || w.source === 'consultation') continue;
    ev.push({ kind: 'weight', id: w.id, date: w.date, title: `Peso: ${w.weightKg.toLocaleString('es-CL')} kg`, to: `/pacientes/${patientId}?tab=peso` });
  }
  // Fechas sin hora se ubican a mediodía; los instantes se convierten a hora local para ordenar.
  const key = (e: TimelineEvent) => (e.date.length === 10 ? `${e.date}T12:00` : `${localDateOf(e.date)}T${localTimeOf(e.date)}`);
  return ev.sort((a, b) => key(b).localeCompare(key(a)));
}
