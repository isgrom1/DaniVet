import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { getAllRecords, setDbNameForTests } from '@/lib/idb';
import { allOf, useDataStore } from '@/data/store';
import { lock } from '@/data/session';
import { freshAccount, makePatient, makeTutor } from '@/test/helpers';
import { insert } from '@/data/repo';
import { readBlob, saveAttachment } from '@/features/attachments/attachments';
import { createEncryptedBackup, parseBackup, restoreBackup, restoreBackupWithRecovery, unlockBackup, verifyBackup } from './backup';

const dec = new TextDecoder();

describe('respaldo cifrado y restauración', () => {
  it('crea, verifica y restaura en un dispositivo vacío conservando asociaciones y archivos', async () => {
    const { pass } = await freshAccount();
    const tutor = await makeTutor('Paula Rivas', '+56955554444');
    const p1 = await makePatient(tutor.id, 'Toby');
    const p2 = await makePatient(tutor.id, 'Mora');
    const att = await saveAttachment({ file: new Blob(['resultado de laboratorio'], { type: 'text/plain' }), fileName: 'lab.txt', ownerKind: 'patient', kind: 'document', patientId: p1.id });

    const { blob, stats } = await createEncryptedBackup({ includeAttachments: true });
    expect(stats.blobs).toBe(1);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // El archivo no contiene datos legibles.
    const files = unzipSync(bytes);
    const recordsText = strFromU8(files['records.json']);
    expect(recordsText).not.toContain('Paula');
    expect(recordsText).not.toContain('Toby');
    expect(dec.decode(files[`blobs/${att.blobId}.bin`])).not.toContain('laboratorio');

    const parsed = await parseBackup(new Blob([bytes]));
    await expect(verifyBackup(parsed, { passphrase: 'contraseña equivocada' })).rejects.toThrow(/incorrecta/);
    const v = await verifyBackup(parsed, { passphrase: pass });
    expect(v.recordsFailed).toBe(0);
    expect(v.blobsFailed).toBe(0);
    expect(v.byTable.patients).toBe(2);

    // "Otro teléfono": base de datos nueva y vacía.
    lock();
    setDbNameForTests(`vetcasa-restore-${Date.now()}`);
    useDataStore.setState({ status: 'none' });
    expect((await getAllRecords()).length).toBe(0);
    const dek = await unlockBackup(parsed, { passphrase: pass });
    const res = await restoreBackup(parsed, dek);
    expect(res.issues).toBe(0);
    expect(useDataStore.getState().status).toBe('ready');
    const restoredPatients = allOf('patients');
    expect(restoredPatients.map((p) => p.name).sort()).toEqual(['Mora', 'Toby']);
    expect(restoredPatients.every((p) => p.tutors[0].tutorId === tutor.id)).toBe(true);
    expect(allOf('tutors')[0].fullName).toBe('Paula Rivas');
    expect(p2.id).toBe(restoredPatients.find((p) => p.name === 'Mora')!.id);
    const restoredAtt = allOf('attachments')[0];
    expect(await (await readBlob(restoredAtt.blobId, restoredAtt.mimeType)).text()).toBe('resultado de laboratorio');
  });

  it('restaura con la clave de recuperación y define una contraseña nueva', async () => {
    const { recoveryKey } = await freshAccount();
    await makeTutor('Luis Peña');
    const parsed = await parseBackup((await createEncryptedBackup({ includeAttachments: false })).blob);
    lock();
    setDbNameForTests(`vetcasa-restore-rk-${Date.now()}`);
    await restoreBackupWithRecovery(parsed, recoveryKey, 'contraseña nueva muy segura');
    expect(allOf('tutors').map((t) => t.fullName)).toEqual(['Luis Peña']);
    lock();
    const { unlockWithPassphrase } = await import('@/data/session');
    await unlockWithPassphrase('contraseña nueva muy segura');
    expect(allOf('tutors')).toHaveLength(1);
  });

  it('detecta un respaldo manipulado o dañado', async () => {
    await freshAccount();
    await insert('tutors', { fullName: 'Ana Test', phone: '+56911111111', addresses: [] });
    const { blob } = await createEncryptedBackup({ includeAttachments: false });
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const rows = JSON.parse(strFromU8(files['records.json']));
    rows.pop();
    files['records.json'] = strToU8(JSON.stringify(rows));
    const tampered = zipSync(files);
    await expect(parseBackup(new Blob([tampered]))).rejects.toThrow(/dañado/);
    await expect(parseBackup(new Blob(['no es un zip']))).rejects.toThrow(/no es un respaldo válido/);
  });
});
