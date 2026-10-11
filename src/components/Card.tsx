import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={cn('card', padded && 'p-4', className)}>{children}</div>;
}

export function Section({
  title,
  action,
  children,
  className,
  description,
  id,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  id?: string;
}) {
  return (
    <section className={cn('space-y-2', className)} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || action) && (
        <div className="flex min-h-9 items-end justify-between gap-2 px-1">
          <div>
            {title && <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Lista agrupada estilo iOS. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card divide-y divide-sand-200 overflow-hidden', className)}>{children}</div>;
}

export function ListRow({
  to,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
  chevron = true,
  className,
  meta,
}: {
  to?: string;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  className?: string;
  meta?: ReactNode;
}) {
  const content = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-ink-900">{title}</div>
        {subtitle && <div className="truncate text-sm text-ink-500">{subtitle}</div>}
        {meta && <div className="mt-1 flex flex-wrap gap-1">{meta}</div>}
      </div>
      {trailing && <div className="shrink-0 text-right text-sm text-ink-500">{trailing}</div>}
      {(to || onClick) && chevron && <ChevronRight className="size-5 shrink-0 text-ink-400" aria-hidden />}
    </>
  );
  const cls = cn('flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left', (to || onClick) && 'active:bg-sand-100', className);
  if (to)
    return (
      <Link to={to} className={cls}>
        {content}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {content}
      </button>
    );
  return <div className={cls}>{content}</div>;
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-8 text-center">
      {icon && <div className="mb-3 rounded-full bg-brand-50 p-3 text-brand-700">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink-800">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
const tones: Record<Tone, string> = {
  neutral: 'bg-sand-200 text-ink-700',
  brand: 'bg-brand-50 text-brand-800 ring-1 ring-brand-100',
  success: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-1 ring-red-200',
  info: 'bg-sky-50 text-sky-800 ring-1 ring-sky-100',
  accent: 'bg-accent-50 text-accent-700 ring-1 ring-accent-100',
};

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function KeyValue({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className={cn('flex gap-3 py-1.5 text-[15px]', className)}>
      <dt className="w-36 shrink-0 text-ink-500">{label}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink-900">{value}</dd>
    </div>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
  icon,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success' | 'neutral';
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: 'bg-sky-50 border-sky-200 text-sky-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    danger: 'bg-red-50 border-red-200 text-red-900',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    neutral: 'bg-sand-50 border-sand-300 text-ink-800',
  }[tone];
  return (
    <div className={cn('flex gap-3 rounded-xl border p-3 text-sm', styles, className)} role={tone === 'danger' ? 'alert' : undefined}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(!!title && 'mt-0.5', 'leading-relaxed')}>{children}</div>}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block size-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700', className)} aria-hidden />;
}
