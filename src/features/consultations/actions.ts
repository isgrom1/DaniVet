import { UserError } from '@/data/errors';
import { batch, insert } from '@/data/repo';
import { getRecord, getTable } from '@/data/store';
import type { Consultation, Diagnosis, Treatment } from '@/data/schema';
import { localDateOf } from '@/lib/dates';
import { nowISO } from '@/lib/ids';
import { newConsultation, finalizeBlockers } from './model';
import { primaryTutorId } from '@/features/patients/selectors';

export interface EditorState {
  consultation: Consultation;
  diagnoses: Diagnosis[];
  treatments: Treatment[];
}

/** Crea una consulta en borrador (con o sin cita) y, si viene de una cita, la marca “En atención”. */
export async function startConsultation(input: { patientId: string; appointmentId?: string; followUpOfId?: string }): Promise<string> {
  const patient = getRecord('patients', input.patientId);
  if (!patient) throw new UserError('Paciente no encontrado.');
  const appt = input.appointmentId ? getRecord('appointments', input.appointmentId) : undefined;
  const tutorId = appt?.tutorId && patient.tutors.some((t) => t.tutorId === appt.tutorId) ? appt.tutorId : primaryTutorId(patient);
  if (!tutorId) throw new UserError('El paciente no tiene tutor asociado.');
  const profile = getRecord('profile', 'profile');
  const b = batch();
  const draft = newConsultation({
    patientId: patient.id,
    tutorId,
    appointmentId: appt?.id,
    followUpOfId: input.followUpOfId,
    professionalName: [profile?.fullName].filter(Boolean).join(' '),
    kind: input.followUpOfId ? 'control' : appt?.visitType === 'emergency' ? 'emergency' : appt?.visitType === 'control' ? 'control' : appt?.visitType === 'procedure' ? 'procedure' : 'consultation',
  });
  if (appt?.reason) draft.reason = { ...draft.reason, main: appt.reason };
  const c = b.insert('consultations', draft);
  if (appt) {
    b.update('appointments', appt.id, (cur) => ({
      ...cur,
      consultationIds: [...new Set([...cur.consultationIds, c.id])],
      status: ['pending', 'confirmed', 'en_route'].includes(cur.status) ? 'in_progress' : cur.status,
      statusLog: ['pending', 'confirmed', 'en_route'].includes(cur.status) ? [...cur.statusLog, { status: 'in_progress', at: nowISO() }] : cur.statusLog,
    }));
  }
  await b.commit();
  return c.id;
}

/** Quita los campos base (que administra la capa de datos) antes de reescribir un registro. */
function dataOf<T extends { createdAt: string; updatedAt: string; rev: number }>(rec: T): Omit<T, 'createdAt' | 'updatedAt' | 'rev'> {
  const { createdAt, updatedAt, rev, ...data } = rec;
  void createdAt;
  void updatedAt;
  void rev;
  return data;
}

function diffChildren<T extends { id: string }>(current: T[], next: T[]) {
  const nextIds = new Set(next.map((x) => x.id));
  return { removed: current.filter((x) => !nextIds.has(x.id)) };
}

function childrenOf(consultationId: string) {
  return {
    diagnoses: [...getTable('diagnoses').values()].filter((d) => d.consultationId === consultationId),
    treatments: [...getTable('treatments').values()].filter((t) => t.consultationId === consultationId),
  };
}

function writeChildren(b: ReturnType<typeof batch>, state: EditorState, opts: { audit: boolean; amend?: boolean; reason?: string }) {
  const cur = childrenOf(state.consultation.id);
  const wopts = { audit: opts.audit, amend: opts.amend, reason: opts.reason };
  for (const d of state.diagnoses) {
    const { id, ...data } = dataOf(d);
    if (getRecord('diagnoses', id)) b.update('diagnoses', id, (x) => ({ ...x, ...data }), wopts);
    else b.insert('diagnoses', { ...data, id }, wopts);
  }
  for (const t of state.treatments) {
    const { id, ...data } = dataOf(t);
    if (getRecord('treatments', id)) b.update('treatments', id, (x) => ({ ...x, ...data }), wopts);
    else b.insert('treatments', { ...data, id }, wopts);
  }
  for (const d of diffChildren(cur.diagnoses, state.diagnoses).removed) b.remove('diagnoses', d.id, wopts);
  for (const t of diffChildren(cur.treatments, state.treatments).removed) b.remove('treatments', t.id, wopts);
}

/** Autoguardado de un borrador (sin historial: el historial comienza al finalizar). */
export async function saveConsultationDraft(state: EditorState): Promise<void> {
  const stored = getRecord('consultations', state.consultation.id);
  if (!stored || stored.status !== 'draft') return;
  const b = batch();
  const data = dataOf(state.consultation);
  b.update('consultations', stored.id, (x) => ({ ...x, ...data, status: 'draft' }), { audit: false });
  writeChildren(b, state, { audit: false });
  await b.commit();
}

function upsertConsultationWeight(b: ReturnType<typeof batch>, c: Consultation) {
  const existing = [...getTable('weights').values()].find((w) => w.consultationId === c.id);
  const kg = c.exam.weightKg;
  if (kg && kg > 0) {
    const iso = localDateOf(c.startedAt);
    if (existing) {
      if (existing.weightKg !== kg) b.update('weights', existing.id, { weightKg: kg, date: iso });
    } else b.insert('weights', { patientId: c.patientId, consultationId: c.id, date: iso, weightKg: kg, source: 'consultation' });
  } else if (existing) {
    b.remove('weights', existing.id);
  }
}

/** Finaliza la consulta: queda bloqueada; cambios posteriores solo como enmienda con motivo. */
export async function finalizeConsultation(state: EditorState): Promise<void> {
  const blockers = finalizeBlockers(state.consultation);
  if (blockers.length) throw new UserError(blockers.join(' '));
  const b = batch();
  const data = dataOf(state.consultation);
  writeChildren(b, state, { audit: true });
  b.update('consultations', state.consultation.id, (x) => ({ ...x, ...data, status: 'final', finalizedAt: nowISO(), version: 1 }), {
    action: 'finalize',
    summary: 'Consulta finalizada',
  });
  upsertConsultationWeight(b, { ...state.consultation });
  await b.commit();
}

/** Enmienda de una consulta finalizada: guarda la versión anterior completa y registra el motivo. */
export async function amendConsultation(state: EditorState, reason: string): Promise<void> {
  if (!reason.trim()) throw new UserError('Indica el motivo de la corrección.');
  const stored = getRecord('consultations', state.consultation.id);
  if (!stored || stored.status !== 'final') throw new UserError('Solo se pueden enmendar consultas finalizadas.');
  const prev = childrenOf(stored.id);
  const b = batch();
  b.insert(
    'consultationVersions',
    {
      consultationId: stored.id,
      version: stored.version,
      reason: reason.trim(),
      savedAt: nowISO(),
      snapshot: { consultation: structuredClone(stored), diagnoses: structuredClone(prev.diagnoses), treatments: structuredClone(prev.treatments) },
    },
    { audit: false },
  );
  const data = dataOf(state.consultation);
  b.update('consultations', stored.id, (x) => ({ ...x, ...data, status: 'final', finalizedAt: stored.finalizedAt, version: stored.version + 1 }), {
    amend: true,
    reason: reason.trim(),
    summary: `Enmienda (versión ${stored.version + 1})`,
  });
  writeChildren(b, state, { audit: true, amend: true, reason: reason.trim() });
  upsertConsultationWeight(b, state.consultation);
  await b.commit();
}

export async function voidConsultation(id: string, reason: string): Promise<void> {
  const c = getRecord('consultations', id);
  if (!c) return;
  const b = batch();
  // La consulta anulada se conserva (no se borra) para mantener la trazabilidad.
  b.update('consultations', id, { status: 'voided', voidReason: reason }, { action: 'void', reason });
  for (const t of childrenOf(id).treatments) {
    if (t.status === 'active') b.update('treatments', t.id, { status: 'suspended' }, { reason });
  }
  await b.commit();
}

/** Crea una tarea de seguimiento vinculada a la consulta. */
export async function addFollowUpTask(input: { consultationId: string; patientId: string; title: string; type: 'review_results' | 'contact_owner' | 'schedule_control' | 'complete_docs' | 'other'; dueDate?: string; assignee?: string }) {
  return insert('tasks', {
    title: input.title,
    type: input.type,
    dueDate: input.dueDate,
    status: 'pending',
    assignee: input.assignee,
    patientId: input.patientId,
    consultationId: input.consultationId,
  });
}
