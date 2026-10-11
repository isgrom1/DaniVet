import { useRef, useState } from 'react';
import { DatabaseBackup, FileArchive, FileCheck, ShieldCheck } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice, Section } from '@/components/Card';
import { Segmented, Switch, TextInput } from '@/components/form';
import { Sheet, confirmDialog, promptDialog, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { insert } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { verifyPassphrase } from '@/data/session';
import { TABLE_LABEL } from '@/data/labels';
import { formatDateTime } from '@/lib/dates';
import { downloadFile, shareFile } from '@/lib/share';
import { useMeta } from '@/lib/useMeta';
import { PassphraseInput } from '@/features/auth/PassphraseInput';
import { RestoreFromBackup } from '@/features/auth/RestoreFromBackup';
import { formatBytes } from '@/features/attachments/attachments';
import { createEncryptedBackup, exportOpenData, parseBackup, verifyBackup, type ParsedBackup, type VerifyResult, BACKUP_ACCEPT, BACKUP_EXT } from '@/features/backup/backup';

async function deliver(blob: Blob, fileName: string) {
  const r = await shareFile(blob, fileName).catch(() => 'unsupported' as const);
  if (r === 'unsupported') downloadFile(blob, fileName);
  return r;
}

export function BackupSettings() {
  const tables = useTables();
  const [withFiles, setWithFiles] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [ready, setReady] = useState<{ blob: Blob; fileName: string; info: string } | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const lastBackup = useMeta<string>('lastBackupAt', [ready]);

  const backup = async () => {
    setBusy('backup');
    try {
      const res = await createEncryptedBackup({ includeAttachments: withFiles });
      await insert('auditLog', { at: new Date().toISOString(), entity: 'export', entityId: 'backup', action: 'export', summary: `Respaldo cifrado (${res.stats.records} registros, ${res.stats.blobs} archivos)` });
      setReady({ blob: res.blob, fileName: res.fileName, info: `${res.stats.records} registros · ${res.stats.blobs} archivos · ${formatBytes(res.stats.bytes)}` });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const openExport = async () => {
    const ok = await confirmDialog({
      title: 'Exportación abierta (sin cifrar)',
      message: (
        <>
          <p>Se generará un archivo ZIP con todos los datos <strong>legibles sin contraseña</strong> (tutores, pacientes, fichas, recetas y adjuntos).</p>
          <p>Úsalo solo para migrar a otro sistema o entregar información a quien corresponda. Guárdalo en un lugar seguro y elimínalo después.</p>
        </>
      ),
      confirmLabel: 'Entiendo, continuar',
      tone: 'danger',
    });
    if (!ok) return;
    const pass = await promptDialog({ title: 'Confirma tu identidad', label: 'Contraseña', inputType: 'password', confirmLabel: 'Generar exportación' });
    if (!pass) return;
    if (!(await verifyPassphrase(pass))) {
      toast.error('Contraseña incorrecta.');
      return;
    }
    setBusy('open');
    try {
      const { blob, fileName } = await exportOpenData({ includeAttachments: withFiles });
      await insert('auditLog', { at: new Date().toISOString(), entity: 'export', entityId: 'open-export', action: 'export', summary: 'Exportación abierta (sin cifrar) de todos los datos' });
      await deliver(blob, fileName);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const counts = { patients: tables.patients.size, tutors: tables.tutors.size, consultations: tables.consultations.size, attachments: tables.attachments.size };

  return (
    <>
      <PageHeader title="Respaldo y exportación" back="/mas" />
      <Page>
        <Notice tone={lastBackup ? 'info' : 'warning'} icon={<DatabaseBackup className="size-5" />} title={lastBackup ? `Último respaldo: ${formatDateTime(lastBackup)}` : 'Aún no has creado respaldos'}>
          Tus datos existen solo en este dispositivo. Si lo pierdes o se borra la app, solo podrás recuperarlos desde un respaldo. Recomendación: crea uno cada semana y guárdalo en
          iCloud Drive, Google Drive o envíalo a tu correo.
        </Notice>
        <Section title="Respaldo cifrado (recomendado)">
          <Card className="space-y-3">
            <p className="text-[15px] text-ink-700">
              Archivo <strong>.{BACKUP_EXT}</strong> cifrado con tu contraseña actual (o tu clave de recuperación). Contiene {counts.patients} pacientes, {counts.tutors} tutores,{' '}
              {counts.consultations} consultas y {counts.attachments} adjuntos.
            </p>
            <Switch checked={withFiles} onChange={setWithFiles} label="Incluir fotos y documentos adjuntos" description="El archivo será más grande." />
            <Button block size="lg" icon={<ShieldCheck className="size-5" />} loading={busy === 'backup'} onClick={backup}>
              Crear respaldo cifrado
            </Button>
          </Card>
        </Section>
        <Section title="Comprobar un respaldo">
          <Card className="space-y-2">
            <p className="text-[15px] text-ink-700">Verifica que un archivo de respaldo se puede descifrar y recuperar completo, sin modificar tus datos actuales.</p>
            <Button block variant="secondary" icon={<FileCheck className="size-4" />} onClick={() => setVerifyOpen(true)}>
              Verificar un respaldo
            </Button>
          </Card>
        </Section>
        <Section title="Exportación abierta para migrar">
          <Card className="space-y-2">
            <p className="text-[15px] text-ink-700">ZIP con JSON (relaciones conservadas), CSV y adjuntos. No está cifrado: requiere confirmar tu contraseña y queda registrado en el historial.</p>
            <Button block variant="secondary" icon={<FileArchive className="size-4" />} loading={busy === 'open'} onClick={openExport}>
              Exportar todos los datos (sin cifrar)
            </Button>
            <p className="text-xs text-ink-500">Para entregar la ficha de un solo paciente, usa “Exportar ficha clínica (PDF)” desde su ficha.</p>
          </Card>
        </Section>
        <Section title="Restaurar">
          <Card className="space-y-2">
            <p className="text-[15px] text-ink-700">Reemplaza todos los datos de este dispositivo por los de un respaldo.</p>
            <Button block variant="secondary" className="text-red-700" onClick={() => setRestoreOpen(true)}>
              Restaurar desde un respaldo
            </Button>
          </Card>
        </Section>
      </Page>
      {ready && (
        <Sheet open onClose={() => setReady(null)} title="Respaldo listo">
          <div className="space-y-3">
            <p className="text-[15px]">
              <strong>{ready.fileName}</strong>
              <br />
              <span className="text-sm text-ink-500">{ready.info}</span>
            </p>
            <Button block size="lg" onClick={() => void deliver(ready.blob, ready.fileName)}>
              Guardar o compartir el archivo
            </Button>
            <p className="text-sm text-ink-600">En el iPhone elige “Guardar en Archivos” (por ejemplo, en iCloud Drive) o envíalo a tu correo. Para abrirlo necesitarás tu contraseña actual o tu clave de recuperación.</p>
          </div>
        </Sheet>
      )}
      {verifyOpen && <VerifySheet onClose={() => setVerifyOpen(false)} />}
      {restoreOpen && (
        <Sheet open onClose={() => setRestoreOpen(false)} title="Restaurar respaldo" size="full">
          <RestoreFromBackup embedded onCancel={() => setRestoreOpen(false)} />
        </Sheet>
      )}
    </>
  );
}

function VerifySheet({ onClose }: { onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [mode, setMode] = useState<'pass' | 'rk'>('pass');
  const [secret, setSecret] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File) => {
    if (!f) return;
    setError(null);
    setResult(null);
    try {
      setParsed(await parseBackup(f));
    } catch (e) {
      setError(friendlyError(e));
    }
  };
  const run = async () => {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await verifyBackup(parsed, mode === 'pass' ? { passphrase: secret } : { recoveryKey: secret }));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="Verificar respaldo" size="full">
      <div className="space-y-4">
        <input ref={input} type="file" accept={BACKUP_ACCEPT} className="hidden" onChange={(e) => void pick(e.target.files?.[0])} data-testid="verify-file-input" />
        <Button block variant="secondary" onClick={() => input.current?.click()}>
          {parsed ? 'Elegir otro archivo' : `Elegir archivo .${BACKUP_EXT}`}
        </Button>
        {parsed && (
          <>
            <Notice tone="neutral">
              Respaldo del {formatDateTime(parsed.manifest.createdAt)} · {parsed.manifest.recordCount} registros · {parsed.manifest.blobCount} archivos
            </Notice>
            <Segmented
              name="Método"
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'pass', label: 'Contraseña' },
                { value: 'rk', label: 'Clave de recuperación' },
              ]}
            />
            {mode === 'pass' ? <PassphraseInput label="Contraseña del respaldo" value={secret} onChange={setSecret} /> : <TextInput value={secret} onChange={(e) => setSecret(e.target.value)} aria-label="Clave de recuperación" className="font-mono" />}
            <Button block onClick={run} loading={busy} disabled={!secret}>
              Verificar
            </Button>
          </>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        {result && (
          <Notice tone={result.recordsFailed || result.blobsFailed ? 'danger' : 'success'} title={result.recordsFailed || result.blobsFailed ? 'El respaldo tiene problemas' : 'Respaldo verificado: se puede restaurar'}>
            <p>
              {result.records} registros descifrados correctamente{result.recordsFailed ? `, ${result.recordsFailed} con error` : ''}. {result.blobs} archivos correctos
              {result.blobsFailed ? `, ${result.blobsFailed} con error` : ''}.
            </p>
            <p className="mt-1 text-xs">
              {Object.entries(result.byTable)
                .filter(([k]) => TABLE_LABEL[k])
                .map(([k, v]) => `${TABLE_LABEL[k]}: ${v}`)
                .join(' · ')}
            </p>
          </Notice>
        )}
      </div>
    </Sheet>
  );
}
