import { describe, expect, it } from 'vitest';
import { getAllRecords } from '@/lib/idb';
import { batch, insert, remove, update } from './repo';
import { ConflictError, IntegrityError, LockedRecordError, ValidationError } from './errors';
import { allOf, getRecord, useDataStore } from './store';
import {
  PinLockedOutError,
  disablePin,
  enablePin,
  lock,
  recoverWithKey,
  unlockWithPassphrase,
  unlockWithPin,
} from './session';
import { freshAccount, makePatient, makeTutor } from '@/test/helpers';
import { newConsultation } from '@/features/consultations/model';

const dec = new TextDecoder();

describe('bóveda local cifrada', () => {
  it('crea la cuenta con datos iniciales y guarda todo cifrado', async () => {
    const { recoveryKey } = await freshAccount();
    expect(recoveryKey).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
    expect(getRecord('profile', 'profile')?.fullName).toBe('Dra. Prueba');
    expect(allOf('species').map((s) => s.name).sort()).toEqual(['Gato', 'Perro']);
    await makeTutor('Ana Pérez Secreta', '+56998765432');

    const rows = await getAllRecords();
    expect(rows.length).toBeGreaterThan(4);
    for (const r of rows) {
      const raw = dec.decode(new Uint8Array(r.ct));
      expect(raw).not.toContain('Ana Pérez');
      expect(raw).not.toContain('98765432');
      expect(raw).not.toContain('Perro');
    }
  });

  it('bloquea, rechaza contraseña incorrecta y restaura los datos con la correcta', async () => {
    const { pass } = await freshAccount();
    await makeTutor('Carla Soto');
    lock();
    expect(useDataStore.getState().status).toBe('locked');
    expect(allOf('tutors')).toHaveLength(0);
    await expect(unlockWithPassphrase('otra contraseña')).rejects.toThrow(/incorrecta/);
    expect(allOf('tutors')).toHaveLength(0);
    await unlockWithPassphrase(pass);
    expect(allOf('tutors').map((t) => t.fullName)).toEqual(['Carla Soto']);
  });

  it('recupera el acceso con la clave de recuperación y define nueva contraseña', async () => {
    const { pass, recoveryKey } = await freshAccount();
    await makeTutor('Luis Rojas');
    lock();
    await recoverWithKey(recoveryKey.toLowerCase().replace(/-/g, ' '), 'nueva contraseña segura 456');
    expect(allOf('tutors')).toHaveLength(1);
    lock();
    await expect(unlockWithPassphrase(pass)).rejects.toThrow();
    await unlockWithPassphrase('nueva contraseña segura 456');
    expect(allOf('tutors')).toHaveLength(1);
  });

  it('PIN: desbloquea, cuenta intentos y exige contraseña tras 5 fallos', async () => {
    const { pass } = await freshAccount();
    await enablePin('2468');
    lock();
    await expect(unlockWithPin('1111')).rejects.toThrow(/4 intento/);
    await unlockWithPin('2468');
    expect(useDataStore.getState().status).toBe('ready');
    lock();
    for (let i = 0; i < 4; i++) await expect(unlockWithPin('0000')).rejects.toThrow(/PIN incorrecto/);
    await expect(unlockWithPin('0000')).rejects.toBeInstanceOf(PinLockedOutError);
    await expect(unlockWithPin('2468')).rejects.toBeInstanceOf(PinLockedOutError);
    await unlockWithPassphrase(pass);
    await disablePin();
  });
});

describe('integridad de datos', () => {
  it('valida campos obligatorios con mensajes en español', async () => {
    await freshAccount();
    await expect(insert('tutors', { fullName: ' ', addresses: [] })).rejects.toBeInstanceOf(ValidationError);
    try {
      await insert('tutors', { fullName: '', addresses: [] });
    } catch (e) {
      expect((e as ValidationError).issues[0].message).toBe('Ingresa el nombre del tutor');
    }
  });

  it('asocia varios pacientes a un tutor y protege las referencias', async () => {
    await freshAccount();
    const t = await makeTutor();
    const p1 = await makePatient(t.id, 'Luna');
    const p2 = await makePatient(t.id, 'Simón');
    const ofTutor = allOf('patients').filter((p) => p.tutors.some((x) => x.tutorId === t.id));
    expect(ofTutor.map((p) => p.name).sort()).toEqual(['Luna', 'Simón']);
    expect(p1.id).not.toBe(p2.id);

    await expect(makePatient('no-existe')).rejects.toBeInstanceOf(IntegrityError);
    await expect(remove('tutors', t.id)).rejects.toBeInstanceOf(IntegrityError);
    expect(getRecord('tutors', t.id)).toBeDefined();
  });

  it('impide sobrescribir una consulta finalizada y registra enmiendas', async () => {
    await freshAccount();
    const t = await makeTutor();
    const p = await makePatient(t.id);
    const c = await insert('consultations', newConsultation({ patientId: p.id, tutorId: t.id, professionalName: 'Dra. Prueba' }));
    await update('consultations', c.id, (cur) => ({ ...cur, reason: { ...cur.reason, main: 'Vómitos' } }), { audit: false });
    await update('consultations', c.id, { status: 'final', finalizedAt: new Date().toISOString() }, { action: 'finalize' });

    await expect(
      update('consultations', c.id, (cur) => ({ ...cur, reason: { ...cur.reason, main: 'Diarrea' } })),
    ).rejects.toBeInstanceOf(LockedRecordError);
    await expect(
      update('consultations', c.id, (cur) => ({ ...cur, reason: { ...cur.reason, main: 'Diarrea' } }), { amend: true }),
    ).rejects.toThrow(/motivo/);

    await update('consultations', c.id, (cur) => ({ ...cur, version: cur.version + 1, reason: { ...cur.reason, main: 'Vómitos y diarrea' } }), {
      amend: true,
      reason: 'Se completó la información del motivo',
    });
    const audit = allOf('auditLog').filter((a) => a.entityId === c.id);
    const amend = audit.find((a) => a.action === 'amend');
    expect(amend?.reason).toBe('Se completó la información del motivo');
    expect(amend?.changes?.find((ch) => ch.field === 'reason.main')).toEqual({
      field: 'reason.main',
      before: 'Vómitos',
      after: 'Vómitos y diarrea',
    });
    expect(audit.some((a) => a.action === 'finalize')).toBe(true);
  });

  it('detecta conflictos de edición por revisión', async () => {
    await freshAccount();
    const t = await makeTutor();
    const stale = t.rev;
    await update('tutors', t.id, { notes: 'primera edición' });
    await expect(update('tutors', t.id, { notes: 'segunda' }, { baseRev: stale })).rejects.toBeInstanceOf(ConflictError);
    expect(getRecord('tutors', t.id)?.notes).toBe('primera edición');
  });

  it('escribe lotes de forma atómica: si algo falla, no se guarda nada', async () => {
    await freshAccount();
    const t = await makeTutor();
    const before = (await getAllRecords()).length;
    const b = batch();
    b.insert('patients', {
      name: 'Kira',
      speciesId: allOf('species')[0].id,
      sex: 'female',
      birthDateEstimated: false,
      reproductiveStatus: 'neutered',
      tutors: [{ tutorId: t.id, role: 'primary' }],
      status: 'active',
      background: {},
      allergies: [],
      adverseReactions: [],
      conditions: [],
      currentMedications: [],
      alerts: [],
      extra: {},
    });
    b.insert('weights', { patientId: 'inexistente', date: '2026-10-11', weightKg: 4.2, source: 'manual' });
    await expect(b.commit()).rejects.toBeInstanceOf(IntegrityError);
    expect((await getAllRecords()).length).toBe(before);
    expect(allOf('patients')).toHaveLength(0);
  });
});
