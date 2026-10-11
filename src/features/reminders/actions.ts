import { insert, update } from '@/data/repo';
import { getTable } from '@/data/store';
import type { Reminder } from '@/data/schema';
import { todayISO } from '@/lib/dates';
import type { DueItem } from './derive';

const KIND: Record<DueItem['kind'], Reminder['kind']> = {
  vaccine: 'vaccine',
  deworming: 'deworming',
  control: 'control',
  treatment: 'followup',
  exam: 'exam',
  task: 'other',
  payment: 'payment',
};

/** Guarda el estado de un recordatorio derivado (contactado, hecho o descartado). No envía notificaciones. */
export async function setDueState(item: DueItem, patch: { status?: Reminder['status']; contactedAt?: string }) {
  const existing = [...getTable('reminders').values()].find((r) => r.sourceKey === item.key);
  if (existing) {
    await update('reminders', existing.id, patch);
  } else {
    await insert('reminders', {
      title: item.title,
      date: item.date ?? todayISO(),
      kind: KIND[item.kind],
      patientId: item.patientId,
      tutorId: item.tutorId,
      sourceKey: item.key,
      status: patch.status ?? 'pending',
      contactedAt: patch.contactedAt,
    });
  }
}
