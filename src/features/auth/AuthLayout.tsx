import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { DEFAULT_APP_NAME } from '@/lib/platform';

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: ReactNode }) {
  return (
    <div className="pt-safe pb-safe min-h-dvh bg-sand-100">
      <div className="mx-auto flex w-full max-w-md flex-col px-5 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={48} />
          <div>
            <p className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-ink-900">{DEFAULT_APP_NAME}</p>
            <p className="text-sm text-ink-500">Atención veterinaria a domicilio</p>
          </div>
        </div>
        {title && <h1 className="font-[family-name:var(--font-display)] text-[26px] font-bold leading-tight text-ink-900">{title}</h1>}
        {subtitle && <div className="mt-2 text-[15px] leading-relaxed text-ink-600">{subtitle}</div>}
        <div className="mt-6 space-y-5">{children}</div>
      </div>
    </div>
  );
}
