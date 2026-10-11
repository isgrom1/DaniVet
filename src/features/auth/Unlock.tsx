import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/form';
import { Notice } from '@/components/Card';
import { confirmDialog, toast } from '@/components/overlay';
import { friendlyError } from '@/data/errors';
import { hasPinSession, recoverWithKey, unlockWithPassphrase, unlockWithPin, wipeDevice } from '@/data/session';
import { isPlausibleRecoveryKey, passphraseStrength } from '@/lib/crypto';
import { AuthLayout } from './AuthLayout';
import { PassphraseInput } from './PassphraseInput';
import { RestoreFromBackup } from './RestoreFromBackup';

type Mode = 'loading' | 'pin' | 'pass' | 'recover' | 'restore';

export function Unlock() {
  const [mode, setMode] = useState<Mode>('loading');
  const [pin, setPin] = useState('');
  const [pass, setPass] = useState('');
  const [rk, setRk] = useState('');
  const [np, setNp] = useState('');
  const [np2, setNp2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hasPinSession().then((has) => setMode(has ? 'pin' : 'pass'));
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const err = e as Error;
      if (err.name === 'PinLockedOutError') {
        setMode('pass');
        setPin('');
      }
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const wipe = async () => {
    const ok = await confirmDialog({
      title: 'Eliminar todos los datos de este dispositivo',
      message: (
        <>
          <p>Se borrarán de forma permanente la cuenta, las fichas, los adjuntos y la configuración guardados en este dispositivo.</p>
          <p className="font-semibold">Solo podrás recuperarlos si tienes un respaldo y su contraseña o clave de recuperación.</p>
        </>
      ),
      confirmLabel: 'Eliminar todo',
      tone: 'danger',
      requireText: 'BORRAR',
    });
    if (!ok) return;
    await wipeDevice();
    toast.info('Se eliminaron los datos de este dispositivo.');
  };

  if (mode === 'restore') return <RestoreFromBackup onCancel={() => setMode('pass')} />;

  return (
    <AuthLayout title="Desbloquear" subtitle="Tus datos están cifrados en este dispositivo.">
      {mode === 'pin' && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => unlockWithPin(pin));
          }}
        >
          <Field label="PIN" htmlFor="pin">
            <TextInput
              id="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              autoFocus
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="text-center text-2xl tracking-[0.5em]"
            />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" block size="lg" loading={busy} disabled={pin.length < 4} icon={<Lock className="size-5" />}>
            Desbloquear
          </Button>
          <Button variant="ghost" block onClick={() => { setMode('pass'); setError(null); }}>
            Usar contraseña
          </Button>
        </form>
      )}

      {mode === 'pass' && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => unlockWithPassphrase(pass));
          }}
        >
          <PassphraseInput label="Contraseña" value={pass} onChange={setPass} autoFocus />
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" block size="lg" loading={busy} disabled={!pass} icon={<Lock className="size-5" />}>
            {busy ? 'Descifrando…' : 'Desbloquear'}
          </Button>
          <Button variant="ghost" block onClick={() => { setMode('recover'); setError(null); }}>
            Olvidé mi contraseña
          </Button>
        </form>
      )}

      {mode === 'recover' && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await recoverWithKey(rk, np);
              toast.success('Acceso recuperado. Tu nueva contraseña ya está activa.');
            });
          }}
        >
          <Notice tone="info">Ingresa la clave de recuperación que guardaste al crear la cuenta y define una contraseña nueva.</Notice>
          <Field label="Clave de recuperación" htmlFor="rk">
            <TextInput id="rk" value={rk} onChange={(e) => setRk(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} className="font-mono" />
          </Field>
          <PassphraseInput label="Nueva contraseña" autoComplete="new-password" value={np} onChange={setNp} showStrength />
          <PassphraseInput label="Repite la nueva contraseña" autoComplete="new-password" value={np2} onChange={setNp2} />
          {np2 && np !== np2 && <p className="text-sm font-medium text-red-700">Las contraseñas no coinciden</p>}
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" block size="lg" loading={busy} disabled={!isPlausibleRecoveryKey(rk) || !passphraseStrength(np).ok || np !== np2}>
            Recuperar acceso
          </Button>
          <Button variant="ghost" block onClick={() => { setMode('pass'); setError(null); }}>
            Volver
          </Button>
        </form>
      )}

      {mode !== 'loading' && (
        <div className="border-t border-sand-300 pt-5 text-center">
          <div className="flex flex-col items-center gap-1">
            <button type="button" className="min-h-11 text-sm font-semibold text-brand-700" onClick={() => setMode('restore')}>
              Restaurar un respaldo en este dispositivo
            </button>
            <button type="button" className="min-h-11 text-sm font-semibold text-red-700" onClick={wipe}>
              Eliminar todos los datos de este dispositivo
            </button>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
