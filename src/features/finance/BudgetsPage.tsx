import { Plus, FileText } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { LinkButton } from '@/components/Button';
import { Badge, EmptyState, List, ListRow } from '@/components/Card';
import { useTables } from '@/data/hooks';
import { BUDGET_STATUS } from '@/data/labels';
import { formatDate } from '@/lib/dates';
import { formatCLP } from '@/lib/numbers';
import { docTotal } from './calc';

export function BudgetsPage() {
  const tables = useTables();
  const list = [...tables.budgets.values()].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <PageHeader
        title="Presupuestos"
        back="/finanzas"
        actions={
          <LinkButton to="/finanzas/presupuestos/nuevo" size="sm" icon={<Plus className="size-4" />}>
            Nuevo
          </LinkButton>
        }
      />
      <Page>
        {list.length === 0 ? (
          <EmptyState icon={<FileText className="size-6" />} title="Sin presupuestos" action={<LinkButton to="/finanzas/presupuestos/nuevo">Crear presupuesto</LinkButton>} />
        ) : (
          <List>
            {list.map((b) => (
              <ListRow
                key={b.id}
                to={`/finanzas/presupuestos/${b.id}`}
                title={`${tables.tutors.get(b.tutorId)?.fullName ?? 'Tutor'} · ${formatCLP(docTotal(b))}`}
                subtitle={`${formatDate(b.date)}${b.validUntil ? ` · válido hasta ${formatDate(b.validUntil)}` : ''}`}
                trailing={<Badge tone={b.status === 'accepted' ? 'success' : b.status === 'rejected' || b.status === 'expired' ? 'danger' : 'neutral'}>{BUDGET_STATUS[b.status]}</Badge>}
              />
            ))}
          </List>
        )}
      </Page>
    </>
  );
}
