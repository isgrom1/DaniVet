import { useMemo, useState } from 'react';
import { Plus, Receipt } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { LinkButton } from '@/components/Button';
import { Badge, EmptyState, List, ListRow } from '@/components/Card';
import { SearchInput, Segmented } from '@/components/form';
import { useTables } from '@/data/hooks';
import { PAYMENT_STATUS, PAYMENT_STATUS_TONE } from '@/data/labels';
import { formatDate } from '@/lib/dates';
import { formatCLP } from '@/lib/numbers';
import { matchesQuery } from '@/lib/text';
import { chargeBalance, chargeState, chargeTotal, type PaymentState } from './calc';

export function ChargesPage() {
  const tables = useTables();
  const [q, setQ] = useState('');
  const [st, setSt] = useState<'open' | PaymentState | 'all'>('open');
  const list = useMemo(
    () =>
      [...tables.charges.values()]
        .map((c) => ({ c, s: chargeState(tables, c) }))
        .filter(({ s }) => (st === 'all' ? true : st === 'open' ? s === 'pending' || s === 'partial' : s === st))
        .filter(({ c }) => matchesQuery(q, tables.tutors.get(c.tutorId)?.fullName, c.patientId ? tables.patients.get(c.patientId)?.name : '', ...c.items.map((i) => i.description)))
        .sort((a, b) => b.c.date.localeCompare(a.c.date)),
    [tables, q, st],
  );
  return (
    <>
      <PageHeader
        title="Cobros"
        back="/finanzas"
        actions={
          <LinkButton to="/finanzas/cobros/nuevo" size="sm" icon={<Plus className="size-4" />}>
            Nuevo
          </LinkButton>
        }
      />
      <Page>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por tutor, paciente o servicio" />
        <Segmented
          name="Estado"
          size="sm"
          value={st}
          onChange={setSt}
          options={[
            { value: 'open', label: 'Con saldo' },
            { value: 'paid', label: 'Pagados' },
            { value: 'voided', label: 'Anulados' },
            { value: 'all', label: 'Todos' },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState icon={<Receipt className="size-6" />} title="Sin cobros en esta vista" />
        ) : (
          <List>
            {list.map(({ c, s }) => (
              <ListRow
                key={c.id}
                to={`/finanzas/cobros/${c.id}`}
                title={`${tables.tutors.get(c.tutorId)?.fullName ?? 'Tutor'} · ${formatCLP(chargeTotal(c))}`}
                subtitle={`${formatDate(c.date)}${c.patientId ? ` · ${tables.patients.get(c.patientId)?.name ?? ''}` : ''}${chargeBalance(tables, c) > 0 ? ` · saldo ${formatCLP(chargeBalance(tables, c))}` : ''}`}
                trailing={<Badge tone={PAYMENT_STATUS_TONE[s]}>{PAYMENT_STATUS[s]}</Badge>}
              />
            ))}
          </List>
        )}
      </Page>
    </>
  );
}
