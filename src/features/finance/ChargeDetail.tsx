import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Ban, Banknote, Pencil, Receipt } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button, LinkButton } from '@/components/Button';
import { Badge, Card, KeyValue, List, ListRow, Notice, Section } from '@/components/Card';
import { DateInput, Field, MoneyInput, Select, TextInput } from '@/components/form';
import { PdfButton } from '@/components/PdfButton';
import { Sheet, promptDialog, toast } from '@/components/overlay';
import { useSettings, useTables } from '@/data/hooks';
import { insert, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { CHARGE_CATEGORY, PAYMENT_STATUS, PAYMENT_STATUS_TONE } from '@/data/labels';
import type { Charge } from '@/data/schema';
import { formatDate, todayISO } from '@/lib/dates';
import { formatCLP, formatDecimal } from '@/lib/numbers';
import { safeFileName } from '@/lib/share';
import { pdf } from '@/pdf';
import { byCategory, chargeBalance, chargeState, chargeTotal, lineTotal, paidFor } from './calc';

export function ChargeDetail() {
  const { id = '' } = useParams();
  const tables = useTables();
  const c = tables.charges.get(id);
  const [payOpen, setPayOpen] = useState(false);
  if (!c) {
    return (
      <>
        <PageHeader title="Cobro" back="/finanzas" />
        <Page>
          <Notice tone="warning">No se encontró este cobro.</Notice>
        </Page>
      </>
    );
  }
  const tutor = tables.tutors.get(c.tutorId);
  const patient = c.patientId ? tables.patients.get(c.patientId) : undefined;
  const st = chargeState(tables, c);
  const payments = [...tables.payments.values()].filter((p) => p.chargeId === c.id).sort((a, b) => a.date.localeCompare(b.date));
  const cats = byCategory(c.items);

  const voidPayment = async (pid: string) => {
    const reason = await promptDialog({ title: 'Anular pago', label: 'Motivo', confirmLabel: 'Anular pago' });
    if (!reason) return;
    try {
      await update('payments', pid, { voided: true, voidReason: reason }, { action: 'void', reason });
      toast.success('Pago anulado');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  const voidCharge = async () => {
    if (payments.some((p) => !p.voided)) {
      toast.error('Primero anula los pagos asociados a este cobro.');
      return;
    }
    const reason = await promptDialog({ title: 'Anular cobro', label: 'Motivo', confirmLabel: 'Anular cobro' });
    if (!reason) return;
    try {
      await update('charges', c.id, { voided: true, voidReason: reason }, { action: 'void', reason });
      toast.success('Cobro anulado');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Cobro"
        subtitle={formatDate(c.date)}
        back={tutor ? `/tutores/${tutor.id}` : '/finanzas'}
        actions={
          !c.voided && (
            <LinkButton to={`/finanzas/cobros/nuevo?id=${c.id}`} size="sm" variant="ghost" icon={<Pencil className="size-4" />}>
              Editar
            </LinkButton>
          )
        }
      />
      <Page>
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-2xl font-bold tabular">{formatCLP(chargeTotal(c))}</p>
            <Badge tone={PAYMENT_STATUS_TONE[st]}>{PAYMENT_STATUS[st]}</Badge>
          </div>
          <p className="text-sm text-ink-600">
            Pagado {formatCLP(paidFor(tables, c.id))} · Saldo <strong>{formatCLP(chargeBalance(tables, c))}</strong>
          </p>
          <dl className="divide-y divide-sand-100">
            <KeyValue label="Tutor/a" value={tutor ? <Link to={`/tutores/${tutor.id}`} className="font-semibold text-brand-700">{tutor.fullName}</Link> : undefined} />
            <KeyValue label="Paciente" value={patient?.name} />
            <KeyValue label="Consulta" value={c.consultationId ? <Link to={`/consultas/${c.consultationId}`} className="text-brand-700">Ver consulta</Link> : undefined} />
            <KeyValue label="Notas" value={c.notes} />
          </dl>
        </Card>
        {c.voided && <Notice tone="danger">Cobro anulado: {c.voidReason}</Notice>}
        {!c.voided && st !== 'paid' && (
          <Button block size="lg" icon={<Banknote className="size-5" />} onClick={() => setPayOpen(true)}>
            Registrar pago o abono
          </Button>
        )}
        <PdfButton make={() => pdf.receipt(c.id)} fileName={`comprobante-interno-${safeFileName(tutor?.fullName ?? '')}-${c.date}.pdf`} label="Comprobante interno (PDF)" icon={<Receipt className="size-4" />} block note="Documento interno: no es boleta ni factura." />
        <Section title="Detalle">
          <List>
            {c.items.map((li) => (
              <ListRow
                key={li.id}
                title={li.description}
                subtitle={`${CHARGE_CATEGORY[li.category]} · ${formatDecimal(li.qty)} × ${formatCLP(li.unitPriceCLP)}${li.discountCLP ? ` − ${formatCLP(li.discountCLP)}` : ''}`}
                trailing={<span className="font-semibold tabular text-ink-800">{formatCLP(lineTotal(li))}</span>}
              />
            ))}
            {c.discountCLP > 0 && <ListRow title="Descuento general" trailing={<span className="tabular">−{formatCLP(c.discountCLP)}</span>} />}
          </List>
          <Card className="space-y-1 text-sm">
            {(Object.keys(cats) as Array<keyof typeof cats>)
              .filter((k) => cats[k])
              .map((k) => (
                <div key={k} className="flex justify-between">
                  <span>{CHARGE_CATEGORY[k]}</span>
                  <span className="tabular">{formatCLP(cats[k])}</span>
                </div>
              ))}
          </Card>
        </Section>
        <Section title="Pagos">
          {payments.length === 0 ? (
            <p className="px-1 text-sm text-ink-500">Sin pagos registrados.</p>
          ) : (
            <List>
              {payments.map((p) => (
                <ListRow
                  key={p.id}
                  title={`${formatCLP(p.amountCLP)} · ${p.methodName}`}
                  subtitle={`${formatDate(p.date)}${p.reference ? ` · Ref. ${p.reference}` : ''}${p.voided ? ` · Anulado: ${p.voidReason}` : ''}`}
                  trailing={
                    p.voided ? (
                      <Badge tone="danger">Anulado</Badge>
                    ) : (
                      <button type="button" className="min-h-9 rounded-lg px-2 text-sm font-semibold text-red-700" onClick={() => voidPayment(p.id)}>
                        Anular
                      </button>
                    )
                  }
                />
              ))}
            </List>
          )}
        </Section>
        {!c.voided && (
          <Button variant="ghost" className="text-red-700" icon={<Ban className="size-4" />} onClick={voidCharge}>
            Anular cobro
          </Button>
        )}
      </Page>
      {payOpen && <PaymentSheet charge={c} onClose={() => setPayOpen(false)} />}
    </>
  );
}

function PaymentSheet({ charge, onClose }: { charge: Charge; onClose: () => void }) {
  const tables = useTables();
  const settings = useSettings();
  const methods = settings.paymentMethods.filter((m) => m.active);
  const balance = chargeBalance(tables, charge);
  const [amount, setAmount] = useState(String(balance));
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState(methods[0]?.id ?? 'cash');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Number(amount || 0);
  const error = n <= 0 ? 'El monto debe ser mayor que 0' : n > balance ? `No puede superar el saldo (${formatCLP(balance)})` : null;
  const save = async () => {
    if (error) return;
    setBusy(true);
    try {
      const m = methods.find((x) => x.id === method);
      await insert('payments', { chargeId: charge.id, tutorId: charge.tutorId, date, amountCLP: n, methodId: method, methodName: m?.name ?? method, reference: ref.trim() || undefined, voided: false });
      toast.success(n === balance ? 'Pago registrado: cobro saldado' : 'Abono registrado');
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Registrar pago"
      footer={
        <Button block onClick={save} loading={busy} disabled={!!error}>
          Guardar pago
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-600">Saldo pendiente: {formatCLP(balance)}</p>
        <Field label="Monto" error={amount ? error : null}>
          <MoneyInput value={amount} onChange={setAmount} aria-label="Monto" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <DateInput value={date} onChange={setDate} clearable={false} />
          </Field>
          <Field label="Medio de pago">
            <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Medio de pago">
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Referencia (opcional)">
          <TextInput value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
