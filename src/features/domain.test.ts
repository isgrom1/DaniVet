import { describe, expect, it } from 'vitest';
import { insert } from '@/data/repo';
import { useDataStore } from '@/data/store';
import { freshAccount, makePatient, makeTutor } from '@/test/helpers';
import { addDays, todayISO } from '@/lib/dates';
import { chargeBalance, chargeState, docTotal, lineTotal, periodReport } from './finance/calc';
import { controlsDue, preventiveDue } from './reminders/derive';
import { findTutorDuplicates } from './tutors/duplicates';
import { scheduleIssues } from './agenda/selectors';
import { fromLocalDateTime } from '@/lib/dates';
import { getRecord } from '@/data/store';
import { newConsultation } from './consultations/model';
import { finalizeConsultation, amendConsultation } from './consultations/actions';

const tables = () => useDataStore.getState().tables;
const settings = () => getRecord('settings', 'settings')!;

describe('cobros y pagos', () => {
  it('calcula totales, abonos, saldo y estado', async () => {
    await freshAccount();
    const t = await makeTutor();
    const c = await insert('charges', {
      tutorId: t.id,
      date: todayISO(),
      items: [
        { id: 'a', description: 'Consulta', category: 'fee', qty: 1, unitPriceCLP: 30000, discountCLP: 0 },
        { id: 'b', description: 'Medicamento', category: 'medication', qty: 2, unitPriceCLP: 4500, discountCLP: 1000 },
      ],
      discountCLP: 2000,
      voided: false,
    });
    expect(lineTotal(c.items[1])).toBe(8000);
    expect(docTotal(c)).toBe(36000);
    expect(chargeState(tables(), c)).toBe('pending');
    await insert('payments', { chargeId: c.id, tutorId: t.id, date: todayISO(), amountCLP: 20000, methodId: 'cash', methodName: 'Efectivo', voided: false });
    expect(chargeState(tables(), c)).toBe('partial');
    expect(chargeBalance(tables(), c)).toBe(16000);
    await insert('payments', { chargeId: c.id, tutorId: t.id, date: todayISO(), amountCLP: 16000, methodId: 'transfer', methodName: 'Transferencia', voided: false });
    expect(chargeState(tables(), c)).toBe('paid');
    const r = periodReport(tables(), addDays(todayISO(), -1), addDays(todayISO(), 1));
    expect(r.collected).toBe(36000);
    expect(r.byCategory.fee).toBe(30000);
    expect(r.byCategory.medication).toBe(8000);
  });
});

describe('recordatorios basados solo en fechas registradas', () => {
  it('usa la última aplicación de cada vacuna y no inventa frecuencias', async () => {
    await freshAccount();
    const t = await makeTutor();
    const p = await makePatient(t.id);
    const today = todayISO();
    // Sin próxima dosis registrada: no hay recordatorio.
    await insert('vaccinations', { patientId: p.id, date: addDays(today, -300), vaccineName: 'Polivalente', professionalName: 'X', status: 'applied' });
    expect(preventiveDue(tables(), settings())).toHaveLength(0);
    // Con próxima dosis en 10 días: aparece.
    const v2 = await insert('vaccinations', { patientId: p.id, date: addDays(today, -20), vaccineName: 'Polivalente', professionalName: 'X', status: 'applied', nextDueDate: addDays(today, 10) });
    const due = preventiveDue(tables(), settings());
    expect(due).toHaveLength(1);
    expect(due[0].key).toBe(`vaccination:${v2.id}`);
    // Una aplicación posterior de la misma vacuna reemplaza el recordatorio anterior.
    await insert('vaccinations', { patientId: p.id, date: today, vaccineName: 'polivalente', professionalName: 'X', status: 'applied' });
    expect(preventiveDue(tables(), settings())).toHaveLength(0);
  });

  it('muestra el control recomendado hasta que se registra el control', async () => {
    await freshAccount();
    const t = await makeTutor();
    const p = await makePatient(t.id);
    const c = await insert('consultations', newConsultation({ patientId: p.id, tutorId: t.id, professionalName: 'X' }));
    await finalizeConsultation({ consultation: { ...c, reason: { main: 'Otitis' }, plan: { controlDate: addDays(todayISO(), 3) } }, diagnoses: [], treatments: [] });
    expect(controlsDue(tables(), settings()).map((x) => x.kind)).toEqual(['control']);
    await insert('consultations', newConsultation({ patientId: p.id, tutorId: t.id, professionalName: 'X', followUpOfId: c.id }));
    expect(controlsDue(tables(), settings())).toHaveLength(0);
  });
});

describe('enmiendas de consultas', () => {
  it('conserva la versión anterior completa con su motivo', async () => {
    await freshAccount();
    const t = await makeTutor();
    const p = await makePatient(t.id);
    const c = await insert('consultations', newConsultation({ patientId: p.id, tutorId: t.id, professionalName: 'X' }));
    const dx = { id: 'dx1', createdAt: '', updatedAt: '', rev: 0, consultationId: c.id, patientId: p.id, kind: 'presumptive' as const, name: 'Otitis externa', status: 'active' as const };
    await finalizeConsultation({ consultation: { ...c, reason: { main: 'Sacude la cabeza' }, exam: { ...c.exam, weightKg: 12.4 } }, diagnoses: [dx], treatments: [] });
    expect([...tables().weights.values()].find((w) => w.consultationId === c.id)?.weightKg).toBe(12.4);
    const stored = getRecord('consultations', c.id)!;
    await amendConsultation({ consultation: { ...stored, exam: { ...stored.exam, weightKg: 12.9 } }, diagnoses: [{ ...dx, name: 'Otitis externa bilateral' }], treatments: [] }, 'Error de digitación en el peso');
    const after = getRecord('consultations', c.id)!;
    expect(after.version).toBe(2);
    const versions = [...tables().consultationVersions.values()].filter((v) => v.consultationId === c.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].reason).toBe('Error de digitación en el peso');
    expect((versions[0].snapshot.consultation as { exam: { weightKg: number } }).exam.weightKg).toBe(12.4);
    expect((versions[0].snapshot.diagnoses as Array<{ name: string }>)[0].name).toBe('Otitis externa');
    expect([...tables().weights.values()].find((w) => w.consultationId === c.id)?.weightKg).toBe(12.9);
  });
});

describe('duplicados y agenda', () => {
  it('sugiere posibles tutores duplicados sin fusionar', async () => {
    await freshAccount();
    await makeTutor('María José González', '+56987654321');
    const d1 = findTutorDuplicates(tables(), { fullName: 'Otra Persona', phone: '9 8765 4321' });
    expect(d1[0]?.reasons).toContain('Mismo teléfono');
    const d2 = findTutorDuplicates(tables(), { fullName: 'Maria Jose Gonzalez' });
    expect(d2[0]?.reasons).toContain('Nombre muy similar');
    expect(findTutorDuplicates(tables(), { fullName: 'Pedro Soto', phone: '+56911112222' })).toHaveLength(0);
  });

  it('detecta superposición y traslado insuficiente entre visitas', async () => {
    await freshAccount();
    const t = await makeTutor();
    const p = await makePatient(t.id);
    const day = addDays(todayISO(), 1);
    await insert('appointments', {
      tutorId: t.id,
      patientIds: [p.id],
      start: fromLocalDateTime(day, '10:00')!,
      durationMin: 60,
      address: { street: 'X 1' },
      visitType: 'consultation',
      status: 'pending',
      statusLog: [],
      consultationIds: [],
    });
    const overlap = scheduleIssues(tables(), settings(), { start: fromLocalDateTime(day, '10:30')!, durationMin: 30 });
    expect(overlap.some((i) => i.level === 'error')).toBe(true);
    const tight = scheduleIssues(tables(), settings(), { start: fromLocalDateTime(day, '11:05')!, durationMin: 30, travelMin: 20 });
    expect(tight.some((i) => /traslado/.test(i.message))).toBe(true);
    const ok = scheduleIssues(tables(), settings(), { start: fromLocalDateTime(day, '12:00')!, durationMin: 30, travelMin: 20 });
    expect(ok).toHaveLength(0);
  });
});
