import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Field, TextArea, TextInput } from './form';

// ---------------------------------------------------------------------------
// Hoja inferior (bottom sheet)
// ---------------------------------------------------------------------------
let openSheets = 0;

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'auto',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'auto' | 'full';
}) {
  const panel = useRef<HTMLDivElement>(null);
  // La función de cierre suele crearse en cada render: se guarda aparte para que la hoja no se "reabra" (y no mueva el
  // foco al primer campo) cada vez que la pantalla de fondo se actualiza, por ejemplo al guardarse sola la consulta.
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    openSheets++;
    document.body.style.overflow = 'hidden';
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
      (first ?? panel.current)?.focus({ preventScroll: true });
    }, 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      openSheets--;
      if (openSheets <= 0) document.body.style.overflow = '';
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex w-full max-w-lg flex-col rounded-t-3xl bg-sand-50 shadow-xl outline-none sm:rounded-3xl',
          size === 'full' ? 'h-[92dvh]' : 'max-h-[90dvh]',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-sand-200 px-4 py-3">
          <h2 className="text-[17px] font-semibold text-ink-900">{title}</h2>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-10 items-center justify-center rounded-full bg-sand-200 text-ink-700 active:bg-sand-300"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer && <div className="border-t border-sand-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
        {!footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Diálogos con promesa: confirmar y solicitar motivo
// ---------------------------------------------------------------------------
interface ConfirmReq {
  kind: 'confirm';
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  /** Texto que la usuaria debe escribir para confirmar acciones irreversibles. */
  requireText?: string;
  resolve: (v: boolean) => void;
}
interface PromptReq {
  kind: 'prompt';
  title: string;
  message?: ReactNode;
  label: string;
  placeholder?: string;
  confirmLabel?: string;
  multiline?: boolean;
  required?: boolean;
  initial?: string;
  inputType?: 'text' | 'password';
  resolve: (v: string | null) => void;
}
type DialogReq = ConfirmReq | PromptReq;

const useDialogs = create<{ queue: DialogReq[] }>(() => ({ queue: [] }));

export function confirmDialog(opts: Omit<ConfirmReq, 'kind' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useDialogs.setState((s) => ({ queue: [...s.queue, { ...opts, kind: 'confirm', resolve }] })));
}

export function promptDialog(opts: Omit<PromptReq, 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => useDialogs.setState((s) => ({ queue: [...s.queue, { ...opts, kind: 'prompt', resolve }] })));
}

function finish(req: DialogReq, value: boolean | string | null) {
  useDialogs.setState((s) => ({ queue: s.queue.filter((q) => q !== req) }));
  (req.resolve as (v: unknown) => void)(value);
}

export function DialogHost() {
  const req = useDialogs((s) => s.queue[0]);
  const [text, setText] = useState('');
  useEffect(() => {
    setText(req?.kind === 'prompt' ? (req.initial ?? '') : '');
  }, [req]);
  if (!req) return null;
  const cancel = () => finish(req, req.kind === 'confirm' ? false : null);
  if (req.kind === 'confirm') {
    const blocked = !!req.requireText && text.trim().toUpperCase() !== req.requireText.toUpperCase();
    return (
      <Sheet
        open
        onClose={cancel}
        title={req.title}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={cancel}>
              {req.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button variant={req.tone === 'danger' ? 'danger' : 'primary'} block disabled={blocked} onClick={() => finish(req, true)}>
              {req.confirmLabel ?? 'Confirmar'}
            </Button>
          </div>
        }
      >
        {req.message && <div className="space-y-2 text-[15px] leading-relaxed text-ink-700">{req.message}</div>}
        {req.requireText && (
          <Field className="mt-4" label={`Escribe ${req.requireText} para confirmar`}>
            <TextInput value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" autoComplete="off" />
          </Field>
        )}
      </Sheet>
    );
  }
  const invalid = req.required !== false && !text.trim();
  return (
    <Sheet
      open
      onClose={cancel}
      title={req.title}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" block onClick={cancel}>
            Cancelar
          </Button>
          <Button block disabled={invalid} onClick={() => finish(req, text.trim())}>
            {req.confirmLabel ?? 'Aceptar'}
          </Button>
        </div>
      }
    >
      {req.message && <div className="mb-3 text-[15px] leading-relaxed text-ink-700">{req.message}</div>}
      <Field label={req.label} required={req.required !== false}>
        {req.multiline ? (
          <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder={req.placeholder} />
        ) : (
          <TextInput
            type={req.inputType ?? 'text'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={req.placeholder}
            autoComplete={req.inputType === 'password' ? 'current-password' : 'off'}
          />
        )}
      </Field>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Avisos breves (toasts)
// ---------------------------------------------------------------------------
interface ToastItem {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}
const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }));
let toastId = 0;

function push(message: string, tone: ToastItem['tone']) {
  const id = ++toastId;
  useToasts.setState((s) => ({ items: [...s.items.slice(-2), { id, message, tone }] }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), tone === 'error' ? 7000 : 3500);
}

export const toast = {
  success: (m: string) => push(m, 'success'),
  error: (m: string) => push(m, 'error'),
  info: (m: string) => push(m, 'info'),
};

export function Toaster() {
  const items = useToasts((s) => s.items);
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-2xl px-4 py-3 text-[15px] font-medium shadow-lg',
            t.tone === 'success' && 'bg-ink-900 text-white',
            t.tone === 'error' && 'bg-red-700 text-white',
            t.tone === 'info' && 'bg-white text-ink-900 ring-1 ring-sand-300',
          )}
          onClick={() => useToasts.setState((s) => ({ items: s.items.filter((x) => x.id !== t.id) }))}
        >
          {t.tone === 'success' && <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-300" />}
          {t.tone === 'error' && <CircleAlert className="mt-0.5 size-5 shrink-0" />}
          {t.tone === 'info' && <Info className="mt-0.5 size-5 shrink-0 text-brand-700" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
