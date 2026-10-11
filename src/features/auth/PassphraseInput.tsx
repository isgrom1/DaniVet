import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { passphraseStrength } from '@/lib/crypto';
import { cn } from '@/lib/cn';

export function PassphraseInput({
  value,
  onChange,
  label,
  autoComplete = 'current-password',
  showStrength,
  invalid,
  autoFocus,
  onEnter,
  id: idProp,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoComplete?: 'current-password' | 'new-password';
  showStrength?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  onEnter?: () => void;
  id?: string;
}) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const id = idProp ?? autoId;
  const s = passphraseStrength(value);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={value}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
          className="input-base pr-12"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute inset-y-0 right-1 flex w-11 items-center justify-center text-ink-500"
        >
          {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>
      {showStrength && value && (
        <div className="flex items-center gap-2" aria-live="polite">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  i < s.score ? (s.score <= 1 ? 'bg-red-500' : s.score === 2 ? 'bg-amber-500' : 'bg-emerald-600') : 'bg-sand-300',
                )}
              />
            ))}
          </div>
          <span className="text-xs font-semibold text-ink-600">{s.label}</span>
        </div>
      )}
    </div>
  );
}
