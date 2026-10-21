import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, ScanText } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/Button';
import { Notice, Spinner } from '@/components/Card';
import { toast } from '@/components/overlay';
import type { AiConfig } from './aiKey';
import { AiError, MAX_FILES, prepareFile, readReport } from './labReader';

/** Botón que abre el selector del iPhone (cámara, fotos o archivos) para elegir el informe. */
export function PickReportButton({ onPick, children, ...button }: Omit<ButtonProps, 'onClick'> & { onPick: (files: File[]) => void; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button {...button} onClick={() => input.current?.click()}>
        {children}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        aria-label="Foto o PDF del informe"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length > MAX_FILES) toast.info(`Se usarán los primeros ${MAX_FILES} archivos.`);
          if (files.length) onPick(files.slice(0, MAX_FILES));
        }}
      />
    </>
  );
}

type ReadState = { status: 'idle' } | { status: 'reading' } | { status: 'done'; lines: number } | { status: 'error'; message: string };

/**
 * Lectura del informe con IA dentro de "Dictar o pegar valores": muestra lo que se enviará, lo envía solo cuando la
 * profesional toca "Leer con IA" y deja la transcripción en el cuadro de texto para revisarla.
 */
export function AiReportPanel({ config, files, onFiles, onLines }: { config: AiConfig; files: File[]; onFiles: (files: File[]) => void; onLines: (lines: string[]) => void }) {
  const [state, setState] = useState<ReadState>({ status: 'idle' });
  const ctrl = useRef<AbortController | null>(null);
  // Si se cierra la hoja o la app se bloquea, la lectura en curso se cancela.
  useEffect(() => () => ctrl.current?.abort(), []);
  // Miniaturas para comparar con lo leído (las direcciones blob: se liberan al cambiar los archivos o cerrar).
  const [previews, setPreviews] = useState<Array<{ file: File; url: string | null }>>([]);
  useEffect(() => {
    const list = files.map((file) => ({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null }));
    setPreviews(list);
    return () => list.forEach((p) => p.url && URL.revokeObjectURL(p.url));
  }, [files]);

  const pick = (next: File[]) => {
    ctrl.current?.abort();
    setState({ status: 'idle' });
    onFiles(next);
  };

  const read = async () => {
    if (!navigator.onLine) {
      setState({ status: 'error', message: 'Sin conexión: la lectura con IA necesita internet.' });
      return;
    }
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ status: 'reading' });
    try {
      const prepared = await Promise.all(files.map(prepareFile));
      const lines = await readReport(prepared, config.key, c.signal);
      if (c.signal.aborted) return;
      onLines(lines);
      setState({ status: 'done', lines: lines.length });
    } catch (e) {
      if (c.signal.aborted) return;
      setState({ status: 'error', message: e instanceof AiError ? e.message : 'No se pudo completar la lectura con IA. Intenta de nuevo.' });
    }
  };

  if (!files.length) {
    return (
      <div className="space-y-1.5">
        <PickReportButton block variant="soft" icon={<ScanText className="size-5" />} onPick={pick}>
          Leer foto o PDF con IA
        </PickReportButton>
        <p className="text-xs text-ink-500">Toma una foto del informe o elige una foto o un PDF. Antes de enviarlo verás qué se enviará.</p>
      </div>
    );
  }

  const plural = files.length > 1;
  return (
    <section aria-label="Lectura con IA" className="card space-y-3 p-3">
      <ul className="flex flex-wrap gap-2" aria-label="Archivos elegidos">
        {previews.map((p, i) => (
          <li key={i} className="w-20">
            {p.url ? (
              <img src={p.url} alt={`Informe: ${p.file.name}`} className="h-20 w-20 rounded-lg object-cover ring-1 ring-sand-300" />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-lg bg-sand-100 text-ink-600 ring-1 ring-sand-300">
                <FileText className="size-8" aria-hidden />
              </span>
            )}
            <span className="mt-1 block truncate text-xs text-ink-600">{p.file.name}</span>
          </li>
        ))}
      </ul>

      {state.status === 'reading' ? (
        <div className="flex items-center justify-between gap-3">
          <p role="status" className="flex items-center gap-2 text-sm text-ink-700">
            <Spinner /> Leyendo el informe con IA… suele tardar menos de un minuto.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              ctrl.current?.abort();
              setState({ status: 'idle' });
            }}
          >
            Cancelar
          </Button>
        </div>
      ) : state.status === 'done' ? (
        <>
          <Notice tone="success" title={`La IA transcribió ${state.lines} línea${state.lines === 1 ? '' : 's'}`}>
            Quedaron en el cuadro de abajo. Compara cada valor con el informe antes de agregarlo: la IA puede equivocarse al leer.
          </Notice>
          {previews.some((p) => p.url) && (
            <details className="rounded-xl bg-sand-50 px-3 py-2">
              <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-brand-800">Ver el informe para comparar</summary>
              <div className="space-y-2 pb-1">
                {previews.map((p, i) => p.url && <img key={i} src={p.url} alt={`Informe: ${p.file.name}`} className="w-full rounded-lg" />)}
              </div>
            </details>
          )}
          <PickReportButton variant="ghost" size="sm" className="min-h-11" onPick={pick}>
            Leer otro informe
          </PickReportButton>
        </>
      ) : (
        <>
          {state.status === 'error' && <Notice tone="danger">{state.message}</Notice>}
          <p className="text-sm text-ink-700">
            {plural ? 'Se enviarán' : 'Se enviará'} a Anthropic (Claude) solo para leer los resultados. Si el informe muestra datos del tutor que no quieres enviar,
            recórtalos antes en la app Fotos.
          </p>
          <Button block icon={<ScanText className="size-5" />} onClick={() => void read()}>
            {state.status === 'error' ? 'Intentar de nuevo' : 'Leer con IA'}
          </Button>
          <PickReportButton variant="ghost" size="sm" className="min-h-11" onPick={pick}>
            Elegir otros archivos
          </PickReportButton>
        </>
      )}
    </section>
  );
}
