import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ban, BookmarkPlus, Calculator, Copy, Pill, Plus, Scale, Trash2, TriangleAlert, UserRound } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Badge, Card, KeyValue, Notice, Section } from '@/components/Card';
import { DateInput, Field, ProvenanceTag, Switch, TextArea, TextInput } from '@/components/form';
import { DraftBanner } from '@/components/DraftBanner';
import { PatientPickerSheet } from '@/components/pickers';
import { PdfButton } from '@/components/PdfButton';
import { confirmDialog, promptDialog, toast } from '@/components/overlay';
import { useProfile, useTables } from '@/data/hooks';
import { batch, insert, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import type { Prescription, PrescriptionItem } from '@/data/schema';
import { SEX } from '@/data/labels';
import { ageText, formatDate, formatDateTime, todayISO } from '@/lib/dates';
import { formatDecimal } from '@/lib/numbers';
import { formatPhone } from '@/lib/phone';
import { addressText } from '@/lib/maps';
import { newId, nowISO } from '@/lib/ids';
import { emptyToUndef } from '@/lib/objects';
import { safeFileName } from '@/lib/share';
import { useFormDraft } from '@/lib/useFormDraft';
import { latestWeight, patientAlerts, primaryTutor, speciesName } from '@/features/patients/selectors';
import { AlertsPanel } from '@/features/patients/AlertsPanel';
import { pdf } from '@/pdf';
import { DoseCalculator } from './DoseCalculator';

type Item = PrescriptionItem;
interface FormState {
  patientId: string;
  consultationId?: string;
  date: string;
  items: Item[];
  generalInstructions: string;
  notes: string;
  origin?: string;
}

const emptyItem = (): Item => ({ id: newId(), medicationName: '', dose: '', antimicrobial: false, controlled: false });

export function PrescriptionPage() {
  const { id } = useParams();
  const tables = useTables();
  const r = id ? tables.prescriptions.get(id) : undefined;
  if (id && !r) {
    return (
      <>
        <PageHeader title="Receta" back="/" />
        <Page>
          <Notice tone="warning">No se encontró esta receta.</Notice>
        </Page>
      </>
    );
  }
  if (r && r.status !== 'draft') return <PrescriptionView r={r} />;
  return <PrescriptionEditor existing={r} />;
}

function PrescriptionEditor({ existing }: { existing?: Prescription }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tables = useTables();
  const profile = useProfile();
  const consultationId = existing?.consultationId ?? params.get('consultationId') ?? undefined;
  const consultation = consultationId ? tables.consultations.get(consultationId) : undefined;
  const fromRx = params.get('from') ? tables.prescriptions.get(params.get('from')!) : undefined;

  const form = useFormDraft<FormState>(`form:prescription:${existing?.id ?? `new:${consultationId ?? params.get('patientId') ?? ''}:${fromRx?.id ?? ''}`}`, () => {
    if (existing)
      return { patientId: existing.patientId, consultationId: existing.consultationId, date: existing.date, items: existing.items, generalInstructions: existing.generalInstructions ?? '', notes: existing.notes ?? '' };
    if (fromRx)
      return {
        patientId: fromRx.patientId,
        date: todayISO(),
        items: fromRx.items.map((i) => ({ ...i, id: newId(), calc: undefined })),
        generalInstructions: fromRx.generalInstructions ?? '',
        notes: '',
        origin: `Copiada de la receta del ${formatDate(fromRx.date)}. Revisa las dosis con el peso actual: los cálculos anteriores no se copiaron.`,
      };
    const items: Item[] = consultation
      ? [...tables.treatments.values()]
          .filter((t) => t.consultationId === consultation.id && t.kind === 'medication' && t.name.trim())
          .map((t) => ({
            id: newId(),
            medicationName: t.name,
            activeIngredient: t.activeIngredient,
            dose: t.dose ?? '',
            route: t.route,
            frequency: t.frequency,
            duration: t.durationDays ? `${t.durationDays} días` : undefined,
            instructions: t.instructions,
            antimicrobial: false,
            controlled: false,
            calc: t.doseCalc,
          }))
      : [];
    return {
      patientId: consultation?.patientId ?? params.get('patientId') ?? '',
      consultationId: consultation?.id,
      date: todayISO(),
      items: items.length ? items : [emptyItem()],
      generalInstructions: '',
      notes: '',
      origin: items.length ? 'Medicamentos traídos del plan de la consulta. Revisa cada indicación antes de emitir.' : undefined,
    };
  });
  const f = form.value;
  const [picker, setPicker] = useState(false);
  const [calcFor, setCalcFor] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const patient = tables.patients.get(f.patientId);
  const tutor = patient ? primaryTutor(tables, patient) : undefined;
  const lw = patient ? latestWeight(tables, patient.id) : undefined;
  const meds = useMemo(() => [...tables.medicationRefs.values()].filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name, 'es')), [tables]);

  const setItem = (i: number, p: Partial<Item>) => form.set((prev) => ({ ...prev, items: prev.items.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
  const pickMed = (i: number, name: string) => {
    const m = meds.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    setItem(i, {
      medicationName: name,
      ...(m
        ? {
            activeIngredient: m.activeIngredient ?? f.items[i].activeIngredient,
            concentration: m.concentrationValue ? `${formatDecimal(m.concentrationValue, 4)} ${m.concentrationUnit ?? ''}`.trim() : f.items[i].concentration,
            presentation: m.presentation ?? f.items[i].presentation,
            route: m.route ?? f.items[i].route,
            antimicrobial: m.antimicrobial,
            controlled: m.controlled,
          }
        : {}),
    });
  };

  const itemErrors = f.items.map((it) => ({ name: !it.medicationName.trim() ? 'Indica el medicamento' : null, dose: !it.dose.trim() ? 'Indica la dosis' : null }));
  const hasErrors = !patient || !tutor || f.items.length === 0 || itemErrors.some((e) => e.name || e.dose);

  const buildRecord = (status: 'draft' | 'issued') => {
    const p = patient!;
    const tt = tutor!;
    const wt = lw;
    return {
      patientId: p.id,
      tutorId: tt.id,
      consultationId: f.consultationId,
      date: f.date,
      status,
      issuedAt: status === 'issued' ? nowISO() : undefined,
      professional: {
        fullName: profile?.fullName ?? '',
        title: profile?.title ?? '',
        rut: profile?.rut,
        licenseNumber: profile?.licenseNumber,
        phone: profile?.phone,
        email: profile?.email,
        address: [profile?.address, profile?.comuna, profile?.city].filter(Boolean).join(', ') || undefined,
      },
      patientSnap: {
        name: p.name,
        species: speciesName(tables, p.speciesId),
        breed: p.breed,
        sex: SEX[p.sex],
        age: p.birthDate ? ageText(p.birthDate, f.date, p.birthDateEstimated) : undefined,
        weightKg: wt?.weightKg,
        weightDate: wt ? formatDate(wt.date) : undefined,
        microchip: p.microchip,
      },
      tutorSnap: { fullName: tt.fullName, rut: tt.rut, phone: tt.phone ? formatPhone(tt.phone) : undefined, address: addressText(tt.addresses.find((a) => a.primary) ?? tt.addresses[0]) || undefined },
      items: f.items.map((it) => ({
        ...it,
        medicationName: it.medicationName.trim(),
        dose: it.dose.trim(),
        activeIngredient: emptyToUndef(it.activeIngredient),
        concentration: emptyToUndef(it.concentration),
        presentation: emptyToUndef(it.presentation),
        route: emptyToUndef(it.route),
        frequency: emptyToUndef(it.frequency),
        duration: emptyToUndef(it.duration),
        totalQuantity: emptyToUndef(it.totalQuantity),
        instructions: emptyToUndef(it.instructions),
        warnings: emptyToUndef(it.warnings),
        sagNumber: it.antimicrobial ? emptyToUndef(it.sagNumber) : undefined,
      })),
      generalInstructions: emptyToUndef(f.generalInstructions),
      notes: emptyToUndef(f.notes),
    };
  };

  const persist = async (status: 'draft' | 'issued') => {
    setTried(true);
    if (hasErrors) {
      toast.error(!patient ? 'Elige el paciente.' : !tutor ? 'El paciente no tiene tutor.' : 'Revisa los medicamentos: cada uno necesita nombre y dosis.');
      return;
    }
    if (status === 'issued') {
      const warnings: string[] = [];
      if (!profile?.fullName) warnings.push('Tu perfil no tiene nombre profesional.');
      if (!profile?.rut) warnings.push('Tu perfil no tiene RUT.');
      if (!profile?.signatureAttachmentId) warnings.push('No has configurado una imagen de firma (podrás firmar a mano el documento impreso).');
      if (f.items.some((i) => i.antimicrobial && !i.sagNumber?.trim())) warnings.push('Hay antimicrobianos sin número de receta electrónica SAG.');
      if (f.items.some((i) => i.controlled)) warnings.push('Hay productos controlados: requieren receta retenida en el formato oficial; este PDF no la reemplaza.');
      const ok = await confirmDialog({
        title: 'Emitir receta',
        message: (
          <>
            <p>Una vez emitida no podrá modificarse; si necesitas cambios, deberás anularla y emitir una nueva.</p>
            {warnings.length > 0 && (
              <ul className="list-disc pl-5 text-amber-900">
                {warnings.map((wn, i) => (
                  <li key={i}>{wn}</li>
                ))}
              </ul>
            )}
          </>
        ),
        confirmLabel: 'Emitir',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const data = buildRecord(status);
      let recId = existing?.id;
      const b = batch();
      if (existing) b.update('prescriptions', existing.id, (cur) => ({ ...cur, ...data }), { action: status === 'issued' ? 'finalize' : 'update', summary: status === 'issued' ? 'Receta emitida' : undefined });
      else recId = b.insert('prescriptions', data, { summary: status === 'issued' ? 'Receta emitida' : 'Borrador de receta' }).id;
      await b.commit();
      await form.done();
      toast.success(status === 'issued' ? 'Receta emitida' : 'Borrador guardado');
      navigate(`/recetas/${recId}`, { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveRef = async (it: Item) => {
    if (!it.medicationName.trim()) return;
    if (meds.some((m) => m.name.toLowerCase() === it.medicationName.trim().toLowerCase())) {
      toast.info('Ya está en tus medicamentos frecuentes.');
      return;
    }
    try {
      await insert('medicationRefs', {
        name: it.medicationName.trim(),
        activeIngredient: emptyToUndef(it.activeIngredient),
        presentation: emptyToUndef(it.presentation),
        route: emptyToUndef(it.route),
        notes: it.concentration ? `Concentración: ${it.concentration}` : undefined,
        antimicrobial: it.antimicrobial,
        controlled: it.controlled,
        active: true,
      });
      toast.success('Guardado en medicamentos frecuentes (sin dosis). Completa la concentración en Ajustes si la necesitas para calcular.');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const weights = [...(lw ? [{ label: 'Último peso registrado', kg: lw.weightKg, date: lw.date }] : [])];
  if (consultation?.exam.weightKg && consultation.exam.weightKg !== lw?.weightKg) weights.unshift({ label: 'Peso de la consulta', kg: consultation.exam.weightKg, date: consultation.startedAt.slice(0, 10) });

  return (
    <>
      <PageHeader title={existing ? 'Receta (borrador)' : 'Nueva receta'} back={patient ? `/pacientes/${patient.id}?tab=recetas` : '/'} />
      <Page>
        {form.restorable && <DraftBanner at={form.restorable.at} onRestore={form.restore} onDiscard={form.discardDraft} />}
        <Notice tone="warning" icon={<TriangleAlert className="size-5" />}>
          La app no sugiere medicamentos ni dosis. Revisa los requisitos según el producto: los <strong>antimicrobianos</strong> requieren la receta electrónica del SAG y los
          productos con <strong>receta retenida</strong> requieren el formato oficial (manuscrito). Este documento no reemplaza esos formatos.
        </Notice>
        {f.origin && <Notice tone="info">{f.origin}</Notice>}
        <Section title="Paciente">
          <Card className="space-y-3">
            <button type="button" onClick={() => setPicker(true)} disabled={!!consultation || !!existing} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-sand-300 bg-white px-3 text-left disabled:bg-sand-50">
              <UserRound className="size-5 text-ink-400" />
              <span className="flex-1 font-semibold">{patient ? `${patient.name} · ${tutor?.fullName ?? 'sin tutor'}` : 'Elegir paciente'}</span>
            </button>
            {tried && !patient && <p className="text-sm font-medium text-red-700">Elige el paciente.</p>}
            {patient && (
              <p className="flex items-center gap-1.5 text-sm text-ink-600">
                <Scale className="size-4" /> {lw ? `Último peso: ${formatDecimal(lw.weightKg)} kg (${formatDate(lw.date)})` : 'Sin peso registrado'}
              </p>
            )}
            <Field label="Fecha de emisión">
              <DateInput value={f.date} onChange={(v) => form.setField('date', v)} clearable={false} max={todayISO()} />
            </Field>
          </Card>
        </Section>
        {patient && <AlertsPanel alerts={patientAlerts(patient, tables)} compact />}

        <Section
          title="Medicamentos"
          action={
            <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => form.set((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }))}>
              Agregar
            </Button>
          }
        >
          <datalist id="med-refs">
            {meds.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
          {f.items.map((it, i) => (
            <Card key={it.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-600">
                  <Pill className="size-4" /> Medicamento {i + 1}
                </p>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={<BookmarkPlus className="size-4" />} onClick={() => saveRef(it)} aria-label="Guardar como frecuente" />
                  {f.items.length > 1 && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4 text-red-700" />} aria-label="Quitar medicamento" onClick={() => form.set((prev) => ({ ...prev, items: prev.items.filter((_, j) => j !== i) }))} />}
                </div>
              </div>
              <Field label="Medicamento" required error={tried ? itemErrors[i].name : null}>
                <TextInput value={it.medicationName} list="med-refs" onChange={(e) => pickMed(i, e.target.value)} autoCapitalize="sentences" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Principio activo">
                  <TextInput value={it.activeIngredient ?? ''} onChange={(e) => setItem(i, { activeIngredient: e.target.value })} />
                </Field>
                <Field label="Concentración">
                  <TextInput value={it.concentration ?? ''} onChange={(e) => setItem(i, { concentration: e.target.value })} placeholder="50 mg/mL" />
                </Field>
              </div>
              <Field label="Presentación">
                <TextInput value={it.presentation ?? ''} onChange={(e) => setItem(i, { presentation: e.target.value })} placeholder="Frasco 30 mL, comprimidos 50 mg…" />
              </Field>
              <Field label="Dosis indicada" required error={tried ? itemErrors[i].dose : null} tag={it.calc ? <ProvenanceTag kind="calculated" label="Calculada · revisada" /> : undefined}>
                <div className="flex gap-2">
                  <TextInput value={it.dose} onChange={(e) => setItem(i, { dose: e.target.value, calc: undefined })} placeholder="Ej.: 1/2 comprimido" />
                  <Button variant="secondary" size="sm" className="shrink-0" icon={<Calculator className="size-4" />} onClick={() => setCalcFor(i)} disabled={!patient}>
                    Calcular
                  </Button>
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vía">
                  <TextInput value={it.route ?? ''} onChange={(e) => setItem(i, { route: e.target.value })} list="routes-rx" placeholder="Oral" />
                </Field>
                <Field label="Frecuencia">
                  <TextInput value={it.frequency ?? ''} onChange={(e) => setItem(i, { frequency: e.target.value })} placeholder="Cada 12 horas" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Duración">
                  <TextInput value={it.duration ?? ''} onChange={(e) => setItem(i, { duration: e.target.value })} placeholder="7 días" />
                </Field>
                <Field label="Cantidad total">
                  <TextInput value={it.totalQuantity ?? ''} onChange={(e) => setItem(i, { totalQuantity: e.target.value })} placeholder="1 frasco" />
                </Field>
              </div>
              <Field label="Instrucciones particulares">
                <TextArea value={it.instructions ?? ''} onChange={(e) => setItem(i, { instructions: e.target.value })} minRows={2} />
              </Field>
              <Field label="Advertencias y observaciones">
                <TextArea value={it.warnings ?? ''} onChange={(e) => setItem(i, { warnings: e.target.value })} minRows={1} />
              </Field>
              <div className="rounded-xl bg-sand-100 px-3">
                <Switch checked={it.antimicrobial} onChange={(v) => setItem(i, { antimicrobial: v })} label="Es antimicrobiano" description="Requiere receta electrónica del SAG." />
                {it.antimicrobial && (
                  <Field label="N.º de receta electrónica SAG" className="pb-3">
                    <TextInput value={it.sagNumber ?? ''} onChange={(e) => setItem(i, { sagNumber: e.target.value })} inputMode="numeric" />
                  </Field>
                )}
                <Switch checked={it.controlled} onChange={(v) => setItem(i, { controlled: v })} label="Producto controlado / receta retenida" description="Este PDF no reemplaza la receta oficial." />
              </div>
              {it.calc && (
                <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
                  <p className="font-semibold">Cálculo revisado el {formatDateTime(it.calc.reviewedAt)}</p>
                  <ol className="list-decimal pl-4">
                    {it.calc.steps.map((s, k) => (
                      <li key={k}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
            </Card>
          ))}
          <datalist id="routes-rx">
            {['Oral', 'Subcutánea (SC)', 'Intramuscular (IM)', 'Tópica', 'Oftálmica', 'Ótica', 'Transdérmica'].map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Section>

        <Section title="Indicaciones generales y observaciones">
          <Card className="space-y-4">
            <Field label="Indicaciones generales">
              <TextArea value={f.generalInstructions} onChange={(e) => form.setField('generalInstructions', e.target.value)} />
            </Field>
            <Field label="Observaciones">
              <TextArea value={f.notes} onChange={(e) => form.setField('notes', e.target.value)} />
            </Field>
          </Card>
        </Section>
      </Page>
      <StickyActions>
        <Button variant="secondary" onClick={() => persist('draft')} loading={busy}>
          Guardar borrador
        </Button>
        <Button block onClick={() => persist('issued')} loading={busy}>
          Emitir receta
        </Button>
      </StickyActions>
      {picker && (
        <PatientPickerSheet
          onClose={() => setPicker(false)}
          onPick={(p) => {
            form.setField('patientId', p.id);
            setPicker(false);
          }}
        />
      )}
      {calcFor !== null && f.items[calcFor] && (
        <DoseCalculator
          weights={weights}
          medicationName={f.items[calcFor].medicationName}
          med={meds.find((m) => m.name.toLowerCase() === f.items[calcFor].medicationName.trim().toLowerCase())}
          onClose={() => setCalcFor(null)}
          onApply={(res) => {
            setItem(calcFor, {
              dose: res.doseText,
              frequency: res.frequencyText ?? f.items[calcFor].frequency,
              duration: res.durationText ?? f.items[calcFor].duration,
              totalQuantity: res.totalText ?? f.items[calcFor].totalQuantity,
              concentration: f.items[calcFor].concentration || res.concentrationText,
              calc: res.calc,
            });
            setCalcFor(null);
            toast.success('Cálculo incorporado a la receta. Revísalo antes de emitir.');
          }}
        />
      )}
    </>
  );
}

function PrescriptionView({ r }: { r: Prescription }) {
  const tables = useTables();
  const navigate = useNavigate();
  const patient = tables.patients.get(r.patientId);
  const voidIt = async () => {
    const reason = await promptDialog({ title: 'Anular receta', label: 'Motivo de la anulación', multiline: true, confirmLabel: 'Anular' });
    if (!reason) return;
    try {
      await update('prescriptions', r.id, { status: 'voided', voidReason: reason }, { action: 'void', reason });
      toast.success('Receta anulada');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  return (
    <>
      <PageHeader title="Receta" subtitle={formatDate(r.date)} back={patient ? `/pacientes/${patient.id}?tab=recetas` : '/'} />
      <Page>
        <div className="flex items-center gap-2">
          <Badge tone={r.status === 'issued' ? 'success' : 'danger'}>{r.status === 'issued' ? 'Emitida' : 'Anulada'}</Badge>
          {r.issuedAt && <span className="text-sm text-ink-500">Emitida el {formatDateTime(r.issuedAt)}</span>}
        </div>
        {r.status === 'voided' && <Notice tone="danger">Anulada: {r.voidReason}</Notice>}
        <PdfButton make={() => pdf.prescription(r.id)} fileName={`receta-${safeFileName(r.patientSnap.name)}-${r.date}.pdf`} label="Ver / compartir PDF" variant="primary" block size="lg" />
        <Card>
          <dl className="divide-y divide-sand-100">
            <KeyValue label="Paciente" value={<Link to={`/pacientes/${r.patientId}`} className="font-semibold text-brand-700">{r.patientSnap.name}</Link>} />
            <KeyValue label="Especie" value={[r.patientSnap.species, r.patientSnap.breed].filter(Boolean).join(' · ')} />
            <KeyValue label="Peso" value={r.patientSnap.weightKg !== undefined ? `${formatDecimal(r.patientSnap.weightKg)} kg (${r.patientSnap.weightDate})` : undefined} />
            <KeyValue label="Tutor/a" value={r.tutorSnap.fullName} />
            <KeyValue label="Profesional" value={r.professional.fullName} />
          </dl>
        </Card>
        {r.items.map((it, i) => (
          <Card key={it.id} className="space-y-1">
            <p className="font-semibold">
              {i + 1}. {it.medicationName} {it.concentration}
            </p>
            <dl className="divide-y divide-sand-100">
              <KeyValue label="Principio activo" value={it.activeIngredient} />
              <KeyValue label="Presentación" value={it.presentation} />
              <KeyValue label="Dosis" value={it.dose} />
              <KeyValue label="Vía" value={it.route} />
              <KeyValue label="Frecuencia" value={it.frequency} />
              <KeyValue label="Duración" value={it.duration} />
              <KeyValue label="Cantidad total" value={it.totalQuantity} />
              <KeyValue label="Instrucciones" value={it.instructions} />
              <KeyValue label="Advertencias" value={it.warnings} />
            </dl>
            <div className="flex flex-wrap gap-1">
              {it.calc && <ProvenanceTag kind="calculated" label="Dosis calculada · revisada" />}
              {it.antimicrobial && <Badge tone="warning">Antimicrobiano{it.sagNumber ? ` · SAG ${it.sagNumber}` : ' · sin N.º SAG'}</Badge>}
              {it.controlled && <Badge tone="danger">Controlado</Badge>}
            </div>
          </Card>
        ))}
        {(r.generalInstructions || r.notes) && (
          <Card>
            <dl>
              <KeyValue label="Indicaciones" value={r.generalInstructions} />
              <KeyValue label="Observaciones" value={r.notes} />
            </dl>
          </Card>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => navigate(`/recetas/nueva?from=${r.id}`)}>
            Usar como base
          </Button>
          {r.status === 'issued' && (
            <Button variant="secondary" className="text-red-700" icon={<Ban className="size-4" />} onClick={voidIt}>
              Anular
            </Button>
          )}
        </div>
      </Page>
    </>
  );
}
