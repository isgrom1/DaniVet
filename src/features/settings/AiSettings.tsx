import { useState, type ReactNode } from 'react';
import { ExternalLink, KeyRound, ScanText, ShieldCheck } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice, Section, Spinner } from '@/components/Card';
import { Checkbox, Field, TextInput } from '@/components/form';
import { confirmDialog, toast } from '@/components/overlay';
import { friendlyError } from '@/data/errors';
import { formatDate } from '@/lib/dates';
import { clearAiConfig, keyHint, looksLikeApiKey, saveAiConfig, useAiConfig } from '@/features/ai/aiKey';
import { AiError, testApiKey } from '@/features/ai/labReader';

const CONSOLE_KEYS = 'https://platform.claude.com/settings/keys';
const CONSOLE_BILLING = 'https://platform.claude.com/settings/billing';

function Info({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section title={title}>
      <Card className="space-y-2 text-[15px] leading-relaxed text-ink-700">{children}</Card>
    </Section>
  );
}

function Out({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-800 underline">
      {children}
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

/** Activación opcional de la lectura de informes con IA, con la clave de la API de Claude de la profesional. */
export function AiSettings() {
  const config = useAiConfig();
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const save = async () => {
    const k = key.trim();
    if (!looksLikeApiKey(k)) {
      setError('La clave empieza con sk-ant-: cópiala completa desde la Consola de Claude.');
      return;
    }
    if (!navigator.onLine) {
      setError('Necesitas conexión a internet para probar la clave.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await testApiKey(k);
      await saveAiConfig({ key: k, consentAt: new Date().toISOString() });
      setKey('');
      setConsent(false);
      setEditing(false);
      toast.success('Lectura con IA activada');
    } catch (e) {
      setError(e instanceof AiError ? e.message : friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!config) return;
    setTesting(true);
    try {
      await testApiKey(config.key);
      toast.success('La clave funciona');
    } catch (e) {
      toast.error(e instanceof AiError ? e.message : friendlyError(e));
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: '¿Desactivar la lectura con IA?',
      message: 'Se borrará la clave de este teléfono. La clave sigue existiendo en tu cuenta de Anthropic: si ya no la usarás, elimínala también en la Consola de Claude.',
      confirmLabel: 'Desactivar',
      tone: 'danger',
    });
    if (!ok) return;
    await clearAiConfig();
    setEditing(false);
    toast.success('Lectura con IA desactivada');
  };

  const showForm = config === null || editing;
  return (
    <>
      <PageHeader title="Lectura de informes con IA" back="/mas" />
      <Page>
        {config === undefined ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : config ? (
          <Notice tone="success" icon={<ShieldCheck className="size-5" />} title="Activada">
            Clave terminada en {keyHint(config.key)}, ingresada el {formatDate(config.consentAt)}. En un examen, toca «Leer foto o PDF con IA» en «Valores del examen».
          </Notice>
        ) : (
          <Notice tone="neutral" title="Desactivada">
            Es opcional. Para activarla necesitas una clave de la API de Claude: sigue los pasos de más abajo.
          </Notice>
        )}
        {config && !editing && (
          <div className="grid gap-2">
            <Button variant="secondary" loading={testing} onClick={() => void test()}>
              Probar la clave
            </Button>
            <Button variant="secondary" icon={<KeyRound className="size-4" />} onClick={() => setEditing(true)}>
              Cambiar la clave
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Desactivar y borrar la clave
            </Button>
          </div>
        )}

        <Info title="Qué hace">
          <p>
            En un examen, toca <strong>Leer foto o PDF con IA</strong> y elige la foto o el PDF del informe del laboratorio. Claude, la IA de Anthropic, transcribe cada
            resultado (nombre, valor, unidad y rango de referencia) y la app lo ubica en el examen para que lo revises antes de agregarlo.
          </p>
          <p>La IA solo transcribe: no interpreta resultados ni sugiere diagnósticos o tratamientos. Puede equivocarse al leer, así que compara siempre con el informe.</p>
        </Info>

        <Info title="Qué se envía y a quién">
          <p>
            Nada se envía hasta que tocas <strong>Leer con IA</strong>. En ese momento, la foto o el PDF que elegiste viaja directamente desde este teléfono a Anthropic
            (empresa de Estados Unidos que desarrolla Claude), con tu propia cuenta. No pasa por otros servidores.
          </p>
          <p>
            La app no envía nombres ni otros datos de la ficha, pero el informe puede mostrar el nombre del paciente, del tutor u otros datos personales. Si no quieres
            enviarlos, recórtalos antes en la app Fotos (Editar › Recortar).
          </p>
          <p>
            Anthropic indica que lo que recibe por su API no se usa para entrenar sus modelos y que lo elimina automáticamente en un plazo de hasta 30 días, salvo
            excepciones como obligaciones legales o infracciones a sus políticas de uso (revisado en octubre de 2026; sus condiciones pueden cambiar).
          </p>
          <p>
            Tu clave se guarda cifrada en este teléfono, aparte de tus datos: no se incluye en respaldos ni exportaciones, y se borra con «Eliminar todos los datos» o al
            restaurar un respaldo.
          </p>
        </Info>

        <Info title="Costo">
          <p>
            Anthropic cobra cada lectura a tu cuenta de la API, no a la app: aproximadamente entre US$0,03 y US$0,10 por informe, según sus páginas. Conviene fijar un
            límite de gasto en la Consola de Claude.
          </p>
        </Info>

        {showForm && (
          <Section title={config ? 'Cambiar la clave' : 'Cómo activarla'}>
            <Card className="space-y-4">
              <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-700">
                <li>Entra a la Consola de Claude (platform.claude.com) e inicia sesión con tu correo.</li>
                <li>
                  En <Out href={CONSOLE_BILLING}>Billing</Out> agrega saldo y fija un límite de gasto.
                </li>
                <li>
                  En <Out href={CONSOLE_KEYS}>API keys</Out> toca «Create Key», ponle un nombre (por ejemplo, DApp) y copia la clave: empieza con sk-ant- y se muestra una
                  sola vez.
                </li>
                <li>Vuelve aquí, pégala, acepta el aviso y toca «Guardar y probar».</li>
              </ol>
              <Field label="Clave de API de Claude" hint="Se guarda cifrada en este teléfono." error={error}>
                <TextInput
                  type="password"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="sk-ant-…"
                  value={key}
                  invalid={!!error}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setError(null);
                  }}
                />
              </Field>
              <Checkbox
                checked={consent}
                onChange={setConsent}
                label="Entiendo que las fotos o PDF que elija se enviarán a Anthropic para leerlos y que la IA puede equivocarse."
              />
              <Button block size="lg" icon={<ScanText className="size-5" />} loading={busy} disabled={!key.trim() || !consent} onClick={() => void save()}>
                Guardar y probar
              </Button>
              {editing && (
                <Button
                  block
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setKey('');
                    setError(null);
                  }}
                >
                  Cancelar
                </Button>
              )}
            </Card>
          </Section>
        )}
      </Page>
    </>
  );
}
