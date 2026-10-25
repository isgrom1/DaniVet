import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Calculator, CircleAlert, ClipboardCheck, Copy, FileText, MessageCircle, Mic, Search, Sparkles, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Provenance } from '@/data/schema';

/** Id del campo actual: asocia la etiqueta con el control (VoiceOver, pruebas). */
const FieldIdContext = createContext<string | undefined>(undefined);
const useFieldId = (id?: string) => {
  const ctx = useContext(FieldIdContext);
  return id ?? ctx;
};

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
  className,
  tag,
  labelAction,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
  tag?: ReactNode;
  labelAction?: ReactNode;
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  return (
    <FieldIdContext.Provider value={id}>
    <div className={cn('space-y-1.5', className)}>
      {(label || tag || labelAction) && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={id} className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink-700">
            {label}
            {required && (
              <span className="text-red-700" aria-label="obligatorio">
                *
              </span>
            )}
            {tag}
          </label>
          {labelAction}
        </div>
      )}
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-sm font-medium text-red-700" role="alert">
          <CircleAlert className="size-4" aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink-500">{hint}</p>
      ) : null}
    </div>
    </FieldIdContext.Provider>
  );
}

/** Grupo de varios controles con un título (no asocia un id único). */
export function FieldGroup({ label, children, className, hint }: { label: ReactNode; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)} role="group" aria-label={typeof label === 'string' ? label : undefined}>
      <p className="text-sm font-semibold text-ink-700">{label}</p>
      {children}
      {hint && <p className="text-sm text-ink-500">{hint}</p>}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; suffix?: ReactNode };

export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput({ className, invalid, suffix, id: idProp, ...rest }, ref) {
  const id = useFieldId(idProp);
  if (suffix) {
    return (
      <div className="relative">
        <input ref={ref} id={id} aria-invalid={invalid || undefined} className={cn('input-base pr-16', className)} {...rest} />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-ink-500">{suffix}</span>
      </div>
    );
  }
  return <input ref={ref} id={id} aria-invalid={invalid || undefined} className={cn('input-base', className)} {...rest} />;
});

/** Área de texto que crece con su contenido. */
export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean; minRows?: number }>(function TextArea(
  { className, invalid, minRows = 3, id: idProp, ...rest },
  outer,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(outer, () => ref.current!, []);
  const id = useFieldId(idProp);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight + 2, minRows * 24 + 22)}px`;
  }, [rest.value, minRows]);
  return (
    <textarea
      ref={ref}
      id={id}
      rows={minRows}
      aria-invalid={invalid || undefined}
      className={cn('input-base resize-none leading-6', className)}
      {...rest}
    />
  );
});

export function Select({ className, invalid, children, id: idProp, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  const id = useFieldId(idProp);
  return (
    <select
      id={id}
      aria-invalid={invalid || undefined}
      className={cn('input-base select-chevron', className)}
      {...rest}
    >
      {children}
    </select>
  );
}

/** Campo decimal compatible con el teclado del iPhone (acepta coma o punto). Se guarda como texto hasta validar. */
export function DecimalInput({ value, onChange, unit, invalid, ...rest }: Omit<InputProps, 'value' | 'onChange'> & { value: string; onChange: (v: string) => void; unit?: string }) {
  return (
    <TextInput
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="next"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ''))}
      suffix={unit}
      invalid={invalid}
      {...rest}
    />
  );
}

export function IntegerInput({ value, onChange, unit, ...rest }: Omit<InputProps, 'value' | 'onChange'> & { value: string; onChange: (v: string) => void; unit?: string }) {
  return (
    <TextInput
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      enterKeyHint="next"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      suffix={unit}
      {...rest}
    />
  );
}

/** Monto en pesos: muestra separador de miles mientras se escribe. */
export function MoneyInput({ value, onChange, id: idProp, ...rest }: Omit<InputProps, 'value' | 'onChange'> & { value: string; onChange: (v: string) => void }) {
  const id = useFieldId(idProp);
  const display = value ? Number(value.replace(/\D/g, '') || 0).toLocaleString('es-CL') : '';
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-500">$</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        className="input-base pl-7 tabular"
        value={display}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        {...rest}
      />
    </div>
  );
}

export function DateInput({ value, onChange, invalid, clearable = true, id: idProp, ...rest }: Omit<InputProps, 'value' | 'onChange' | 'type'> & { value: string; onChange: (v: string) => void; clearable?: boolean }) {
  const id = useFieldId(idProp);
  return (
    <div className="relative">
      <input
        id={id}
        type="date"
        aria-invalid={invalid || undefined}
        className={cn('input-base', clearable && value && 'pr-12')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      {clearable && value && !rest.disabled && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Borrar fecha"
          className="absolute inset-y-0 right-1 flex w-10 items-center justify-center text-ink-400"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function TimeInput({ value, onChange, id: idProp, ...rest }: Omit<InputProps, 'value' | 'onChange' | 'type'> & { value: string; onChange: (v: string) => void }) {
  const id = useFieldId(idProp);
  return <input id={id} type="time" className="input-base" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex min-h-12 cursor-pointer items-center justify-between gap-3', disabled && 'opacity-50')}>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-ink-900">{label}</span>
        {description && <span className="block text-sm text-ink-500">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-7 w-12 rounded-full bg-sand-300 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-200" />
        <span className="absolute left-0.5 size-6 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Checkbox({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('flex min-h-11 cursor-pointer items-start gap-3 py-1', disabled && 'opacity-50')}>
      <input
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 rounded accent-brand-700"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-[15px] text-ink-900">{label}</span>
        {description && <span className="block text-sm text-ink-500">{description}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  name,
  size = 'md',
  className,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; tone?: 'danger' | 'success' | 'neutral' }>;
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        const activeTone =
          o.tone === 'danger'
            ? 'border-red-600 bg-red-50 text-red-800'
            : o.tone === 'success'
              ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
              : 'border-brand-600 bg-brand-50 text-brand-800';
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-xl border font-semibold transition-colors',
              size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-3.5 text-[15px]',
              active ? activeTone : 'border-sand-300 bg-white text-ink-700 active:bg-sand-100',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Buscar', autoFocus, className }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
      <input
        ref={ref}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="input-base rounded-full pl-10 pr-10"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Limpiar búsqueda" className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center text-ink-400">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

const PROVENANCE: Record<Provenance | 'pending', { label: string; cls: string; icon: ReactNode }> = {
  professional: { label: 'Registrado', cls: 'bg-brand-50 text-brand-800', icon: <ClipboardCheck className="size-3" /> },
  owner: { label: 'Informado por tutor', cls: 'bg-sky-50 text-sky-800', icon: <MessageCircle className="size-3" /> },
  document: { label: 'De documento', cls: 'bg-violet-50 text-violet-800', icon: <FileText className="size-3" /> },
  calculated: { label: 'Calculado por la app', cls: 'bg-amber-50 text-amber-900', icon: <Calculator className="size-3" /> },
  copied: { label: 'Copiado: revisar', cls: 'bg-orange-50 text-orange-900', icon: <Copy className="size-3" /> },
  template: { label: 'De plantilla: revisar', cls: 'bg-orange-50 text-orange-900', icon: <Sparkles className="size-3" /> },
  dictated: { label: 'Dictado: revisar', cls: 'bg-orange-50 text-orange-900', icon: <Mic className="size-3" /> },
  pending: { label: 'Por confirmar', cls: 'bg-red-50 text-red-800', icon: <UserRound className="size-3" /> },
};

/** Etiqueta que indica el origen de un dato. */
export function ProvenanceTag({ kind, label }: { kind: Provenance | 'pending'; label?: string }) {
  const p = PROVENANCE[kind];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', p.cls)}>
      {p.icon}
      {label ?? p.label}
    </span>
  );
}
