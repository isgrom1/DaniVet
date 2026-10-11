import { setDbNameForTests } from '@/lib/idb';
import { createAccount, lock } from '@/data/session';
import { useDataStore } from '@/data/store';
import { insert } from '@/data/repo';
import { allOf } from '@/data/store';

let counter = 0;

/** Crea una cuenta de prueba en una base de datos aislada (iteraciones de KDF reducidas para velocidad). */
export async function freshAccount(pass = 'contraseña de prueba 123') {
  lock();
  setDbNameForTests(`vetcasa-test-${Date.now()}-${counter++}`);
  useDataStore.setState({ status: 'none' });
  const recoveryKey = await createAccount(pass, { fullName: 'Dra. Prueba', title: 'Médica Veterinaria' }, 2_000);
  return { pass, recoveryKey };
}

export function dogSpeciesId(): string {
  return allOf('species').find((s) => s.builtin === 'dog')!.id;
}

export async function makeTutor(name = 'Ana Pérez', phone = '+56912345678') {
  return insert('tutors', {
    fullName: name,
    phone,
    addresses: [{ id: 'a1', street: 'Av. Siempre Viva 123', comuna: 'Ñuñoa', city: 'Santiago', primary: true }],
  });
}

export async function makePatient(tutorId: string, name = 'Firulais') {
  return insert('patients', {
    name,
    speciesId: dogSpeciesId(),
    sex: 'male',
    birthDateEstimated: false,
    reproductiveStatus: 'unknown',
    tutors: [{ tutorId, role: 'primary' }],
    status: 'active',
    background: {},
    allergies: [],
    adverseReactions: [],
    conditions: [],
    currentMedications: [],
    alerts: [],
    extra: {},
  });
}
