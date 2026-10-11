import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/Button';
import { Field, Segmented, TextInput } from '@/components/form';
import { Notice } from '@/components/Card';
import { confirmDialog, toast } from '@/components/overlay';
import { friendlyError } from '@/data/errors';
import { readVaultHeader } from '@/data/session';
import { formatDateTime } from '@/lib/dates';
import { isPlausibleRecoveryKey, passphraseStrength } from '@/lib/crypto';
import { useUiState } from '@/lib/uiState';
import { parseBackup, restoreBackup, restoreBackupWithRecovery, unlockBackup, type ParsedBackup, BACKUP_ACCEPT, BACKUP_EXT } from '@/features/backup/backup';
import { AuthLayout } from './AuthLayout';
import { PassphraseInput } from './PassphraseInput';

export function RestoreFromBackup({ onCancel, embedded }: { onCancel: () => void; embedded?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<'pass' | 'recovery'>('pass');
  const [pass, setPass] = useState('');
  const [rk, setRk] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    setBusy(true);
    try {
      setParsed(await parseBackup(f));
      setFileName(f.name);
    } catch (e) {
      setParsed(null);
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !!parsed &&
    (mode === 'pass' ? pass.length > 0 : isPlausibleRecoveryKey(rk) && passphraseStrength(newPass).ok && newPass === newPass2);

  const submit = async () => {
    if (!parsed) return;
    setError(null);
    const existing = await readVaultHeader();
    if (existing) {
      const ok = await confirmDialog({
        title: 'Reemplazar los datos de este dispositivo',
        message: 'Ya existe una cuenta en este dispositivo. Restaurar el respaldo borrará TODOS los datos actuales y los reemplazará por los del respaldo.',
        confirmLabel: 'Reemplazar',
        tone: 'danger',
        requireText: 'REEMPLAZAR',
      });
      if (!ok) return;
    }
    setBusy(true);
    useUiState.setState({ onboarding: false });
    try {
      const res =
        mode === 'pass'
          ? await restoreBackup(parsed, await unlockBackup(parsed, { passphrase: pass }))
          : await restoreBackupWithRecovery(parsed, rk, newPass);
      toast.success(`Respaldo restaurado: ${res.records} registros y ${res.blobs} archivos.${res.issues ? ` ${res.issues} registro(s) con advertencias.` : ''}`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={BACKUP_ACCEPT}
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
        data-testid="backup-file-input"
      />
      <Button variant="secondary" block size="lg" icon={<FileUp className="size-5" />} onClick={() => fileRef.current?.click()} loading={busy && !parsed}>
        {parsed ? 'Elegir otro archivo' : 'Elegir archivo de respaldo'}
      </Button>
      {parsed && (
        <Notice tone="success" title={fileName}>
          Respaldo creado el {formatDateTime(parsed.manifest.createdAt)} · {parsed.manifest.recordCount} registros
          {parsed.manifest.includesAttachments ? ` · ${parsed.manifest.blobCount} archivos adjuntos` : ' · sin adjuntos'}
        </Notice>
      )}
      {parsed && (
        <>
          <Segmented
            name="Método"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'pass', label: 'Con contraseña' },
              { value: 'recovery', label: 'Con clave de recuperación' },
            ]}
          />
          {mode === 'pass' ? (
            <PassphraseInput label="Contraseña vigente al crear el respaldo" value={pass} onChange={setPass} onEnter={() => canSubmit && void submit()} />
          ) : (
            <div className="space-y-4">
              <Field label="Clave de recuperación" htmlFor="rk" hint="32 caracteres, con o sin guiones.">
                <TextInput id="rk" value={rk} onChange={(e) => setRk(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} className="font-mono" />
              </Field>
              <PassphraseInput label="Nueva contraseña para este dispositivo" autoComplete="new-password" value={newPass} onChange={setNewPass} showStrength />
              <PassphraseInput label="Repite la nueva contraseña" autoComplete="new-password" value={newPass2} onChange={setNewPass2} />
            </div>
          )}
        </>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Atrás
        </Button>
        <Button block size="lg" disabled={!canSubmit} loading={busy && !!parsed} onClick={submit}>
          Restaurar
        </Button>
      </div>
    </>
  );
  if (embedded) return <div className="space-y-4">{body}</div>;
  return (
    <AuthLayout title="Restaurar desde un respaldo" subtitle={`Usa un archivo .${BACKUP_EXT} creado desde Ajustes › Respaldo. Los datos de este dispositivo se reemplazarán.`}>
      {body}
    </AuthLayout>
  );
}
