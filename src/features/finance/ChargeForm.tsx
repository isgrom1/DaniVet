import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Receipt, UserRound } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice, Section } from '@/components/Card';
import { DateInput, Field, MoneyInput, Select, Switch, TextArea, TextInput } from '@/components/form';
import { DraftBanner } from '@/components/DraftBanner';
import { PatientPickerSheet, TutorPickerSheet } from '@/components/pickers';
import { toast } from '@/components/overlay';
import { useSettings, useTables } from '@/data/hooks';
import { batch } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { formatCLP } from '@/lib/numbers';
import { todayISO, localDateOf } from '@/lib/dates';
import { newId } from '@/lib/ids';
import { emptyToUndef } from '@/lib/objects';
import { useFormDraft } from '@/lib/useFormDraft';
import { primaryTutorId } from '@/features/patients/selectors';
import { LineItemsEditor, fromLineItems, lineErrors, toLineItems, type LineDraft } from './LineItemsEditor';
import { docTotal, paidFor } from './calc';

interface FormState {
  tutorId: string;
  patientId: string;
  date: string;
  lines: LineDraft[];
  discount: string;
  notes: string;
  payNow: boolean;
  payAmount: string;
  payMethod: string;
  payRef: string;
}

export function ChargeForm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tables = useTables();
  const settings = useSettings();
  const editId = params.get('id');
  const existing = editId ? tables.charges.get(editId) : undefined;
  const consultation = params.get('consultationId') ? tables.consultations.get(params.get('consultationId')!) : undefined;
  const appointment = params.get('appointmentId') ? tables.appointments.get(params.get('appointmentId')!) : undefined;
  const budget = params.get('budgetId') ? tables.budgets.get(params.get('budgetId')!) : undefined;
  const qPatient = params.get('patientId') ? tables.patients.get(params.get('patientId')!) : undefined;
  const methods = settings.paymentMethods.filter((m) => m.active);

  const form = useFormDraft<FormState>(`form:charge:${editId ?? `new:${params.toString()}`}`, () => ({
    tutorId: existing?.tutorId ?? budget?.tutorId ?? consultation?.tutorId ?? appointment?.tutorId ?? params.get('tutorId') ?? (qPatient ? (primaryTutorId(qPatient) ?? '') : ''),
    patientId: existing?.patientId ?? budget?.patientId ?? consultation?.patientId ?? appointment?.patientIds[0] ?? qPatient?.id ?? '',
    date: existing?.date ?? (consultation ? localDateOf(consultation.startedAt) : appointment ? localDateOf(appointment.start) : todayISO()),
    lines: existing ? fromLineItems(existing.items) : budget ? fromLineItems(budget.items.map((i) => ({ ...i, id: newId() }))) : [{ id: newId(), description: '', category: 'fee', qty: '1', unitPrice: '', discount: '' }],
    discount: existing?.discountCLP ? String(existing.discountCLP) : budget?.discountCLP ? String(budget.discountCLP) : '',
    notes: existing?.notes ?? '',
    payNow: false,
    payAmount: '',
    payMethod: methods[0]?.id ?? 'cash',
    payRef: '',
  }));
  const f = form.value;
  const [tutorPicker, setTutorPicker] = useState(false);
  const [patientPicker, setPatientPicker] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const tutor = tables.tutors.get(f.tutorId);
  const patient = tables.patients.get(f.patientId);
  const items = toLineItems(f.lines);
  const total = docTotal({ items, discountCLP: Number(f.discount || 0) });
  const subtotal = items.reduce((s, i) => s + Math.max(0, Math.round(i.qty * i.unitPriceCLP) - i.discountCLP), 0);
  const errs = [...lineErrors(f.lines), ...(!tutor ? ['Elige el tutor'] : []), ...(Number(f.discount || 0) > subtotal ? ['El descuento supera el subtotal'] : [])];
  const payAmount = Number(f.payAmount || 0);
  const alreadyPaid = existing ? paidFor(tables, existing.id) : 0;

  const save = async () => {
    setTried(true);
    if (errs.length) {
      toast.error(errs[0]);
      return;
    }
    if (f.payNow && (payAmount <= 0 || payAmount > total)) {
      toast.error('El pago debe ser mayor que 0 y no superar el total.');
      return;
    }
    if (existing && total < alreadyPaid) {
      toast.error(`El nuevo total (${formatCLP(total)}) es menor que lo ya pagado (${formatCLP(alreadyPaid)}). Anula primero algún pago.`);
      return;
    }
    setBusy(true);
    try {
      const b = batch();
      const data = {
        tutorId: f.tutorId,
        patientId: f.patientId || undefined,
        consultationId: existing?.consultationId ?? consultation?.id,
        appointmentId: existing?.appointmentId ?? appointment?.id ?? consultation?.appointmentId,
        budgetId: existing?.budgetId ?? budget?.id,
        date: f.date,
        items,
        discountCLP: Number(f.discount || 0),
        notes: emptyToUndef(f.notes),
      };
      const rec = existing ? b.update('charges', existing.id, (cur) => ({ ...cur, ...data }), { baseRev: existing.rev }) : b.insert('charges', { ...data, voided: false });
      if (budget && !existing) b.update('budgets', budget.id, { status: 'accepted', chargeId: rec.id });
      if (f.payNow && !existing) {
        const m = methods.find((x) => x.id === f.payMethod);
        b.insert('payments', { chargeId: rec.id, tutorId: f.tutorId, date: f.date, amountCLP: payAmount, methodId: f.payMethod, methodName: m?.name ?? f.payMethod, reference: emptyToUndef(f.payRef), voided: false });
      }
      await b.commit();
      await form.done();
      toast.success(existing ? 'Cobro actualizado' : 'Cobro registrado');
      navigate(`/finanzas/cobros/${rec.id}`, { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={existing ? 'Editar cobro' : 'Nuevo cobro'} back="/finanzas" />
      <Page>
        {form.restorable && <DraftBanner at={form.restorable.at} onRestore={form.restore} onDiscard={form.discardDraft} />}
        {budget && <Notice tone="info">Ítems traídos del presupuesto del {budget.date}. Revisa antes de guardar.</Notice>}
        <Section title="Tutor y paciente">
          <Card className="space-y-2">
            <button type="button" onClick={() => setTutorPicker(true)} disabled={!!existing} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-sand-300 bg-white px-3 text-left disabled:bg-sand-50">
              <UserRound className="size-5 text-ink-400" />
              <span className="flex-1 font-semibold">{tutor?.fullName ?? 'Elegir tutor'}</span>
            </button>
            {tried && !tutor && <p className="text-sm font-medium text-red-700">Elige el tutor.</p>}
            <button type="button" onClick={() => setPatientPicker(true)} className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-dashed border-sand-300 px-3 text-left text-sm">
              <span className="flex-1">{patient ? `Paciente: ${patient.name}` : 'Vincular paciente (opcional)'}</span>
            </button>
            <Field label="Fecha">
              <DateInput value={f.date} onChange={(v) => form.setField('date', v)} clearable={false} />
            </Field>
          </Card>
        </Section>
        <Section title="Detalle" description="Separa honorarios, medicamentos, insumos y traslados.">
          <LineItemsEditor lines={f.lines} onChange={(l) => form.setField('lines', l)} globalDiscount={f.discount} onGlobalDiscount={(v) => form.setField('discount', v)} />
          {tried && errs.length > 0 && <Notice tone="danger">{errs.join(' · ')}</Notice>}
        </Section>
        <Section title="Notas">
          <Card>
            <TextArea value={f.notes} onChange={(e) => form.setField('notes', e.target.value)} aria-label="Notas del cobro" minRows={2} />
          </Card>
        </Section>
        {!existing && (
          <Section title="Pago">
            <Card className="space-y-3">
              <Switch checked={f.payNow} onChange={(v) => form.set((p) => ({ ...p, payNow: v, payAmount: v && !p.payAmount ? String(total) : p.payAmount }))} label="Registrar un pago ahora" description="Puedes registrar abonos después desde el cobro." />
              {f.payNow && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Monto">
                      <MoneyInput value={f.payAmount} onChange={(v) => form.setField('payAmount', v)} aria-label="Monto del pago" />
                    </Field>
                    <Field label="Medio de pago">
                      <Select value={f.payMethod} onChange={(e) => form.setField('payMethod', e.target.value)} aria-label="Medio de pago">
                        {methods.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Referencia (opcional)" hint="N.º de transferencia, voucher…">
                    <TextInput value={f.payRef} onChange={(e) => form.setField('payRef', e.target.value)} />
                  </Field>
                </>
              )}
            </Card>
          </Section>
        )}
        <Notice tone="neutral">Los cobros generan comprobantes internos. No son boletas ni facturas y no se informan al SII.</Notice>
      </Page>
      <StickyActions>
        <Button variant="secondary" onClick={async () => { await form.discardDraft(); await form.done(); navigate(-1); }}>
          Cancelar
        </Button>
        <Button block onClick={save} loading={busy} icon={<Receipt className="size-4" />}>
          {existing ? 'Guardar cambios' : `Guardar cobro · ${formatCLP(total)}`}
        </Button>
      </StickyActions>
      {tutorPicker && (
        <TutorPickerSheet
          onClose={() => setTutorPicker(false)}
          onPick={(t) => {
            form.set((p) => ({ ...p, tutorId: t.id, patientId: p.patientId && tables.patients.get(p.patientId)?.tutors.some((x) => x.tutorId === t.id) ? p.patientId : '' }));
            setTutorPicker(false);
          }}
        />
      )}
      {patientPicker && (
        <PatientPickerSheet
          filter={f.tutorId ? (p) => p.tutors.some((x) => x.tutorId === f.tutorId) : undefined}
          onClose={() => setPatientPicker(false)}
          onPick={(p) => {
            form.set((prev) => ({ ...prev, patientId: p.id, tutorId: prev.tutorId || (primaryTutorId(p) ?? '') }));
            setPatientPicker(false);
          }}
        />
      )}
    </>
  );
}
