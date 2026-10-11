import { useEffect, useState } from 'react';
import { HardDrive, KeyRound, Lock, ShieldAlert, Smartphone } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice, Section } from '@/components/Card';
import { Field, Select, TextInput } from '@/components/form';
import { Sheet, confirmDialog, promptDialog, toast } from '@/components/overlay';
import { useSettings } from '@/data/hooks';
import { update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { changePassphrase, disablePin, enablePin, pinSessionInfo, regenerateRecovery, verifyPassphrase, wipeDevice } from '@/data/session';
import { estimateStorage, requestPersistence } from '@/lib/idb';
import { passphraseStrength } from '@/lib/crypto';
import { formatDate } from '@/lib/dates';
import { isIOS, isStandalone } from '@/lib/platform';
import { PassphraseInput } from '@/features/auth/PassphraseInput';
import { RecoveryKeyView } from '@/features/auth/RecoveryKeyView';
import { formatBytes } from '@/features/attachments/attachments';

export function SecuritySettings() {
  const settings = useSettings();
  const [pinInfo, setPinInfo] = useState<{ expiresAt: string } | null>(null);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const [passOpen, setPassOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const refresh = () => {
    void pinSessionInfo().then(setPinInfo);
    void estimateStorage().then(setStorage);
  };
  useEffect(refresh, []);

  const setAutoLock = async (minutes: number) => {
    try {
      await update('settings', 'settings', (cur) => ({ ...cur, security: { autoLockMinutes: minutes } }));
      toast.success('Bloqueo automático actualizado');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const regen = async () => {
    const pass = await promptDialog({ title: 'Nueva clave de recuperación', message: 'La clave anterior dejará de funcionar para este dispositivo (los respaldos antiguos siguen abriéndose con la clave que tenían).', label: 'Tu contraseña actual', inputType: 'password', confirmLabel: 'Continuar' });
    if (!pass) return;
    try {
      setNewKey(await regenerateRecovery(pass));
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const wipe = async () => {
    const pass = await promptDialog({ title: 'Eliminar todos los datos', message: 'Confirma con tu contraseña. Se borrará todo lo guardado en este dispositivo.', label: 'Contraseña', inputType: 'password', confirmLabel: 'Continuar' });
    if (!pass) return;
    if (!(await verifyPassphrase(pass))) {
      toast.error('Contraseña incorrecta.');
      return;
    }
    const ok = await confirmDialog({ title: '¿Eliminar definitivamente?', message: 'Solo podrás recuperar la información desde un respaldo.', confirmLabel: 'Eliminar todo', tone: 'danger', requireText: 'BORRAR' });
    if (!ok) return;
    await wipeDevice();
  };

  return (
    <>
      <PageHeader title="Seguridad" back="/mas" />
      <Page>
        <Section title="Bloqueo">
          <Card className="space-y-4">
            <Field label="Bloqueo automático por inactividad" hint="También se bloquea si la app pasa ese tiempo en segundo plano.">
              <Select value={String(settings.security.autoLockMinutes)} onChange={(e) => void setAutoLock(Number(e.target.value))} aria-label="Bloqueo automático">
                {[1, 5, 15, 30, 60, 240, 480].map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minuto${m > 1 ? 's' : ''}` : `${m / 60} hora${m > 60 ? 's' : ''}`}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Desbloqueo rápido con PIN</p>
                <p className="text-sm text-ink-500">{pinInfo ? `Activo hasta el ${formatDate(pinInfo.expiresAt)}; luego se pedirá la contraseña.` : 'Desactivado: se pide la contraseña al desbloquear.'}</p>
              </div>
              {pinInfo ? (
                <Button size="sm" variant="secondary" onClick={() => void disablePin().then(refresh).then(() => toast.success('PIN desactivado'))}>
                  Desactivar
                </Button>
              ) : (
                <Button size="sm" onClick={() => setPinOpen(true)}>
                  Activar
                </Button>
              )}
            </div>
          </Card>
        </Section>
        <Section title="Contraseña y recuperación">
          <Card className="space-y-2">
            <Button block variant="secondary" icon={<Lock className="size-4" />} onClick={() => setPassOpen(true)}>
              Cambiar contraseña
            </Button>
            <Button block variant="secondary" icon={<KeyRound className="size-4" />} onClick={regen}>
              Generar nueva clave de recuperación
            </Button>
          </Card>
        </Section>
        <Section title="Almacenamiento en el dispositivo">
          <Card className="space-y-2 text-[15px]">
            <p className="flex items-center gap-2">
              <HardDrive className="size-4" /> Usado: {storage.usage !== undefined ? formatBytes(storage.usage) : 'desconocido'}
              {storage.quota ? ` de ${formatBytes(storage.quota)} disponibles` : ''}
            </p>
            <p className="flex items-center gap-2">
              <Smartphone className="size-4" /> {isStandalone() ? 'Abierta desde la pantalla de inicio' : 'Abierta en el navegador'}
              {isIOS() && !isStandalone() && <span className="text-amber-800">: se recomienda usarla desde el ícono de inicio.</span>}
            </p>
            <p>Almacenamiento persistente: {storage.persisted ? 'concedido' : 'no confirmado por el navegador'}</p>
            {!storage.persisted && (
              <Button size="sm" variant="secondary" onClick={() => void requestPersistence().then((ok) => { toast.info(ok ? 'El navegador concedió almacenamiento persistente.' : 'El navegador no lo concedió. Crea respaldos frecuentes.'); refresh(); })}>
                Solicitar almacenamiento persistente
              </Button>
            )}
          </Card>
        </Section>
        <Section title="Pérdida o robo del teléfono">
          <Notice tone="info" icon={<ShieldAlert className="size-5" />}>
            Los datos están cifrados: sin tu contraseña (o el PIN mientras esté vigente) no pueden leerse desde la app. Además: 1) usa código y Face ID en el iPhone; 2) si lo
            pierdes, usa “Buscar mi iPhone” para bloquearlo o borrarlo; 3) restaura tu último respaldo en el nuevo teléfono; 4) cambia tu contraseña y genera una nueva clave de
            recuperación.
          </Notice>
        </Section>
        <Button variant="ghost" className="text-red-700" onClick={wipe}>
          Eliminar todos los datos de este dispositivo
        </Button>
      </Page>
      {passOpen && <ChangePassSheet onClose={() => setPassOpen(false)} />}
      {pinOpen && (
        <PinSheet
          onClose={() => {
            setPinOpen(false);
            refresh();
          }}
        />
      )}
      {newKey && (
        <Sheet open onClose={() => setNewKey(null)} title="Nueva clave de recuperación">
          <RecoveryKeyView recoveryKey={newKey} onDone={() => setNewKey(null)} doneLabel="Listo" />
        </Sheet>
      )}
    </>
  );
}

function ChangePassSheet({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = cur && passphraseStrength(next).ok && next === next2;
  const save = async () => {
    setBusy(true);
    try {
      await changePassphrase(cur, next);
      toast.success('Contraseña cambiada. Los respaldos anteriores se abren con la contraseña que tenían al crearse.');
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="Cambiar contraseña" footer={<Button block onClick={save} disabled={!ok} loading={busy}>Cambiar contraseña</Button>}>
      <div className="space-y-4">
        <PassphraseInput label="Contraseña actual" value={cur} onChange={setCur} />
        <PassphraseInput label="Nueva contraseña" value={next} onChange={setNext} autoComplete="new-password" showStrength />
        <PassphraseInput label="Repite la nueva contraseña" value={next2} onChange={setNext2} autoComplete="new-password" />
        {next2 && next !== next2 && <p className="text-sm font-medium text-red-700">Las contraseñas no coinciden</p>}
      </div>
    </Sheet>
  );
}

function PinSheet({ onClose }: { onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = /^\d{4,8}$/.test(pin) && pin === pin2;
  const save = async () => {
    setBusy(true);
    try {
      await enablePin(pin);
      toast.success('PIN activado');
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="Activar PIN" footer={<Button block onClick={save} disabled={!ok} loading={busy}>Activar</Button>}>
      <div className="space-y-4">
        <Field label="PIN (4 a 8 dígitos)">
          <TextInput type="password" inputMode="numeric" pattern="[0-9]*" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Repite el PIN">
          <TextInput type="password" inputMode="numeric" pattern="[0-9]*" maxLength={8} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <p className="text-sm text-ink-500">El PIN vale por 14 días o hasta 5 intentos fallidos; luego se pide la contraseña completa.</p>
      </div>
    </Sheet>
  );
}
