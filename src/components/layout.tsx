import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, House, Menu, PawPrint, Stethoscope, WifiOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useOnline } from '@/lib/useOnline';
import { useUiState } from '@/lib/uiState';

export function PageHeader({
  title,
  back,
  actions,
  large,
  subtitle,
}: {
  title: ReactNode;
  /** Ruta a la que volver si no hay historial; `true` usa el historial. */
  back?: string | true;
  actions?: ReactNode;
  large?: boolean;
  subtitle?: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(typeof back === 'string' ? back : '/', { replace: true, state: { from: location.pathname } });
  };
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-sand-200/80 bg-sand-100/90 backdrop-blur-md no-print">
      <div className="mx-auto flex min-h-13 max-w-3xl items-center gap-1 px-2">
        {back ? (
          <button
            type="button"
            onClick={goBack}
            className="flex min-h-11 items-center gap-0.5 rounded-full pl-1 pr-2 text-[15px] font-medium text-brand-700 active:bg-sand-200"
          >
            <ChevronLeft className="size-6" aria-hidden />
            <span>Atrás</span>
          </button>
        ) : (
          <div className="w-2" />
        )}
        <div className="min-w-0 flex-1 px-1">
          {!large && <h1 className="truncate text-[17px] font-semibold text-ink-900">{title}</h1>}
          {!large && subtitle && <p className="truncate text-xs text-ink-500">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
      {large && (
        <div className="mx-auto max-w-3xl px-4 pb-2">
          <h1 className="font-[family-name:var(--font-display)] text-[28px] font-bold leading-tight tracking-tight text-ink-900">{title}</h1>
          {subtitle && <p className="text-sm text-ink-500">{subtitle}</p>}
        </div>
      )}
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn('mx-auto w-full max-w-3xl space-y-5 px-4 pt-4 pb-32', className)}>{children}</main>;
}

/** Barra de acciones fija al final de formularios largos. */
export function StickyActions({ children }: { children: ReactNode }) {
  useEffect(() => {
    useUiState.setState((s) => ({ stickyActions: s.stickyActions + 1 }));
    return () => useUiState.setState((s) => ({ stickyActions: Math.max(0, s.stickyActions - 1) }));
  }, []);
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-sand-200 bg-sand-50/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md no-print">
      <div className="mx-auto flex max-w-3xl gap-2">{children}</div>
    </div>
  );
}

const TABS = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/pacientes', label: 'Pacientes', icon: PawPrint },
  { to: '/consulta', label: 'Consulta', icon: Stethoscope, primary: true, aria: 'Nueva consulta' },
  { to: '/mas', label: 'Más', icon: Menu },
] as const;

/** Oculta la barra inferior mientras el teclado está abierto (campo de texto enfocado). */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes((el as HTMLInputElement).type)) || el.isContentEditable);
    const onIn = (e: FocusEvent) => setOpen(isField(e.target));
    const onOut = () => setTimeout(() => setOpen(isField(document.activeElement)), 50);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);
  return open;
}

export function TabBar({ hidden }: { hidden?: boolean }) {
  const keyboard = useKeyboardOpen();
  const sticky = useUiState((s) => s.stickyActions > 0);
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (hidden || sticky || (keyboard && coarse)) return null;
  return (
    <nav
      aria-label="Navegación principal"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-white/95 backdrop-blur-md no-print"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-5">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={'end' in t ? t.end : false}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold',
                  isActive ? 'text-brand-700' : 'text-ink-500',
                )
              }
            >
              {({ isActive }) =>
                'primary' in t ? (
                  <>
                    <span className={cn('flex h-8 w-12 items-center justify-center rounded-xl', isActive ? 'bg-brand-800' : 'bg-brand-700', 'text-white shadow-sm')}>
                      <t.icon className="size-5" aria-hidden />
                    </span>
                    <span aria-hidden>{t.label}</span>
                    <span className="sr-only">{t.aria}</span>
                  </>
                ) : (
                  <>
                    <t.icon className={cn('size-6', isActive && 'stroke-[2.4]')} aria-hidden />
                    {t.label}
                  </>
                )
              }
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-center text-[13px] font-medium text-amber-900 no-print" role="status">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      Sin conexión. Puedes seguir trabajando: los datos se guardan en este dispositivo.
    </div>
  );
}
