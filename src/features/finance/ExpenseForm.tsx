import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Car, Trash2 } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice, Section } from '@/components/Card';
import { DateInput, DecimalInput, Field, MoneyInput, ProvenanceTag, Select, TextInput } from '@/components/form';
import { confirmDialog, toast } from '@/components/overlay';
import { useSettings, useTables } from '@/data/hooks';
import { insert, remove, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { EXPENSE_CATEGORY } from '@/data/labels';
import type { ExpenseCategory } from '@/data/schema';
import { localDateOf, todayISO } from '@/lib/dates';
import { formatCLP, formatDecimal, parseDecimal } from '@/lib/numbers';
import { emptyToUndef } from '@/lib/objects';
import { addressText } from '@/lib/maps';

export function ExpenseForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tables = useTables();
  const settings = useSettings();
  const existing = id ? tables.expenses.get(id) : undefined;
  const appointment = (existing?.appointmentId ?? params.get('appointmentId')) ? tables.appointments.get(existing?.appointmentId ?? params.get('appointmentId')!) : undefined;
  const [date, setDate] = useState(existing?.date ?? (appointment ? localDateOf(appointment.start) : todayISO()));
  const [category, setCategory] = useState<ExpenseCategory>(existing?.category ?? (params.get('categoria') as ExpenseCategory) ?? 'other');
  const [description, setDescription] = useState(existing?.description ?? (appointment ? `Traslado a ${addressText(appointment.address)}` : ''));
  const [amount, setAmount] = useState(existing ? String(existing.amountCLP) : '');
  const [km, setKm] = useState(existing?.km !== undefined ? formatDecimal(existing.km) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [usedRate, setUsedRate] = useState(false);
  const [tried, setTried] = useState(false);
  const kmN = parseDecimal(km);
  const rate = settings.kmRateCLP;
  const errors = {
    description: !description.trim() ? 'Describe el gasto' : null,
    amount: !(Number(amount) > 0) ? 'Indica un monto mayor que 0' : null,
    km: km && (kmN === null || kmN < 0) ? 'Kilómetros no válidos' : null,
  };
  const save = async () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) {
      toast.error(Object.values(errors).find(Boolean)!);
      return;
    }
    setBusy(true);
    const data = {
      date,
      category,
      description: description.trim(),
      amountCLP: Number(amount),
      km: kmN ?? undefined,
      appointmentId: appointment?.id,
      consultationId: existing?.consultationId ?? params.get('consultationId') ?? undefined,
      patientId: existing?.patientId ?? appointment?.patientIds[0],
      notes: emptyToUndef(notes),
    };
    try {
      if (existing) await update('expenses', existing.id, (cur) => ({ ...cur, ...data }));
      else await insert('expenses', data);
      toast.success('Gasto guardado');
      navigate('/finanzas/gastos', { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    if (!existing) return;
    if (!(await confirmDialog({ title: 'Eliminar gasto', confirmLabel: 'Eliminar', tone: 'danger' }))) return;
    try {
      await remove('expenses', existing.id);
      navigate('/finanzas/gastos', { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  return (
    <>
      <PageHeader title={existing ? 'Gasto' : 'Nuevo gasto'} back="/finanzas/gastos" />
      <Page>
        {appointment && <Notice tone="info">Vinculado a la visita del {localDateOf(appointment.start)}.</Notice>}
        <Section title="Gasto">
          <Card className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha">
                <DateInput value={date} onChange={setDate} clearable={false} />
              </Field>
              <Field label="Categoría">
                <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} aria-label="Categoría">
                  {Object.entries(EXPENSE_CATEGORY).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Descripción" required error={tried ? errors.description : null}>
              <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            {(category === 'travel' || category === 'fuel') && (
              <Field label="Kilometraje" error={errors.km} hint={rate ? `Tarifa configurada: ${formatCLP(rate)} por km.` : 'Puedes configurar una tarifa por km en Ajustes › Agenda.'}>
                <div className="flex gap-2">
                  <DecimalInput value={km} onChange={setKm} unit="km" />
                  {rate && kmN ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      icon={<Car className="size-4" />}
                      onClick={() => {
                        setAmount(String(Math.round(kmN * rate)));
                        setUsedRate(true);
                      }}
                    >
                      Calcular {formatCLP(Math.round(kmN * rate))}
                    </Button>
                  ) : null}
                </div>
              </Field>
            )}
            <Field label="Monto" required error={tried ? errors.amount : null} tag={usedRate ? <ProvenanceTag kind="calculated" label="km × tarifa" /> : undefined}>
              <MoneyInput value={amount} onChange={(v) => { setAmount(v); setUsedRate(false); }} aria-label="Monto del gasto" />
            </Field>
            <Field label="Notas">
              <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </Card>
        </Section>
        {existing && (
          <Button variant="ghost" className="text-red-700" icon={<Trash2 className="size-4" />} onClick={del}>
            Eliminar gasto
          </Button>
        )}
      </Page>
      <StickyActions>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
        <Button block onClick={save} loading={busy}>
          Guardar gasto
        </Button>
      </StickyActions>
    </>
  );
}
