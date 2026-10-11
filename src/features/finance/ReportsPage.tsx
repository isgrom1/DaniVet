import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice, Section } from '@/components/Card';
import { DateInput, Field, Segmented } from '@/components/form';
import { confirmDialog, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { insert } from '@/data/repo';
import { CHARGE_CATEGORY, EXPENSE_CATEGORY } from '@/data/labels';
import type { ChargeCategory, ExpenseCategory } from '@/data/schema';
import { addDays, todayISO } from '@/lib/dates';
import { formatCLP, formatDecimal } from '@/lib/numbers';
import { downloadFile, shareFile } from '@/lib/share';
import { periodReport } from './calc';
import { chargesCsv, expensesCsv, paymentsCsv } from './exports';

function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`];
}

export function ReportsPage() {
  const tables = useTables();
  const [mode, setMode] = useState<'month' | 'range'>('month');
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [from, setFrom] = useState(addDays(todayISO(), -30));
  const [to, setTo] = useState(todayISO());
  const [a, b] = mode === 'month' ? monthRange(month) : [from, to];
  const r = useMemo(() => periodReport(tables, a, b), [tables, a, b]);

  const exportCsv = async (kind: 'cobros' | 'pagos' | 'gastos') => {
    if (kind !== 'gastos') {
      const ok = await confirmDialog({
        title: 'Exportar CSV',
        message: 'El archivo incluirá nombres de tutores (datos personales). Compártelo solo con quien corresponda, por ejemplo tu contador.',
        confirmLabel: 'Exportar',
      });
      if (!ok) return;
    }
    const csv = kind === 'cobros' ? chargesCsv(tables, a, b) : kind === 'pagos' ? paymentsCsv(tables, a, b) : expensesCsv(tables, a, b);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const name = `${kind}-${a}_a_${b}.csv`;
    try {
      const res = await shareFile(blob, name);
      if (res === 'unsupported') downloadFile(blob, name);
      await insert('auditLog', { at: new Date().toISOString(), entity: 'export', entityId: kind, action: 'export', summary: `CSV de ${kind} (${a} a ${b})` });
    } catch {
      toast.error('No se pudo exportar el archivo.');
    }
  };

  return (
    <>
      <PageHeader title="Reportes" back="/finanzas" />
      <Page>
        <Segmented
          name="Período"
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'month', label: 'Mes' },
            { value: 'range', label: 'Rango de fechas' },
          ]}
        />
        {mode === 'month' ? (
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="input-base" aria-label="Mes" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde">
              <DateInput value={from} onChange={setFrom} clearable={false} />
            </Field>
            <Field label="Hasta">
              <DateInput value={to} onChange={setTo} clearable={false} />
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Ingresos recibidos" value={formatCLP(r.collected)} hint={`${r.payments} pago(s)`} strong />
          <Stat label="Gastos" value={formatCLP(r.expenses)} hint={r.km ? `${formatDecimal(r.km)} km` : undefined} />
          <Stat label="Resultado (ingresos − gastos)" value={formatCLP(r.net)} strong />
          <Stat label="Atenciones cobradas" value={formatCLP(r.billed)} hint={`${r.charges} cobro(s)`} />
          <Stat label="Pendiente de pago (del período)" value={formatCLP(r.pendingFromPeriod)} />
          <Stat label="Descuentos otorgados" value={formatCLP(r.discounts)} />
        </div>
        <Section title="Facturado por tipo">
          <Card className="space-y-1.5 text-[15px]">
            {(Object.keys(r.byCategory) as ChargeCategory[]).map((k) => (
              <div key={k} className="flex justify-between">
                <span>{CHARGE_CATEGORY[k]}</span>
                <span className="tabular">{formatCLP(r.byCategory[k])}</span>
              </div>
            ))}
          </Card>
        </Section>
        <Section title="Gastos por categoría">
          <Card className="space-y-1.5 text-[15px]">
            {Object.keys(r.expensesByCategory).length === 0 && <p className="text-sm text-ink-500">Sin gastos en el período.</p>}
            {Object.entries(r.expensesByCategory).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span>{EXPENSE_CATEGORY[k as ExpenseCategory]}</span>
                <span className="tabular">{formatCLP(v)}</span>
              </div>
            ))}
          </Card>
        </Section>
        <Section title="Exportar (CSV para Excel o Numbers)">
          <div className="grid gap-2">
            <Button variant="secondary" icon={<FileSpreadsheet className="size-4" />} onClick={() => exportCsv('cobros')}>
              Cobros del período
            </Button>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => exportCsv('pagos')}>
              Pagos del período
            </Button>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => exportCsv('gastos')}>
              Gastos del período
            </Button>
          </div>
        </Section>
        <Notice tone="neutral">Este resumen es de gestión interna. No reemplaza la contabilidad ni las obligaciones tributarias (por ejemplo, boletas de honorarios ante el SII).</Notice>
      </Page>
    </>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <Card padded={false} className="p-3">
      <p className="text-xs font-semibold text-ink-500">{label}</p>
      <p className={strong ? 'text-xl font-bold tabular text-ink-900' : 'text-lg font-semibold tabular text-ink-800'}>{value}</p>
      {hint && <p className="text-xs text-ink-500">{hint}</p>}
    </Card>
  );
}
