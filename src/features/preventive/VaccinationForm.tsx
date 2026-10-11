import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ban, Syringe, UserRound } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Badge, Card, Notice, Section } from '@/components/Card';
import { DateInput, Field, Segmented, TextArea, TextInput } from '@/components/form';
import { DraftBanner } from '@/components/DraftBanner';
import { PatientPickerSheet } from '@/components/pickers';
import { confirmDialog, promptDialog, toast } from '@/components/overlay';
import { useProfile, useTables } from '@/data/hooks';
import { batch, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { VACCINE_ROUTE } from '@/data/labels';
import type { Vaccination } from '@/data/schema';
import { formatDate, todayISO } from '@/lib/dates';
import { parseDecimal } from '@/lib/numbers';
import { emptyToUndef } from '@/lib/objects';
import { useFormDraft } from '@/lib/useFormDraft';
import { AlertsPanel } from '@/features/patients/AlertsPanel';
import { patientAlerts } from '@/features/patients/selectors';
import { ExpiryWarning, InventoryPicker, ProtocolPicker, type InventoryChoice } from './common';

const SUGGESTED = {
  dog: ['Séxtuple canina', 'Óctuple canina', 'Antirrábica', 'Tos de las perreras (Bordetella)', 'Leptospirosis'],
  cat: ['Triple felina', 'Leucemia felina (FeLV)', 'Antirrábica'],
} as const;

interface FormState {
  patientId: string;
  date: string;
  vaccineName: string;
  vaccineType: string;
  manufacturer: string;
  lotNumber: string;
  productExpiry: string;
  dose: string;
  route: Vaccination['route'] | '';
  site: string;
  professionalName: string;
  notes: string;
  nextDueDate: string;
  nextDueSource: 'manual' | 'protocol';
  protocolId: string;
  inv: InventoryChoice;
}

export function VaccinationForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tables = useTables();
  const profile = useProfile();
  const existing = id ? tables.vaccinations.get(id) : undefined;
  const prev = params.get('from') ? tables.vaccinations.get(params.get('from')!) : undefined;
  const consultationId = existing?.consultationId ?? params.get('consultationId') ?? undefined;

  const form = useFormDraft<FormState>(`form:vaccination:${id ?? `new:${params.get('patientId') ?? ''}:${consultationId ?? ''}`}`, () => ({
    patientId: existing?.patientId ?? prev?.patientId ?? params.get('patientId') ?? '',
    date: existing?.date ?? todayISO(),
    vaccineName: existing?.vaccineName ?? prev?.vaccineName ?? '',
    vaccineType: existing?.vaccineType ?? prev?.vaccineType ?? '',
    manufacturer: existing?.manufacturer ?? prev?.manufacturer ?? '',
    lotNumber: existing?.lotNumber ?? '',
    productExpiry: existing?.productExpiry ?? '',
    dose: existing?.dose ?? '',
    route: existing?.route ?? prev?.route ?? '',
    site: existing?.site ?? '',
    professionalName: existing?.professionalName ?? profile?.fullName ?? '',
    notes: existing?.notes ?? '',
    nextDueDate: existing?.nextDueDate ?? '',
    nextDueSource: existing?.nextDueSource ?? 'manual',
    protocolId: existing?.protocolId ?? '',
    inv: { itemId: '', lotId: '', qty: '1' },
  }));
  const f = form.value;
  const [picker, setPicker] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const patient = tables.patients.get(f.patientId);
  const species = patient ? tables.species.get(patient.speciesId) : undefined;
  const suggestions = [...new Set([...(species?.builtin ? SUGGESTED[species.builtin] : []), ...[...tables.vaccinations.values()].map((v) => v.vaccineName)])];
  const locked = existing?.status === 'voided';

  const errors = {
    patient: !patient ? 'Elige el paciente' : null,
    name: !f.vaccineName.trim() ? 'Indica la vacuna' : null,
    date: !f.date ? 'Indica la fecha' : f.date > todayISO() ? 'La fecha de aplicación no puede ser futura' : null,
    next: f.nextDueDate && f.nextDueDate <= f.date ? 'La próxima dosis debe ser posterior a la aplicación' : null,
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
    if (f.inv.itemId && (qty === null || qty <= 0)) {
      toast.error('Indica una cantidad válida para el inventario.');
      return;
    }
    const data = {
      patientId: f.patientId,
      consultationId,
      date: f.date,
      vaccineName: f.vaccineName.trim(),
      vaccineType: emptyToUndef(f.vaccineType),
      manufacturer: emptyToUndef(f.manufacturer),
      lotNumber: emptyToUndef(f.lotNumber),
      productExpiry: emptyToUndef(f.productExpiry),
      dose: emptyToUndef(f.dose),
      route: f.route || undefined,
      site: emptyToUndef(f.site),
      professionalName: f.professionalName.trim(),
      notes: emptyToUndef(f.notes),
      nextDueDate: emptyToUndef(f.nextDueDate),
      nextDueSource: f.nextDueDate ? f.nextDueSource : undefined,
      protocolId: f.protocolId || undefined,
    };
    setBusy(true);
    try {
      const b = batch();
      let recId = existing?.id;
      if (existing) b.update('vaccinations', existing.id, (cur) => ({ ...cur, ...data }), { baseRev: existing.rev });
      else {
        const rec = b.insert('vaccinations', { ...data, status: 'applied', inventoryItemId: f.inv.itemId || undefined, inventoryLotId: f.inv.lotId || undefined });
        recId = rec.id;
        if (f.inv.itemId && qty) {
          b.insert('inventoryMovements', {
            itemId: f.inv.itemId,
            lotId: f.inv.lotId || undefined,
            date: f.date,
            type: 'use',
            quantity: qty,
            patientId: f.patientId,
            consultationId,
            vaccinationId: rec.id,
            notes: `Vacuna aplicada: ${data.vaccineName}`,
          });
        }
      }
      await b.commit();
      await form.done();
      toast.success(existing ? 'Vacunación actualizada' : 'Vacuna registrada');
      navigate(consultationId ? `/consultas/${consultationId}` : `/pacientes/${f.patientId}?tab=preventivo`, { replace: true });
      void recId;
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const voidIt = async () => {
    if (!existing) return;
    const reason = await promptDialog({ title: 'Anular registro de vacuna', label: 'Motivo', confirmLabel: 'Anular' });
    if (!reason) return;
    try {
      await update('vaccinations', existing.id, { status: 'voided', voidReason: reason }, { action: 'void', reason });
      toast.success('Registro anulado');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <>
      <PageHeader title={existing ? 'Vacunación' : 'Registrar vacuna'} back={patient ? `/pacientes/${patient.id}?tab=preventivo` : '/'} />
      <Page>
        {form.restorable && !existing && <DraftBanner at={form.restorable.at} onRestore={form.restore} onDiscard={form.discardDraft} />}
        {existing?.status === 'voided' && <Notice tone="danger">Registro anulado: {existing.voidReason}</Notice>}
        {prev && !existing && <Notice tone="info">Basado en la vacuna anterior del {formatDate(prev.date)}. Se copiaron el nombre, tipo y laboratorio; registra lote y vencimiento del envase actual.</Notice>}
        <Section title="Paciente">
          <Card className="space-y-3">
            <button type="button" onClick={() => setPicker(true)} disabled={!!existing || !!consultationId} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-sand-300 bg-white px-3 text-left disabled:bg-sand-50">
              <UserRound className="size-5 text-ink-400" />
              <span className="flex-1 font-semibold">{patient?.name ?? 'Elegir paciente'}</span>
              {consultationId && <Badge tone="brand">Desde consulta</Badge>}
            </button>
            {tried && errors.patient && <p className="text-sm font-medium text-red-700">{errors.patient}</p>}
          </Card>
        </Section>
        {patient && <AlertsPanel alerts={patientAlerts(patient, tables)} compact />}
        <Section title="Vacuna aplicada">
          <Card className="space-y-4">
            <Field label="Fecha de aplicación" required error={tried ? errors.date : null}>
              <DateInput value={f.date} onChange={(v) => form.setField('date', v)} clearable={false} max={todayISO()} disabled={locked} />
            </Field>
            <Field label="Vacuna" required error={tried ? errors.name : null}>
              <TextInput value={f.vaccineName} onChange={(e) => form.setField('vaccineName', e.target.value)} list="vac-names" disabled={locked} />
              <datalist id="vac-names">
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo">
                <TextInput value={f.vaccineType} onChange={(e) => form.setField('vaccineType', e.target.value)} placeholder="Polivalente, antirrábica…" disabled={locked} />
              </Field>
              <Field label="Fabricante / laboratorio">
                <TextInput value={f.manufacturer} onChange={(e) => form.setField('manufacturer', e.target.value)} disabled={locked} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="N.º de lote">
                <TextInput value={f.lotNumber} onChange={(e) => form.setField('lotNumber', e.target.value)} autoCapitalize="characters" disabled={locked} />
              </Field>
              <Field label="Vencimiento del producto" hint="Fecha del envase, no la próxima dosis.">
                <DateInput value={f.productExpiry} onChange={(v) => form.setField('productExpiry', v)} disabled={locked} />
              </Field>
            </div>
            <ExpiryWarning productExpiry={f.productExpiry} applicationDate={f.date} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dosis administrada">
                <TextInput value={f.dose} onChange={(e) => form.setField('dose', e.target.value)} placeholder="1 mL" disabled={locked} />
              </Field>
              <Field label="Lugar de aplicación">
                <TextInput value={f.site} onChange={(e) => form.setField('site', e.target.value)} placeholder="Subcutánea interescapular…" disabled={locked} />
              </Field>
            </div>
            <Field label="Vía">
              <Segmented name="Vía" size="sm" value={f.route || undefined} onChange={(v) => form.setField('route', v)} options={Object.entries(VACCINE_ROUTE).map(([k, v]) => ({ value: k as NonNullable<Vaccination['route']>, label: v }))} />
            </Field>
            <Field label="Profesional responsable">
              <TextInput value={f.professionalName} onChange={(e) => form.setField('professionalName', e.target.value)} disabled={locked} />
            </Field>
            <Field label="Observaciones">
              <TextArea value={f.notes} onChange={(e) => form.setField('notes', e.target.value)} minRows={2} disabled={locked} />
            </Field>
          </Card>
        </Section>
        <Section title="Próxima dosis o refuerzo">
          <Card className="space-y-4">
            <ProtocolPicker
              kind="vaccine"
              speciesId={patient?.speciesId}
              value={f.protocolId}
              baseDate={f.date}
              onChange={(pid, date) => form.set((prev) => ({ ...prev, protocolId: pid, ...(date ? { nextDueDate: date, nextDueSource: 'protocol' as const } : {}) }))}
            />
            <Field label="Fecha de la próxima dosis" error={errors.next} hint={f.nextDueDate && f.nextDueSource === 'protocol' ? 'Sugerida por la pauta (editable).' : 'Déjala vacía si no corresponde.'}>
              <DateInput value={f.nextDueDate} onChange={(v) => form.set((prev) => ({ ...prev, nextDueDate: v, nextDueSource: 'manual' }))} disabled={locked} />
            </Field>
          </Card>
        </Section>
        {!existing && (
          <Section title="Inventario (opcional)">
            <Card>
              <InventoryPicker
                categories={['vaccine']}
                value={f.inv}
                onChange={(v) => form.setField('inv', v)}
                onLotPicked={(lot) => form.set((prev) => ({ ...prev, lotNumber: lot.lotNumber ?? prev.lotNumber, productExpiry: lot.expiryDate ?? prev.productExpiry }))}
              />
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
          <Button block onClick={save} loading={busy} icon={<Syringe className="size-4" />}>
            {existing ? 'Guardar cambios' : 'Registrar vacuna'}
          </Button>
        </StickyActions>
      )}
      {picker && (
        <PatientPickerSheet
          onClose={() => setPicker(false)}
          onPick={(p) => {
            form.setField('patientId', p.id);
            setPicker(false);
          }}
        />
      )}
    </>
  );
}
