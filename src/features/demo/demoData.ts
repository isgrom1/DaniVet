import { batch } from '@/data/repo';
import { getTable, useDataStore } from '@/data/store';
import { TABLES, type TableName } from '@/data/schema';
import { addDays, birthDateFromAge, fromLocalDateTime, todayISO } from '@/lib/dates';
import { newId, nowISO } from '@/lib/ids';
import { newConsultation } from '@/features/consultations/model';
import { UserError } from '@/data/errors';

/**
 * Datos de demostración: todos llevan `demo: true` y “(DEMO)” en sus nombres, para que nunca se confundan
 * con registros reales. Se eliminan completos desde Ajustes › Datos de demostración.
 */
export async function loadDemoData(): Promise<void> {
  if (hasDemoData()) throw new UserError('Los datos de demostración ya están cargados.');
  const t = useDataStore.getState().tables;
  const dog = [...t.species.values()].find((s) => s.builtin === 'dog');
  const cat = [...t.species.values()].find((s) => s.builtin === 'cat');
  if (!dog || !cat) throw new UserError('Faltan las especies Perro y Gato.');
  const today = todayISO();
  const D = { demo: true };
  const b = batch();
  const pro = t.profile.get('profile')?.fullName ?? 'Profesional';

  const srvConsult = b.insert('services', { ...D, name: 'Consulta a domicilio (DEMO)', category: 'fee', priceCLP: 30000, durationMin: 60, active: true });
  const srvTravel = b.insert('services', { ...D, name: 'Recargo por traslado (DEMO)', category: 'travel', priceCLP: 5000, active: true });

  const maria = b.insert('tutors', {
    ...D,
    fullName: 'María González (DEMO)',
    phone: '+56900000001',
    email: 'maria.demo@ejemplo.cl',
    contactPreference: 'whatsapp',
    addresses: [{ id: newId(), label: 'Casa', street: 'Av. Ejemplo 123, depto 45', comuna: 'Ñuñoa', city: 'Santiago', directions: 'Conserjería en el primer piso (ejemplo).', primary: true }],
    notes: 'Tutor de ejemplo para conocer la app.',
  });
  const jorge = b.insert('tutors', {
    ...D,
    fullName: 'Jorge Muñoz (DEMO)',
    phone: '+56900000002',
    contactPreference: 'call',
    addresses: [{ id: newId(), label: 'Casa', street: 'Calle Ficticia 456', comuna: 'Providencia', city: 'Santiago', primary: true }],
  });
  const empty = { background: {}, adverseReactions: [], conditions: [], currentMedications: [], extra: {} };
  const luna = b.insert('patients', {
    ...D,
    ...empty,
    name: 'Luna (DEMO)',
    speciesId: dog.id,
    breed: 'Mestiza',
    sex: 'female',
    reproductiveStatus: 'neutered',
    birthDate: birthDateFromAge(4, 2),
    birthDateEstimated: true,
    color: 'Café',
    tutors: [{ tutorId: maria.id, role: 'primary' }],
    status: 'active',
    allergies: [{ id: newId(), substance: 'Sustancia de ejemplo (DEMO)', reaction: 'Prurito (ejemplo)', severity: 'mild', source: 'owner', confirmed: false, notedAt: today }],
    alerts: [{ id: newId(), text: 'Ejemplo: se pone nerviosa al cortar uñas', level: 'warning', pendingConfirmation: false, createdAt: nowISO() }],
  });
  const michi = b.insert('patients', {
    ...D,
    ...empty,
    name: 'Michi (DEMO)',
    speciesId: cat.id,
    breed: 'Doméstico pelo corto',
    sex: 'male',
    reproductiveStatus: 'neutered',
    birthDate: birthDateFromAge(2, 0),
    birthDateEstimated: false,
    tutors: [{ tutorId: maria.id, role: 'primary' }],
    status: 'active',
    allergies: [],
    alerts: [],
    extra: { outdoor: 'Solo interior' },
  });
  const rocky = b.insert('patients', {
    ...D,
    ...empty,
    name: 'Rocky (DEMO)',
    speciesId: dog.id,
    breed: 'Labrador',
    sex: 'male',
    reproductiveStatus: 'intact',
    birthDate: birthDateFromAge(7, 5),
    birthDateEstimated: false,
    microchip: '000000000000000',
    tutors: [{ tutorId: jorge.id, role: 'primary' }],
    status: 'active',
    allergies: [],
    alerts: [],
  });

  b.insert('weights', { ...D, patientId: luna.id, date: addDays(today, -350), weightKg: 18.2, source: 'manual' });
  b.insert('weights', { ...D, patientId: luna.id, date: addDays(today, -30), weightKg: 18.9, source: 'manual' });

  const apptToday = b.insert('appointments', {
    ...D,
    tutorId: maria.id,
    patientIds: [luna.id, michi.id],
    start: fromLocalDateTime(today, '10:00')!,
    durationMin: 60,
    travelMin: 20,
    address: { street: 'Av. Ejemplo 123, depto 45', comuna: 'Ñuñoa', city: 'Santiago' },
    reason: 'Vacunación y control (ejemplo)',
    visitType: 'vaccination',
    status: 'confirmed',
    statusLog: [{ status: 'confirmed', at: nowISO() }],
    consultationIds: [],
  });
  b.insert('appointments', {
    ...D,
    tutorId: jorge.id,
    patientIds: [rocky.id],
    start: fromLocalDateTime(addDays(today, 1), '15:30')!,
    durationMin: 45,
    travelMin: 25,
    address: { street: 'Calle Ficticia 456', comuna: 'Providencia', city: 'Santiago' },
    reason: 'Control (ejemplo)',
    visitType: 'control',
    status: 'pending',
    statusLog: [{ status: 'pending', at: nowISO() }],
    consultationIds: [],
  });
  void apptToday;

  const started = fromLocalDateTime(addDays(today, -20), '11:00')!;
  const base = newConsultation({ patientId: rocky.id, tutorId: jorge.id, professionalName: pro, startedAt: started });
  const cons = b.insert('consultations', {
    ...D,
    ...base,
    status: 'final',
    finalizedAt: started,
    reason: { main: 'Ejemplo: sacude la cabeza (DEMO)', ownerSymptoms: 'Texto de ejemplo informado por el tutor.' },
    exam: {
      ...base.exam,
      weightKg: 31.5,
      temperatureC: 38.6,
      systems: { ...base.exam.systems, otic: { status: 'abnormal', notes: 'Hallazgo de ejemplo (DEMO).' } },
    },
    plan: { homeCare: 'Indicación de ejemplo (DEMO).', controlDate: addDays(today, 2) },
  });
  b.insert('weights', { ...D, patientId: rocky.id, consultationId: cons.id, date: addDays(today, -20), weightKg: 31.5, source: 'consultation' });
  b.insert('diagnoses', { ...D, consultationId: cons.id, patientId: rocky.id, kind: 'presumptive', name: 'Diagnóstico de ejemplo (DEMO)', status: 'active' });
  b.insert('treatments', {
    ...D,
    consultationId: cons.id,
    patientId: rocky.id,
    kind: 'medication',
    name: 'Medicamento de ejemplo (DEMO)',
    dose: 'Dosis de ejemplo',
    frequency: 'Cada 12 horas',
    durationDays: 14,
    startDate: addDays(today, -20),
    endDate: addDays(today, -7),
    status: 'active',
  });
  b.insert('prescriptions', {
    ...D,
    patientId: rocky.id,
    tutorId: jorge.id,
    consultationId: cons.id,
    date: addDays(today, -20),
    status: 'issued',
    issuedAt: started,
    professional: { fullName: pro, title: t.profile.get('profile')?.title ?? '' },
    patientSnap: { name: 'Rocky (DEMO)', species: 'Perro', breed: 'Labrador', weightKg: 31.5 },
    tutorSnap: { fullName: 'Jorge Muñoz (DEMO)' },
    items: [{ id: newId(), medicationName: 'Medicamento de ejemplo (DEMO)', dose: 'Dosis de ejemplo', frequency: 'Cada 12 horas', duration: '14 días', antimicrobial: false, controlled: false }],
    notes: 'Receta de demostración: no tiene validez.',
  });
  b.insert('vaccinations', {
    ...D,
    patientId: luna.id,
    date: addDays(today, -350),
    vaccineName: 'Vacuna de ejemplo (DEMO)',
    lotNumber: 'DEMO-001',
    productExpiry: addDays(today, 200),
    professionalName: pro,
    nextDueDate: addDays(today, 15),
    nextDueSource: 'manual',
    status: 'applied',
  });
  b.insert('dewormings', {
    ...D,
    patientId: rocky.id,
    date: addDays(today, -80),
    kind: 'internal',
    product: 'Antiparasitario de ejemplo (DEMO)',
    weightKgUsed: 31.5,
    weightSource: 'last_record',
    professionalName: pro,
    nextDueDate: addDays(today, 10),
    nextDueSource: 'manual',
    status: 'applied',
  });
  b.insert('exams', { ...D, patientId: rocky.id, consultationId: cons.id, type: 'hemogram', name: 'Examen de ejemplo (DEMO)', requestedAt: addDays(today, -20), sampleDate: addDays(today, -20), lab: 'Laboratorio de ejemplo', status: 'received', results: 'Resultado de ejemplo (DEMO).', resultsSource: 'transcribed', receivedAt: addDays(today, -2) });
  const charge = b.insert('charges', {
    ...D,
    tutorId: jorge.id,
    patientId: rocky.id,
    consultationId: cons.id,
    date: addDays(today, -20),
    items: [
      { id: newId(), serviceId: srvConsult.id, description: 'Consulta a domicilio (DEMO)', category: 'fee', qty: 1, unitPriceCLP: 30000, discountCLP: 0 },
      { id: newId(), serviceId: srvTravel.id, description: 'Recargo por traslado (DEMO)', category: 'travel', qty: 1, unitPriceCLP: 5000, discountCLP: 0 },
    ],
    discountCLP: 0,
    voided: false,
  });
  b.insert('payments', { ...D, chargeId: charge.id, tutorId: jorge.id, date: addDays(today, -20), amountCLP: 20000, methodId: 'transfer', methodName: 'Transferencia', voided: false });
  b.insert('expenses', { ...D, date: addDays(today, -20), category: 'travel', description: 'Traslado de ejemplo (DEMO)', amountCLP: 3500, km: 12 });
  const item = b.insert('inventoryItems', { ...D, name: 'Producto de ejemplo (DEMO)', category: 'vaccine', unit: 'dosis', minStock: 3, active: true });
  const lot = b.insert('inventoryLots', { ...D, itemId: item.id, lotNumber: 'DEMO-001', expiryDate: addDays(today, 200) });
  b.insert('inventoryMovements', { ...D, itemId: item.id, lotId: lot.id, date: addDays(today, -60), type: 'in', quantity: 2 });
  b.insert('tasks', { ...D, title: 'Llamar a Jorge para saber cómo sigue Rocky (DEMO)', type: 'contact_owner', dueDate: today, status: 'pending', patientId: rocky.id, consultationId: cons.id });
  await b.commit();
}

export function hasDemoData(): boolean {
  const t = useDataStore.getState().tables;
  return TABLES.some((name) => [...(t[name] as Map<string, { demo?: boolean }>).values()].some((r) => r.demo));
}

export function countDemo(): number {
  const t = useDataStore.getState().tables;
  return TABLES.reduce((s, name) => s + [...(t[name] as Map<string, { demo?: boolean }>).values()].filter((r) => r.demo).length, 0);
}

/** Elimina todos los registros de demostración (y su historial). Falla si hay registros reales vinculados a ellos. */
export async function removeDemoData(): Promise<number> {
  const ids = new Set<string>();
  const b = batch();
  let n = 0;
  for (const name of TABLES) {
    for (const r of getTable(name as TableName).values() as Iterable<{ id: string; demo?: boolean }>) {
      if (!r.demo) continue;
      ids.add(r.id);
      b.remove(name as TableName, r.id, { audit: false });
      n++;
    }
  }
  for (const a of getTable('auditLog').values()) if (ids.has(a.entityId)) b.remove('auditLog', a.id, { audit: false });
  await b.commit();
  return n;
}
