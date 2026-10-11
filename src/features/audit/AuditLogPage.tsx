import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Card, EmptyState, Notice } from '@/components/Card';
import { Select } from '@/components/form';
import { useTables } from '@/data/hooks';
import { AUDIT_ACTION, TABLE_LABEL } from '@/data/labels';
import { formatDateTime } from '@/lib/dates';

export function AuditLogPage() {
  const tables = useTables();
  const [entity, setEntity] = useState('');
  const [limit, setLimit] = useState(100);
  const list = useMemo(() => [...tables.auditLog.values()].filter((a) => !entity || a.entity === entity).sort((a, b) => b.at.localeCompare(a.at)), [tables, entity]);
  const entities = [...new Set([...tables.auditLog.values()].map((a) => a.entity))];
  return (
    <>
      <PageHeader title="Historial de cambios" back="/mas" />
      <Page>
        <Notice tone="neutral">Registro cifrado de creaciones, modificaciones, enmiendas, anulaciones, fusiones y exportaciones. No puede editarse desde la app.</Notice>
        <Select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Todos los registros</option>
          {entities.map((e) => (
            <option key={e} value={e}>
              {TABLE_LABEL[e] ?? e}
            </option>
          ))}
        </Select>
        {list.length === 0 ? (
          <EmptyState icon={<History className="size-6" />} title="Sin cambios registrados" />
        ) : (
          <ol className="space-y-2">
            {list.slice(0, limit).map((a) => (
              <li key={a.id}>
                <Card padded={false} className="p-3 text-sm">
                  <p className="font-semibold text-ink-900">
                    {AUDIT_ACTION[a.action]} · {TABLE_LABEL[a.entity] ?? a.entity}
                  </p>
                  <p className="text-ink-500">{formatDateTime(a.at)}</p>
                  {a.summary && <p className="text-ink-700">{a.summary}</p>}
                  {a.reason && <p className="text-ink-700">Motivo: {a.reason}</p>}
                  {a.changes && a.changes.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-brand-700">{a.changes.length} campo(s) modificado(s)</summary>
                      <ul className="mt-1 space-y-1">
                        {a.changes.map((c, i) => (
                          <li key={i} className="rounded bg-sand-100 p-1.5 text-xs">
                            <span className="font-semibold">{c.field}</span>
                            {(c.before !== undefined || c.after !== undefined) && (
                              <>
                                : <span className="text-red-800 line-through">{c.before ?? '—'}</span> → <span className="text-emerald-800">{c.after ?? '—'}</span>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </Card>
              </li>
            ))}
          </ol>
        )}
        {list.length > limit && (
          <button type="button" className="min-h-11 w-full text-sm font-semibold text-brand-700" onClick={() => setLimit((l) => l + 100)}>
            Mostrar más
          </button>
        )}
      </Page>
    </>
  );
}
