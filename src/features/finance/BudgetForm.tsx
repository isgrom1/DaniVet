import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Receipt, UserRound } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Badge, Card, Notice, Section } from '@/components/Card';
import { DateInput, Field, Segmented, TextArea } from '@/components/form';
import { PatientPickerSheet, TutorPickerSheet } from '@/components/pickers';
import { PdfButton } from '@/components/PdfButton';
import { toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { insert, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { BUDGET_STATUS } from '@/data/labels';
import type { Budget } from '@/data/schema';
import { addDays, todayISO } from '@/lib/dates';
import { newId } from '@/lib/ids';
import { emptyToUndef } from '@/lib/objects';
import { safeFileName } from '@/lib/share';
import { pdf } from '@/pdf';
import { LineItemsEditor, fromLineItems, lineErrors, toLineItems, type LineDraft } from './LineItemsEditor';

export function BudgetForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tables = useTables();
  const existing = id ? tables.budgets.get(id) : undefined;
  const [tutorId, setTutorId] = useState(existing?.tutorId ?? params.get('tutorId') ?? '');
  const [patientId, setPatientId] = useState(existing?.patientId ?? params.get('patientId') ?? '');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [validUntil, setValidUntil] = useState(existing?.validUntil ?? addDays(todayISO(), 15));
  const [lines, setLines] = useState<LineDraft[]>(existing ? fromLineItems(existing.items) : [{ id: newId(), description: '', category: 'fee', qty: '1', unitPrice: '', discount: '' }]);
  const [discount, setDiscount] = useState(existing?.discountCLP ? String(existing.discountCLP) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [status, setStatus] = useState<Budget['status']>(existing?.status ?? 'draft');
  const [tp, setTp] = useState(false);
  const [pp, setPp] = useState(false);
  const [busy, setBusy] = useState(false);
  const tutor = tables.tutors.get(tutorId);
  const patient = tables.patients.get(patientId);
  const converted = !!existing?.chargeId;

  const save = async () => {
    const errs = [...lineErrors(lines), ...(!tutor ? ['Elige el tutor'] : [])];
    if (errs.length) {
      toast.error(errs[0]);
      return;
    }
    setBusy(true);
    const data = { tutorId, patientId: patientId || undefined, date, validUntil: validUntil || undefined, items: toLineItems(lines), discountCLP: Number(discount || 0), notes: emptyToUndef(notes), status };
    try {
      const rec = existing ? await update('budgets', existing.id, (cur) => ({ ...cur, ...data })) : await insert('budgets', data);
      toast.success('Presupuesto guardado');
      if (!existing) navigate(`/finanzas/presupuestos/${rec.id}`, { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={existing ? 'Presupuesto' : 'Nuevo presupuesto'} back="/finanzas/presupuestos" />
      <Page>
        {existing && (
          <div className="flex items-center gap-2">
            <Badge tone={status === 'accepted' ? 'success' : status === 'rejected' || status === 'expired' ? 'danger' : 'neutral'}>{BUDGET_STATUS[existing.status]}</Badge>
            {converted && <Badge tone="brand">Convertido en cobro</Badge>}
          </div>
        )}
        {existing && <PdfButton make={() => pdf.budget(existing.id)} fileName={`presupuesto-${safeFileName(tutor?.fullName ?? '')}-${existing.date}.pdf`} label="PDF del presupuesto" block />}
        <Section title="Tutor y paciente">
          <Card className="space-y-2">
            <button type="button" onClick={() => setTp(true)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-sand-300 bg-white px-3 text-left">
              <UserRound className="size-5 text-ink-400" />
              <span className="flex-1 font-semibold">{tutor?.fullName ?? 'Elegir tutor'}</span>
            </button>
            <button type="button" onClick={() => setPp(true)} className="flex min-h-11 w-full items-center rounded-xl border border-dashed border-sand-300 px-3 text-left text-sm">
              {patient ? `Paciente: ${patient.name}` : 'Vincular paciente (opcional)'}
            </button>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha">
                <DateInput value={date} onChange={setDate} clearable={false} />
              </Field>
              <Field label="Válido hasta">
                <DateInput value={validUntil} onChange={setValidUntil} />
              </Field>
            </div>
          </Card>
        </Section>
        <Section title="Detalle">
          <LineItemsEditor lines={lines} onChange={setLines} globalDiscount={discount} onGlobalDiscount={setDiscount} />
        </Section>
        <Section title="Estado y notas">
          <Card className="space-y-3">
            <Segmented name="Estado" size="sm" value={status} onChange={setStatus} options={Object.entries(BUDGET_STATUS).map(([k, v]) => ({ value: k as Budget['status'], label: v }))} />
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notas" placeholder="Condiciones, alcance, observaciones…" minRows={2} />
          </Card>
        </Section>
        {existing && !converted && (
          <Button variant="soft" block icon={<Receipt className="size-4" />} onClick={() => navigate(`/finanzas/cobros/nuevo?budgetId=${existing.id}`)}>
            Convertir en cobro
          </Button>
        )}
        <Notice tone="neutral">El presupuesto es informativo: no constituye boleta ni factura.</Notice>
      </Page>
      <StickyActions>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Cerrar
        </Button>
        <Button block onClick={save} loading={busy}>
          Guardar presupuesto
        </Button>
      </StickyActions>
      {tp && (
        <TutorPickerSheet
          onClose={() => setTp(false)}
          onPick={(t) => {
            setTutorId(t.id);
            setTp(false);
          }}
        />
      )}
      {pp && (
        <PatientPickerSheet
          filter={tutorId ? (p) => p.tutors.some((x) => x.tutorId === tutorId) : undefined}
          onClose={() => setPp(false)}
          onPick={(p) => {
            setPatientId(p.id);
            if (!tutorId) setTutorId(p.tutors[0]?.tutorId ?? '');
            setPp(false);
          }}
        />
      )}
    </>
  );
}
