import { useMemo, useState } from 'react';
import { Plus, Wallet } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { LinkButton } from '@/components/Button';
import { Card, EmptyState, List, ListRow } from '@/components/Card';
import { useTables } from '@/data/hooks';
import { EXPENSE_CATEGORY } from '@/data/labels';
import { formatDate, todayISO } from '@/lib/dates';
import { formatCLP, formatDecimal } from '@/lib/numbers';

export function ExpensesPage() {
  const tables = useTables();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const list = useMemo(() => [...tables.expenses.values()].filter((e) => e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date)), [tables, month]);
  const total = list.reduce((s, e) => s + e.amountCLP, 0);
  const km = list.reduce((s, e) => s + (e.km ?? 0), 0);
  return (
    <>
      <PageHeader
        title="Gastos"
        back="/finanzas"
        actions={
          <LinkButton to="/finanzas/gastos/nuevo" size="sm" icon={<Plus className="size-4" />}>
            Nuevo
          </LinkButton>
        }
      />
      <Page>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="input-base" aria-label="Mes" />
        <Card className="flex justify-between">
          <span>
            Total del mes{km ? <span className="block text-sm text-ink-500">{formatDecimal(km)} km registrados</span> : null}
          </span>
          <span className="text-xl font-bold tabular">{formatCLP(total)}</span>
        </Card>
        {list.length === 0 ? (
          <EmptyState icon={<Wallet className="size-6" />} title="Sin gastos este mes" />
        ) : (
          <List>
            {list.map((e) => (
              <ListRow key={e.id} to={`/finanzas/gastos/${e.id}`} title={e.description} subtitle={`${formatDate(e.date)} · ${EXPENSE_CATEGORY[e.category]}${e.km ? ` · ${formatDecimal(e.km)} km` : ''}`} trailing={<span className="font-semibold tabular text-ink-800">{formatCLP(e.amountCLP)}</span>} />
            ))}
          </List>
        )}
      </Page>
    </>
  );
}
