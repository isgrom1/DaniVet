import { Link } from 'react-router-dom';
import { Info, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { ClinicalAlert } from './selectors';
import { cn } from '@/lib/cn';

/** Alertas clínicas visibles al abrir la ficha. Solo muestra lo registrado; marca lo pendiente de confirmar. */
export function AlertsPanel({ alerts, editTo, compact }: { alerts: ClinicalAlert[]; editTo?: string; compact?: boolean }) {
  if (!alerts.length) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-sand-300 bg-white px-3 py-2.5 text-sm text-ink-600">
        <span>Sin alergias, reacciones ni alertas registradas.</span>
        {editTo && (
          <Link to={editTo} className="shrink-0 font-semibold text-brand-700">
            Registrar
          </Link>
        )}
      </div>
    );
  }
  const critical = alerts.filter((a) => a.level === 'critical');
  const others = alerts.filter((a) => a.level !== 'critical');
  return (
    <div className="space-y-2" role="region" aria-label="Alertas clínicas">
      {critical.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-900">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide">
            <ShieldAlert className="size-4" /> Alertas importantes
          </p>
          <ul className="space-y-1">
            {critical.map((a, i) => (
              <AlertLine key={i} a={a} />
            ))}
          </ul>
        </div>
      )}
      {others.length > 0 && !compact && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <ul className="space-y-1">
            {others.map((a, i) => (
              <AlertLine key={i} a={a} />
            ))}
          </ul>
        </div>
      )}
      {editTo && (
        <div className="text-right">
          <Link to={editTo} className="text-sm font-semibold text-brand-700">
            Editar antecedentes y alertas
          </Link>
        </div>
      )}
    </div>
  );
}

function AlertLine({ a }: { a: ClinicalAlert }) {
  const Icon = a.level === 'critical' ? TriangleAlert : a.level === 'warning' ? TriangleAlert : Info;
  return (
    <li className="flex items-start gap-2 text-[15px]">
      <Icon className={cn('mt-0.5 size-4 shrink-0', a.level === 'info' && 'text-sky-700')} aria-hidden />
      <span className="min-w-0">
        <span className="font-semibold">{a.label}:</span> {a.text}
        {a.pending && <span className="ml-1.5 rounded-full bg-white/70 px-1.5 py-0.5 text-[11px] font-bold text-red-800 ring-1 ring-red-200">Por confirmar</span>}
      </span>
    </li>
  );
}
