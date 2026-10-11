import { useMemo } from 'react';
import { BarChart3, CreditCard, FileText, Plus, Receipt, Tags, Wallet } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { LinkButton } from '@/components/Button';
import { Card, List, ListRow, Section } from '@/components/Card';
import { useTables } from '@/data/hooks';
import { formatDate, todayISO } from '@/lib/dates';
import { formatCLP } from '@/lib/numbers';
import { chargeBalance, pendingCharges, periodReport } from './calc';

export function FinanceHome() {
  const tables = useTables();
  const ym = todayISO().slice(0, 7);
  const last = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const r = useMemo(() => periodReport(tables, `${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`), [tables, ym, last]);
  const pending = pendingCharges(tables);
  const pendingTotal = pending.reduce((s, c) => s + chargeBalance(tables, c), 0);
  return (
    <>
      <PageHeader title="Cobros e ingresos" back="/mas" />
      <Page>
        <div className="grid grid-cols-2 gap-2">
          <Card padded={false} className="p-3">
            <p className="text-xs font-semibold text-ink-500">Recibido este mes</p>
            <p className="text-xl font-bold tabular">{formatCLP(r.collected)}</p>
          </Card>
          <Card padded={false} className="p-3">
            <p className="text-xs font-semibold text-ink-500">Por cobrar (total)</p>
            <p className="text-xl font-bold tabular text-amber-800">{formatCLP(pendingTotal)}</p>
          </Card>
          <Card padded={false} className="p-3">
            <p className="text-xs font-semibold text-ink-500">Gastos del mes</p>
            <p className="text-lg font-semibold tabular">{formatCLP(r.expenses)}</p>
          </Card>
          <Card padded={false} className="p-3">
            <p className="text-xs font-semibold text-ink-500">Resultado del mes</p>
            <p className="text-lg font-semibold tabular">{formatCLP(r.net)}</p>
          </Card>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <LinkButton to="/finanzas/cobros/nuevo" icon={<Plus className="size-4" />} size="sm">
            Cobro
          </LinkButton>
          <LinkButton to="/finanzas/gastos/nuevo" variant="secondary" icon={<Plus className="size-4" />} size="sm">
            Gasto
          </LinkButton>
          <LinkButton to="/finanzas/presupuestos/nuevo" variant="secondary" icon={<Plus className="size-4" />} size="sm">
            Presupuesto
          </LinkButton>
        </div>
        {pending.length > 0 && (
          <Section title="Pagos pendientes">
            <List>
              {pending.slice(0, 8).map((c) => (
                <ListRow key={c.id} to={`/finanzas/cobros/${c.id}`} title={tables.tutors.get(c.tutorId)?.fullName ?? 'Tutor'} subtitle={formatDate(c.date)} trailing={<span className="font-semibold tabular text-amber-800">{formatCLP(chargeBalance(tables, c))}</span>} />
              ))}
            </List>
          </Section>
        )}
        <Section title="Gestión">
          <List>
            <ListRow to="/finanzas/cobros" leading={<Receipt className="size-5 text-brand-700" />} title="Cobros" subtitle="Historial y estados de pago" />
            <ListRow to="/finanzas/gastos" leading={<Wallet className="size-5 text-brand-700" />} title="Gastos" subtitle="Traslados, insumos, combustible" />
            <ListRow to="/finanzas/presupuestos" leading={<FileText className="size-5 text-brand-700" />} title="Presupuestos" />
            <ListRow to="/finanzas/reportes" leading={<BarChart3 className="size-5 text-brand-700" />} title="Reportes y exportación CSV" />
            <ListRow to="/ajustes/servicios" leading={<Tags className="size-5 text-brand-700" />} title="Servicios y precios" />
            <ListRow to="/ajustes/pagos" leading={<CreditCard className="size-5 text-brand-700" />} title="Medios de pago" />
          </List>
        </Section>
      </Page>
    </>
  );
}
