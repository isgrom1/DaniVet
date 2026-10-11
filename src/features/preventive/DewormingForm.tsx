import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ban, Bug, UserRound } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Badge, Card, Notice, Section } from '@/components/Card';
import { DateInput, DecimalInput, Field, ProvenanceTag, Segmented, TextArea, TextInput } from '@/components/form';
import { DraftBanner } from '@/components/DraftBanner';
import { PatientPickerSheet } from '@/components/pickers';
import { confirmDialog, promptDialog, toast } from '@/components/overlay';
import { useProfile, useTables } from '@/data/hooks';
import { batch, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { DEWORM_KIND, DEWORM_ROUTE, WEIGHT_SOURCE } from '@/data/labels';
import type { Deworming } from '@/data/schema';
import { formatDate, todayISO } from '@/lib/dates';
import { formatDecimal, parseDecimal } from '@/lib/numbers';
import { emptyToUndef } from '@/lib/objects';
import { useFormDraft } from '@/lib/useFormDraft';
import { latestWeight } from '@/features/patients/selectors';
import { ExpiryWarning, InventoryPicker, ProtocolPicker, type InventoryChoice } from './common';

interface FormState {
  patientId: string;
  date: string;
  kind: Deworming['kind'];
  product: string;
  activeIngredient: string;
  weightKg: string;
  weightSource: NonNullable<Deworming['weightSource']>;
  dose: string;
  route: Deworming['route'] | '';
  protocolApplied: string;
  protocolId: string;
  nextDueDate: string;
  nextDueSource: 'manual' | 'protocol';
  lotNumber: string;
  productExpiry: string;
  professionalName: string;
  notes: string;
  inv: InventoryChoice;
}

export function DewormingForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tables = useTables();
  const profile = useProfile();
  const existing = id ? tables.dewormings.get(id) : undefined;
  const prev = params.get('from') ? tables.dewormings.get(params.get('from')!) : undefined;
  const consultationId = existing?.consultationId ?? params.get('consultationId') ?? undefined;
  const consultation = consultationId ? tables.consultations.get(consultationId) : undefined;
  const initialPatient = existing?.patientId ?? prev?.patientId ?? params.get('patientId') ?? '';
  const lw0 = initialPatient ? latestWeight(tables, initialPatient) : undefined;

  const form = useFormDraft<FormState>(`form:deworming:${id ?? `new:${initialPatient}:${consultationId ?? ''}`}`, () => {
    const todayWeight = consultation?.exam.weightKg;
    return {
      patientId: initialPatient,
      date: existing?.date ?? todayISO(),
      kind: existing?.kind ?? prev?.kind ?? 'internal',
      product: existing?.product ?? prev?.product ?? '',
      activeIngredient: existing?.activeIngredient ?? prev?.activeIngredient ?? '',
      weightKg: existing?.weightKgUsed !== undefined ? formatDecimal(existing.weightKgUsed) : todayWeight ? formatDecimal(todayWeight) : lw0 ? formatDecimal(lw0.weightKg) : '',
      weightSource: existing?.weightSource ?? (todayWeight ? 'measured_today' : 'last_record'),
      dose: existing?.dose ?? '',
      route: existing?.route ?? prev?.route ?? '',
      protocolApplied: existing?.protocolApplied ?? '',
      protocolId: existing?.protocolId ?? '',
      nextDueDate: existing?.nextDueDate ?? '',
      nextDueSource: existing?.nextDueSource ?? 'manual',
      lotNumber: existing?.lotNumber ?? '',
      productExpiry: existing?.productExpiry ?? '',
      professionalName: existing?.professionalName ?? profile?.fullName ?? '',
      notes: existing?.notes ?? '',
      inv: { itemId: '', lotId: '', qty: '1' },
    };
  });
  const f = form.value;
  const [picker, setPicker] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const patient = tables.patients.get(f.patientId);
  const lw = patient ? latestWeight(tables, patient.id) : undefined;
  const weight = parseDecimal(f.weightKg);
  const locked = existing?.status === 'voided';
  const errors = {
    patient: !patient ? 'Elige el paciente' : null,
    product: !f.product.trim() ? 'Indica el producto' : null,
    date: !f.date ? 'Indica la fecha' : f.date > todayISO() ? 'La fecha no puede ser futura' : null,
    weight: f.weightKg && (weight === null || weight <= 0) ? 'Peso no válido' : null,
    next: f.nextDueDate && f.nextDueDate <= f.date ? 'Debe ser posterior a la fecha de aplicación' : null,
  };

  const save = async () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) {
      toast.error('Revisa los campos marcados.');
      return;
    }
    if (f.productExpiry && f.productExpiry < f.date) {
      const ok = await confirmDialog({ title: 'Producto vencido', message: 'La fecha de vencimiento del producto es anterior a la aplicación. ¿Guardar de todas formas?', confirmLabel: 'Guardar', tone: 'danger' });
      if (!ok) return;
    }
    const qty = parseDecimal(f.inv.qty);
    const data = {
      patientId: f.patientId,
      consultationId,
      date: f.date,
      kind: f.kind,
      product: f.product.trim(),
      activeIngredient: emptyToUndef(f.activeIngredient),
      weightKgUsed: weight ?? undefined,
      weightSource: weight ? f.weightSource : undefined,
      dose: emptyToUndef(f.dose),
      route: f.route || undefined,
      protocolApplied: emptyToUndef(f.protocolApplied),
      protocolId: f.protocolId || undefined,
      nextDueDate: emptyToUndef(f.nextDueDate),
      nextDueSource: f.nextDueDate ? f.nextDueSource : undefined,
      lotNumber: emptyToUndef(f.lotNumber),
      productExpiry: emptyToUndef(f.productExpiry),
      professionalName: f.professionalName.trim(),
      notes: emptyToUndef(f.notes),
    };
    setBusy(true);
    try {
      const b = batch();
      if (existing) b.update('dewormings', existing.id, (cur) => ({ ...cur, ...data }), { baseRev: existing.rev });
      else {
        const rec = b.insert('dewormings', { ...data, status: 'applied', inventoryItemId: f.inv.itemId || undefined, inventoryLotId: f.inv.lotId || undefined });
        if (f.inv.itemId && qty && qty > 0) {
          b.insert('inventoryMovements', { itemId: f.inv.itemId, lotId: f.inv.lotId || undefined, date: f.date, type: 'use', quantity: qty, patientId: f.patientId, consultationId, dewormingId: rec.id, notes: `Desparasitación: ${data.product}` });
        }
        // Si el peso se tomó hoy y no hay consulta, queda registrado en el historial de peso.
        if (weight && f.weightSource === 'measured_today' && !consultationId) b.insert('weights', { patientId: f.patientId, date: f.date, weightKg: weight, source: 'manual', notes: 'Registrado al desparasitar' });
      }
      await b.commit();
      await form.done();
      toast.success(existing ? 'Desparasitación actualizada' : 'Desparasitación registrada');
      navigate(consultationId ? `/consultas/${consultationId}` : `/pacientes/${f.patientId}?tab=preventivo`, { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const voidIt = async () => {
    if (!existing) return;
    const reason = await promptDialog({ title: 'Anular desparasitación', label: 'Motivo', confirmLabel: 'Anular' });
    if (!reason) return;
    try {
      await update('dewormings', existing.id, { status: 'voided', voidReason: reason }, { action: 'void', reason });
      toast.success('Registro anulado');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <>
      <PageHeader title={existing ? 'Desparasitación' : 'Registrar desparasitación'} back={patient ? `/pacientes/${patient.id}?tab=preventivo` : '/'} />
      <Page>
        {form.restorable && !existing && <DraftBanner at={form.restorable.at} onRestore={form.restore} onDiscard={form.discardDraft} />}
        {existing?.status === 'voided' && <Notice tone="danger">Registro anulado: {existing.voidReason}</Notice>}
        {prev && !existing && <Notice tone="info">Basado en la desparasitación del {formatDate(prev.date)}. Verifica producto, peso actual y dosis.</Notice>}
        <Section title="Paciente">
          <Card>
            <button type="button" onClick={() => setPicker(true)} disabled={!!existing || !!consultationId} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-sand-300 bg-white px-3 text-left disabled:bg-sand-50">
              <UserRound className="size-5 text-ink-400" />
              <span className="flex-1 font-semibold">{patient?.name ?? 'Elegir paciente'}</span>
              {consultationId && <Badge tone="brand">Desde consulta</Badge>}
            </button>
            {tried && errors.patient && <p className="mt-2 text-sm font-medium text-red-700">{errors.patient}</p>}
          </Card>
        </Section>
        <Section title="Producto y aplicación">
          <Card className="space-y-4">
            <Field label="Fecha" required error={tried ? errors.date : null}>
              <DateInput value={f.date} onChange={(v) => form.setField('date', v)} clearable={false} max={todayISO()} disabled={locked} />
            </Field>
            <Field label="Tipo">
              <Segmented name="Tipo de desparasitación" value={f.kind} onChange={(v) => form.setField('kind', v)} options={Object.entries(DEWORM_KIND).map(([k, v]) => ({ value: k as Deworming['kind'], label: v }))} />
            </Field>
            <Field label="Producto" required error={tried ? errors.product : null}>
              <TextInput value={f.product} onChange={(e) => form.setField('product', e.target.value)} list="dew-products" disabled={locked} />
              <datalist id="dew-products">
                {[...new Set([...tables.dewormings.values()].map((d) => d.product))].map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
            <Field label="Principio activo">
              <TextInput value={f.activeIngredient} onChange={(e) => form.setField('activeIngredient', e.target.value)} disabled={locked} />
            </Field>
            <Field
              label="Peso utilizado para la indicación"
              error={errors.weight}
              tag={<ProvenanceTag kind={f.weightSource === 'owner_reported' ? 'owner' : 'professional'} label={WEIGHT_SOURCE[f.weightSource]} />}
              hint={lw ? `Último registrado: ${formatDecimal(lw.weightKg)} kg (${formatDate(lw.date)})` : 'Sin pesos registrados'}
            >
              <DecimalInput value={f.weightKg} onChange={(v) => form.setField('weightKg', v)} unit="kg" disabled={locked} />
            </Field>
            <Segmented name="Origen del peso" size="sm" value={f.weightSource} onChange={(v) => form.setField('weightSource', v)} options={Object.entries(WEIGHT_SOURCE).map(([k, v]) => ({ value: k as FormState['weightSource'], label: v }))} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dosis">
                <TextInput value={f.dose} onChange={(e) => form.setField('dose', e.target.value)} placeholder="1 comprimido, 1 pipeta…" disabled={locked} />
              </Field>
              <Field label="Pauta aplicada">
                <TextInput value={f.protocolApplied} onChange={(e) => form.setField('protocolApplied', e.target.value)} placeholder="Ej.: dosis única" disabled={locked} />
              </Field>
            </div>
            <Field label="Vía">
              <Segmented name="Vía" size="sm" value={f.route || undefined} onChange={(v) => form.setField('route', v)} options={Object.entries(DEWORM_ROUTE).map(([k, v]) => ({ value: k as NonNullable<Deworming['route']>, label: v }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Lote">
                <TextInput value={f.lotNumber} onChange={(e) => form.setField('lotNumber', e.target.value)} disabled={locked} />
              </Field>
              <Field label="Vencimiento del producto">
                <DateInput value={f.productExpiry} onChange={(v) => form.setField('productExpiry', v)} disabled={locked} />
              </Field>
            </div>
            <ExpiryWarning productExpiry={f.productExpiry} applicationDate={f.date} />
            <Field label="Profesional responsable">
              <TextInput value={f.professionalName} onChange={(e) => form.setField('professionalName', e.target.value)} disabled={locked} />
            </Field>
            <Field label="Observaciones">
              <TextArea value={f.notes} onChange={(e) => form.setField('notes', e.target.value)} minRows={2} disabled={locked} />
            </Field>
          </Card>
        </Section>
        <Section title="Próximo control">
          <Card className="space-y-4">
            <ProtocolPicker
              kind={f.kind === 'external' ? 'deworming_external' : f.kind === 'internal' ? 'deworming_internal' : ['deworming_internal', 'deworming_external']}
              speciesId={patient?.speciesId}
              value={f.protocolId}
              baseDate={f.date}
              onChange={(pid, date) => form.set((p) => ({ ...p, protocolId: pid, ...(date ? { nextDueDate: date, nextDueSource: 'protocol' as const } : {}) }))}
            />
            <Field label="Fecha del próximo control" error={errors.next} hint={f.nextDueDate && f.nextDueSource === 'protocol' ? 'Sugerida por la pauta (editable).' : 'Déjala vacía si no corresponde.'}>
              <DateInput value={f.nextDueDate} onChange={(v) => form.set((p) => ({ ...p, nextDueDate: v, nextDueSource: 'manual' }))} disabled={locked} />
            </Field>
          </Card>
        </Section>
        {!existing && (
          <Section title="Inventario (opcional)">
            <Card>
              <InventoryPicker categories={['antiparasitic', 'medication']} value={f.inv} onChange={(v) => form.setField('inv', v)} onLotPicked={(lot) => form.set((p) => ({ ...p, lotNumber: lot.lotNumber ?? p.lotNumber, productExpiry: lot.expiryDate ?? p.productExpiry }))} />
            </Card>
          </Section>
        )}
        {existing && existing.status === 'applied' && (
          <Button variant="ghost" className="text-red-700" icon={<Ban className="size-4" />} onClick={voidIt}>
            Anular registro
          </Button>
        )}
      </Page>
      {!locked && (
        <StickyActions>
          <Button variant="secondary" onClick={async () => { await form.discardDraft(); await form.done(); navigate(-1); }}>
            Cancelar
          </Button>
          <Button block onClick={save} loading={busy} icon={<Bug className="size-4" />}>
            {existing ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </StickyActions>
      )}
      {picker && (
        <PatientPickerSheet
          onClose={() => setPicker(false)}
          onPick={(p) => {
            const w = latestWeight(tables, p.id);
            form.set((prev) => ({ ...prev, patientId: p.id, weightKg: w ? formatDecimal(w.weightKg) : '', weightSource: 'last_record' }));
            setPicker(false);
          }}
        />
      )}
    </>
  );
}
