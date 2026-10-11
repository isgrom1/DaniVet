import { afterEach, describe, expect, it } from 'vitest';
import { getMeta, setDbNameForTests } from '@/lib/idb';
import { freshAccount, makeTutor } from '@/test/helpers';
import { lock, unlockWithPassphrase } from './session';
import { allOf, useDataStore } from './store';
import { DATA_VERSION, DATA_VERSION_KEY, resetMigrationsForTests, setMigrationsForTests, type Migration } from './migrations';
import { createEncryptedBackup, parseBackup, restoreBackup, unlockBackup } from '@/features/backup/backup';

const upperNames: Migration = {
  to: 2,
  description: 'Nombres de tutores en mayúsculas (prueba)',
  run: (t) =>
    [...t.tutors.values()].map((r) => {
      r.fullName = String(r.fullName).toUpperCase();
      return { table: 'tutors' as const, id: String(r.id) };
    }),
};

afterEach(() => resetMigrationsForTests());

describe('migraciones del modelo de datos', () => {
  it('la cuenta nueva queda en la versión actual', async () => {
    await freshAccount();
    expect(await getMeta(DATA_VERSION_KEY)).toBe(DATA_VERSION);
  });

  it('aplica una migración pendiente una sola vez, la guarda cifrada y la registra en el historial', async () => {
    const { pass } = await freshAccount();
    const t = await makeTutor('Ana Pérez');
    lock();
    setMigrationsForTests(2, [upperNames]);
    await unlockWithPassphrase(pass);
    expect(allOf('tutors').find((x) => x.id === t.id)!.fullName).toBe('ANA PÉREZ');
    expect(allOf('tutors').find((x) => x.id === t.id)!.rev).toBe(t.rev + 1);
    expect(await getMeta(DATA_VERSION_KEY)).toBe(2);
    expect(allOf('auditLog').some((a) => a.entity === 'system' && /versión 2/.test(a.summary ?? ''))).toBe(true);
    // Al volver a abrir no se repite y el cambio persiste.
    lock();
    await unlockWithPassphrase(pass);
    expect(allOf('tutors').find((x) => x.id === t.id)!.rev).toBe(t.rev + 1);
    expect(allOf('auditLog').filter((a) => a.entity === 'system').length).toBe(1);
  });

  it('no abre datos de una versión más nueva de la app', async () => {
    const { pass } = await freshAccount();
    lock();
    setMigrationsForTests(2, []);
    await unlockWithPassphrase(pass);
    lock();
    resetMigrationsForTests();
    await expect(unlockWithPassphrase(pass)).rejects.toThrow(/versión más nueva/);
    expect(useDataStore.getState().status).toBe('locked');
  });

  it('un respaldo antiguo se migra al restaurarlo y uno más nuevo se rechaza', async () => {
    const { pass } = await freshAccount();
    await makeTutor('Luis Peña');
    const oldBackup = await parseBackup((await createEncryptedBackup({ includeAttachments: false })).blob);
    expect(oldBackup.manifest.dataVersion).toBe(DATA_VERSION);

    // App "actualizada": restaura el respaldo de la versión 1 y migra.
    lock();
    setMigrationsForTests(2, [upperNames]);
    setDbNameForTests(`vetcasa-mig-${Date.now()}`);
    await restoreBackup(oldBackup, await unlockBackup(oldBackup, { passphrase: pass }));
    expect(allOf('tutors')[0].fullName).toBe('LUIS PEÑA');
    expect(await getMeta(DATA_VERSION_KEY)).toBe(2);

    // Un respaldo creado con la versión 2 no se acepta en una app de la versión 1.
    const newer = await createEncryptedBackup({ includeAttachments: false });
    resetMigrationsForTests();
    await expect(parseBackup(newer.blob)).rejects.toThrow(/versión más nueva/);
  });
});
