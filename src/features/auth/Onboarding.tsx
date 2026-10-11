import { useState } from 'react';
import { CircleCheck, DatabaseBackup, HardDrive, Lock, ShieldCheck, WifiOff } from 'lucide-react';
import { Button } from '@/components/Button';
import { Checkbox, Field, TextInput } from '@/components/form';
import { Notice } from '@/components/Card';
import { toast } from '@/components/overlay';
import { createAccount, enablePin } from '@/data/session';
import { friendlyError } from '@/data/errors';
import { passphraseStrength } from '@/lib/crypto';
import { isIOS, isStandalone } from '@/lib/platform';
import { isValidEmail } from '@/lib/text';
import { useUiState } from '@/lib/uiState';
import { AuthLayout } from './AuthLayout';
import { InstallGuide } from './InstallGuide';
import { PassphraseInput } from './PassphraseInput';
import { RecoveryKeyView } from './RecoveryKeyView';
import { RestoreFromBackup } from './RestoreFromBackup';
import { DEFAULT_APP_NAME } from '@/lib/platform';

type Step = 'welcome' | 'create' | 'recovery' | 'pin' | 'done' | 'restore';

export function Onboarding() {
  const [step, setStep] = useState<Step>('welcome');
  const [recoveryKey, setRecoveryKey] = useState('');
  const showInstall = isIOS() && !isStandalone();

  if (step === 'restore') return <RestoreFromBackup onCancel={() => setStep('welcome')} />;

  if (step === 'create')
    return (
      <CreateAccount
        onBack={() => setStep('welcome')}
        onCreated={(key) => {
          setRecoveryKey(key);
          setStep('recovery');
        }}
      />
    );

  if (step === 'recovery')
    return (
      <AuthLayout title="Tu clave de recuperación" subtitle="Guárdala ahora. La necesitarás si olvidas tu contraseña o para abrir un respaldo en otro teléfono.">
        <RecoveryKeyView recoveryKey={recoveryKey} onDone={() => setStep('pin')} />
      </AuthLayout>
    );

  if (step === 'pin') return <PinSetup onDone={() => setStep('done')} />;

  if (step === 'done')
    return (
      <AuthLayout title="¡Todo listo!" subtitle="Tu cuenta quedó creada y cifrada en este dispositivo.">
        <div className="card space-y-3 p-4 text-[15px] text-ink-700">
          <p className="font-semibold text-ink-900">Primeros pasos recomendados</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Completa tu perfil profesional (aparece en recetas y documentos).</li>
            <li>Define tus servicios y precios.</li>
            <li>Registra a tu primer tutor y sus pacientes.</li>
            <li>Crea un respaldo y guárdalo en iCloud Drive u otro lugar seguro.</li>
          </ol>
        </div>
        <Button block size="lg" onClick={() => useUiState.setState({ onboarding: false })}>
          Comenzar a usar {DEFAULT_APP_NAME}
        </Button>
      </AuthLayout>
    );

  return (
    <AuthLayout
      title="Bienvenida"
      subtitle="Herramienta privada para gestionar tus visitas, fichas clínicas, recetas y cobros desde el teléfono."
    >
      {showInstall && <InstallGuide />}
      <div className="card divide-y divide-sand-200">
        <Feature icon={<Lock className="size-5" />} title="Datos cifrados en tu dispositivo">
          Fichas, tutores y archivos se guardan cifrados (AES-256) con una clave que solo tú conoces.
        </Feature>
        <Feature icon={<WifiOff className="size-5" />} title="Funciona sin conexión">
          Puedes registrar consultas en lugares sin cobertura. No depende de servidores externos.
        </Feature>
        <Feature icon={<HardDrive className="size-5" />} title="Tú controlas los respaldos">
          Los datos no se envían a ninguna nube. Crea respaldos cifrados periódicos para no perder información si pierdes el teléfono.
        </Feature>
      </div>
      <div className="space-y-2">
        <Button block size="lg" onClick={() => setStep('create')} icon={<ShieldCheck className="size-5" />}>
          Crear mi cuenta
        </Button>
        <Button block variant="secondary" onClick={() => setStep('restore')} icon={<DatabaseBackup className="size-5" />}>
          Restaurar desde un respaldo
        </Button>
      </div>
    </AuthLayout>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4">
      <div className="mt-0.5 text-brand-700">{icon}</div>
      <div>
        <p className="text-[15px] font-semibold text-ink-900">{title}</p>
        <p className="text-sm leading-relaxed text-ink-600">{children}</p>
      </div>
    </div>
  );
}

function CreateAccount({ onBack, onCreated }: { onBack: () => void; onCreated: (recoveryKey: string) => void }) {
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('Médica Veterinaria');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const strength = passphraseStrength(pass);
  const errors = {
    fullName: fullName.trim().length < 3 ? 'Ingresa tu nombre completo' : null,
    email: email && !isValidEmail(email) ? 'Correo no válido' : null,
    pass: !strength.ok ? 'Usa al menos 10 caracteres combinando letras, números o símbolos (o una frase de varias palabras).' : null,
    pass2: pass2 !== pass ? 'Las contraseñas no coinciden' : null,
    accept: !accept ? 'Debes aceptar para continuar' : null,
  };
  const valid = Object.values(errors).every((e) => !e);

  const submit = async () => {
    setTried(true);
    if (!valid) return;
    setBusy(true);
    useUiState.setState({ onboarding: true });
    try {
      const key = await createAccount(pass, { fullName, title, email, phone });
      onCreated(key);
    } catch (e) {
      useUiState.setState({ onboarding: false });
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Crear cuenta" subtitle="La cuenta se crea solo en este dispositivo. Nadie más puede abrir tus datos sin tu contraseña.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <Field label="Nombre completo" required error={tried ? errors.fullName : null} htmlFor="fullName">
          <TextInput id="fullName" autoComplete="name" autoCapitalize="words" value={fullName} onChange={(e) => setFullName(e.target.value)} invalid={tried && !!errors.fullName} />
        </Field>
        <Field label="Título profesional" htmlFor="title" hint="Aparecerá en recetas y documentos.">
          <TextInput id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Correo (opcional)" error={tried ? errors.email : null} htmlFor="email">
            <TextInput id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Teléfono (opcional)" htmlFor="phone">
            <TextInput id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <PassphraseInput label="Contraseña" autoComplete="new-password" value={pass} onChange={setPass} showStrength invalid={tried && !!errors.pass} id="pass" />
        {tried && errors.pass && <p className="-mt-2 text-sm font-medium text-red-700">{errors.pass}</p>}
        <PassphraseInput label="Repite la contraseña" autoComplete="new-password" value={pass2} onChange={setPass2} invalid={tried && !!errors.pass2} id="pass2" />
        {tried && errors.pass2 && <p className="-mt-2 text-sm font-medium text-red-700">{errors.pass2}</p>}
        <Notice tone="neutral">
          Consejo: una frase de 4 o más palabras es fácil de recordar y difícil de adivinar (por ejemplo, “gato verde salta tres veces”). No uses la misma
          contraseña de otros servicios.
        </Notice>
        <Checkbox
          checked={accept}
          onChange={setAccept}
          label="Entiendo que mis datos se guardan cifrados solo en este dispositivo y que, sin mi contraseña ni mi clave de recuperación, no podrán recuperarse."
        />
        {tried && errors.accept && <p className="-mt-2 text-sm font-medium text-red-700">{errors.accept}</p>}
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" onClick={onBack} disabled={busy}>
            Atrás
          </Button>
          <Button type="submit" block size="lg" loading={busy}>
            {busy ? 'Creando cuenta cifrada…' : 'Crear cuenta'}
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}

function PinSetup({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = /^\d{4,8}$/.test(pin) && pin === pin2;
  const save = async () => {
    setBusy(true);
    try {
      await enablePin(pin);
      toast.success('PIN activado');
      onDone();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout title="Desbloqueo rápido con PIN" subtitle="Opcional, recomendado para el uso diario durante las visitas.">
      <Notice tone="info" icon={<CircleCheck className="size-5" />}>
        Con el PIN desbloqueas la app en segundos. Por seguridad, se pedirá la contraseña completa cada 14 días o después de 5 intentos fallidos. La
        protección de tu iPhone (código o Face ID) sigue siendo fundamental.
      </Notice>
      <Field label="PIN (4 a 8 dígitos)" htmlFor="pin">
        <TextInput id="pin" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <Field label="Repite el PIN" htmlFor="pin2" error={pin2 && pin !== pin2 ? 'Los PIN no coinciden' : null}>
        <TextInput id="pin2" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={8} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <div className="space-y-2">
        <Button block size="lg" disabled={!valid} loading={busy} onClick={save}>
          Activar PIN
        </Button>
        <Button block variant="ghost" onClick={onDone}>
          Ahora no
        </Button>
      </div>
    </AuthLayout>
  );
}
