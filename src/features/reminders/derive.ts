import type { Tables } from '@/data/store';
import type { Settings } from '@/data/schema';
import { addDays, diffDays, localDateOf, todayISO } from '@/lib/dates';
import { normalizeText } from '@/lib/text';
import { DEWORM_KIND, EXAM_TYPE } from '@/data/labels';
import { chargeBalance } from '@/features/finance/calc';

export type DueKind = 'vaccine' | 'deworming' | 'control' | 'treatment' | 'exam' | 'task' | 'payment';

export interface DueItem {
  key: string;
  kind: DueKind;
  date?: string;
  patientId?: string;
  tutorId?: string;
  title: string;
  subtitle?: string;
  to: string;
  overdue: boolean;
  contactedAt?: string;
}

function reminderState(t: Tables, key: string) {
  for (const r of t.reminders.values()) if (r.sourceKey === key) return r;
  return undefined;
}

function alive(t: Tables, patientId: string) {
  const p = t.patients.get(patientId);
  return !!p && p.status !== 'deceased';
}

/**
 * Recordatorios derivados de fechas REGISTRADAS por la profesional (próxima dosis, próximo control, fin de tratamiento).
 * No se asume ninguna frecuencia por defecto. Estos recordatorios se muestran dentro de la app: no son notificaciones del teléfono.
 */
export function preventiveDue(t: Tables, s: Settings, opts: { patientId?: string; today?: string } = {}): DueItem[] {
  const today = opts.today ?? todayISO();
  const vacFrom = addDays(today, -s.reminders.overdueWindowDays);
  const vacTo = addDays(today, s.reminders.vaccineDaysAhead);
  const dewTo = addDays(today, s.reminders.dewormingDaysAhead);
  const out: DueItem[] = [];

  // Vacunas: la última aplicación de cada vacuna por paciente determina la próxima dosis.
  const lastVac = new Map<string, import('@/data/schema').Vaccination>();
  for (const v of t.vaccinations.values()) {
    if (v.status !== 'applied') continue;
    if (opts.patientId && v.patientId !== opts.patientId) continue;
    const k = `${v.patientId}|${normalizeText(v.vaccineName)}`;
    const prev = lastVac.get(k);
    if (!prev || v.date > prev.date || (v.date === prev.date && v.createdAt > prev.createdAt)) lastVac.set(k, v);
  }
  for (const v of lastVac.values()) {
    if (!v.nextDueDate || !alive(t, v.patientId)) continue;
    if (v.nextDueDate < vacFrom || v.nextDueDate > vacTo) continue;
    const key = `vaccination:${v.id}`;
    const st = reminderState(t, key);
    if (st && st.status !== 'pending') continue;
    out.push({
      key,
      kind: 'vaccine',
      date: v.nextDueDate,
      patientId: v.patientId,
      title: `Vacuna: ${v.vaccineName}`,
      subtitle: `Próxima dosis registrada${v.nextDueSource === 'protocol' ? ' (según pauta)' : ''}`,
      to: `/vacunas/nueva?patientId=${v.patientId}&from=${v.id}`,
      overdue: v.nextDueDate < today,
      contactedAt: st?.contactedAt,
    });
  }

  const lastDew = new Map<string, import('@/data/schema').Deworming>();
  for (const d of t.dewormings.values()) {
    if (d.status !== 'applied') continue;
    if (opts.patientId && d.patientId !== opts.patientId) continue;
    const k = `${d.patientId}|${d.kind}`;
    const prev = lastDew.get(k);
    if (!prev || d.date > prev.date) lastDew.set(k, d);
  }
  for (const d of lastDew.values()) {
    if (!d.nextDueDate || !alive(t, d.patientId)) continue;
    if (d.nextDueDate < vacFrom || d.nextDueDate > dewTo) continue;
    const key = `deworming:${d.id}`;
    const st = reminderState(t, key);
    if (st && st.status !== 'pending') continue;
    out.push({
      key,
      kind: 'deworming',
      date: d.nextDueDate,
      patientId: d.patientId,
      title: `Desparasitación ${DEWORM_KIND[d.kind].toLowerCase()}`,
      subtitle: `Último producto: ${d.product}`,
      to: `/desparasitaciones/nueva?patientId=${d.patientId}&from=${d.id}`,
      overdue: d.nextDueDate < today,
      contactedAt: st?.contactedAt,
    });
  }
  return out.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

export function controlsDue(t: Tables, s: Settings, opts: { patientId?: string; today?: string } = {}): DueItem[] {
  const today = opts.today ?? todayISO();
  const from = addDays(today, -s.reminders.overdueWindowDays);
  const to = addDays(today, s.reminders.controlDaysAhead);
  const out: DueItem[] = [];
  const followed = new Set<string>();
  for (const c of t.consultations.values()) if (c.followUpOfId && c.status !== 'voided') followed.add(c.followUpOfId);
  for (const c of t.consultations.values()) {
    if (c.status === 'voided') continue;
    if (opts.patientId && c.patientId !== opts.patientId) continue;
    if (!alive(t, c.patientId)) continue;
    const date = c.followUp?.nextReview ?? c.plan.controlDate;
    if (!date || followed.has(c.id) || date < from || date > to) continue;
    // Si ya hay una cita agendada para el paciente desde la fecha de control, se considera programado.
    const scheduled = [...t.appointments.values()].some(
      (a) => a.status !== 'cancelled' && a.patientIds.includes(c.patientId) && localDateOf(a.start) >= localDateOf(c.startedAt) && a.start > c.startedAt,
    );
    const key = `control:${c.id}`;
    const st = reminderState(t, key);
    if (st && st.status !== 'pending') continue;
    out.push({
      key,
      kind: 'control',
      date,
      patientId: c.patientId,
      title: 'Control recomendado',
      subtitle: `${c.reason.main ?? 'Consulta'}${scheduled ? ' · ya hay una visita agendada' : ''}`,
      to: `/consulta?patientId=${c.patientId}&followUpOf=${c.id}`,
      overdue: date < today,
      contactedAt: st?.contactedAt,
    });
  }
  for (const tr of t.treatments.values()) {
    if (tr.status !== 'active' || !tr.endDate) continue;
    if (opts.patientId && tr.patientId !== opts.patientId) continue;
    const c = t.consultations.get(tr.consultationId);
    if (!c || c.status === 'voided') continue;
    if (tr.endDate < addDays(today, -7) || tr.endDate > to) continue;
    out.push({
      key: `treatment:${tr.id}`,
      kind: 'treatment',
      date: tr.endDate,
      patientId: tr.patientId,
      title: `Fin de tratamiento: ${tr.name}`,
      subtitle: tr.dose ? `${tr.dose}${tr.frequency ? ` · ${tr.frequency}` : ''}` : undefined,
      to: `/consultas/${tr.consultationId}`,
      overdue: tr.endDate < today,
    });
  }
  return out.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

export function examsToReview(t: Tables, opts: { patientId?: string; today?: string } = {}): DueItem[] {
  const today = opts.today ?? todayISO();
  const out: DueItem[] = [];
  for (const e of t.exams.values()) {
    if (opts.patientId && e.patientId !== opts.patientId) continue;
    if (e.status === 'received') {
      out.push({ key: `exam:${e.id}`, kind: 'exam', date: e.receivedAt, patientId: e.patientId, title: `Resultado por revisar: ${e.name || EXAM_TYPE[e.type]}`, to: `/examenes/${e.id}`, overdue: false });
    } else if (['requested', 'sampled', 'sent'].includes(e.status)) {
      const days = diffDays(e.sampleDate ?? e.requestedAt, today);
      if (days >= 3) {
        out.push({
          key: `exam:${e.id}`,
          kind: 'exam',
          date: e.sampleDate ?? e.requestedAt,
          patientId: e.patientId,
          title: `Resultado pendiente: ${e.name || EXAM_TYPE[e.type]}`,
          subtitle: `Hace ${days} días${e.lab ? ` · ${e.lab}` : ''}`,
          to: `/examenes/${e.id}`,
          overdue: days >= 10,
        });
      }
    }
  }
  return out.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

export function openTasks(t: Tables, opts: { patientId?: string; today?: string } = {}): DueItem[] {
  const today = opts.today ?? todayISO();
  return [...t.tasks.values()]
    .filter((x) => (x.status === 'pending' || x.status === 'in_progress') && (!opts.patientId || x.patientId === opts.patientId))
    .map((x) => ({
      key: `task:${x.id}`,
      kind: 'task' as const,
      date: x.dueDate,
      patientId: x.patientId,
      title: x.title,
      subtitle: x.assignee ? `Responsable: ${x.assignee}` : undefined,
      to: `/tareas?id=${x.id}`,
      overdue: !!x.dueDate && x.dueDate < today,
    }))
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
}

export function paymentsDue(t: Tables): DueItem[] {
  return [...t.charges.values()]
    .filter((c) => !c.voided && chargeBalance(t, c) > 0)
    .map((c) => ({
      key: `payment:${c.id}`,
      kind: 'payment' as const,
      date: c.date,
      tutorId: c.tutorId,
      patientId: c.patientId,
      title: t.tutors.get(c.tutorId)?.fullName ?? 'Tutor',
      subtitle: `Saldo ${chargeBalance(t, c).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}`,
      to: `/finanzas/cobros/${c.id}`,
      overdue: diffDays(c.date, todayISO()) > 30,
    }))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}
