import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Camera, Plus, Star, Trash2, UserRound } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice, Section } from '@/components/Card';
import { DateInput, DecimalInput, Field, IntegerInput, Segmented, Select, TextArea, TextInput } from '@/components/form';
import { DraftBanner } from '@/components/DraftBanner';
import { TutorPickerSheet } from '@/components/pickers';
import { confirmDialog, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { batch, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import type { Patient } from '@/data/schema';
import { ageText, birthDateFromAge, todayISO } from '@/lib/dates';
import { formatDecimal, parseDecimal } from '@/lib/numbers';
import { emptyToUndef } from '@/lib/objects';
import { similarity } from '@/lib/text';
import { useFormDraft } from '@/lib/useFormDraft';
import { saveAttachment } from '@/features/attachments/attachments';
import { latestWeight } from './selectors';

interface FormState {
  tutors: Array<{ tutorId: string; role: 'primary' | 'secondary' }>;
  name: string;
  speciesId: string;
  breed: string;
  sex: 'male' | 'female' | 'unknown';
  reproductiveStatus: 'intact' | 'neutered' | 'unknown';
  ageMode: 'date' | 'estimate' | 'unknown';
  birthDate: string;
  ageYears: string;
  ageMonths: string;
  color: string;
  markings: string;
  microchip: string;
  weightKg: string;
  status: 'active' | 'inactive' | 'deceased';
  deceasedDate: string;
  extra: Record<string, string | boolean>;
  notes: string;
}

function fromPatient(p: Patient | undefined, tutorId: string | null, dogId: string, weight?: number): FormState {
  return {
    tutors: p?.tutors ?? (tutorId ? [{ tutorId, role: 'primary' }] : []),
    name: p?.name ?? '',
    speciesId: p?.speciesId ?? dogId,
    breed: p?.breed ?? '',
    sex: p?.sex ?? 'unknown',
    reproductiveStatus: p?.reproductiveStatus ?? 'unknown',
    ageMode: p?.birthDate ? (p.birthDateEstimated ? 'estimate' : 'date') : p ? 'unknown' : 'date',
    birthDate: p?.birthDate && !p.birthDateEstimated ? p.birthDate : '',
    ageYears: '',
    ageMonths: '',
    color: p?.color ?? '',
    markings: p?.markings ?? '',
    microchip: p?.microchip ?? '',
    weightKg: weight !== undefined ? formatDecimal(weight) : '',
    status: p?.status ?? 'active',
    deceasedDate: p?.deceasedDate ?? '',
    extra: (p?.extra as Record<string, string | boolean>) ?? {},
    notes: p?.notes ?? '',
  };
}

export function PatientForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tables = useTables();
  const existing = id ? tables.patients.get(id) : undefined;
  const dogId = [...tables.species.values()].find((s) => s.builtin === 'dog')?.id ?? [...tables.species.values()][0]?.id ?? '';
  const lw = existing ? latestWeight(tables, existing.id) : undefined;
  const form = useFormDraft<FormState>(`form:patient:${id ?? 'new'}:${params.get('tutorId') ?? ''}`, () => fromPatient(existing, params.get('tutorId'), dogId, lw?.weightKg));
  const f = form.value;
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const species = tables.species.get(f.speciesId);
  const speciesList = [...tables.species.values()].filter((s) => s.active || s.id === f.speciesId).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const breeds = useMemo(
    () => [...new Set([...tables.patients.values()].filter((p) => p.speciesId === f.speciesId && p.breed).map((p) => p.breed!))].sort(),
    [tables, f.speciesId],
  );

  const weight = parseDecimal(f.weightKg);
  const years = f.ageYears ? Number(f.ageYears) : 0;
  const months = f.ageMonths ? Number(f.ageMonths) : 0;
  const errors = {
    tutors: f.tutors.length === 0 ? 'Asocia al menos un tutor' : null,
    name: !f.name.trim() ? 'Ingresa el nombre del paciente' : null,
    speciesId: !f.speciesId ? 'Selecciona la especie' : null,
    birthDate: f.ageMode === 'date' && f.birthDate && f.birthDate > todayISO() ? 'La fecha no puede ser futura' : null,
    age: f.ageMode === 'estimate' && !existing && years === 0 && months === 0 ? 'Indica la edad estimada (años y/o meses)' : f.ageMode === 'estimate' && months > 11 ? 'Los meses deben ser entre 0 y 11' : null,
    weight: f.weightKg && (weight === null || weight <= 0) ? 'Peso no válido (ej.: 12,4)' : null,
    microchip: f.microchip && !/^[0-9A-Za-z]{6,20}$/.test(f.microchip.replace(/\s/g, '')) ? 'El microchip debe tener entre 6 y 20 caracteres alfanuméricos' : null,
    deceasedDate: f.status === 'deceased' && f.deceasedDate && f.deceasedDate > todayISO() ? 'La fecha no puede ser futura' : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const microchipWarn = f.microchip && /^\d+$/.test(f.microchip.replace(/\s/g, '')) && f.microchip.replace(/\s/g, '').length !== 15 ? 'Los microchips ISO suelen tener 15 dígitos. Verifica el número.' : null;

  const possibleDup = useMemo(() => {
    if (existing || !f.name.trim()) return [];
    return [...tables.patients.values()].filter(
      (p) => p.speciesId === f.speciesId && p.tutors.some((x) => f.tutors.some((y) => y.tutorId === x.tutorId)) && similarity(p.name, f.name) >= 0.85,
    );
  }, [tables, f.name, f.speciesId, f.tutors, existing]);

  const save = async () => {
    setTried(true);
    if (hasErrors) {
      toast.error('Revisa los campos marcados.');
      return;
    }
    if (possibleDup.length) {
      const ok = await confirmDialog({
        title: 'Posible paciente duplicado',
        message: `Este tutor ya tiene un paciente llamado “${possibleDup[0].name}” de la misma especie. ¿Registrar otro de todas formas?`,
        confirmLabel: 'Registrar igualmente',
      });
      if (!ok) return;
    }
    let birthDate: string | undefined;
    let birthDateEstimated = false;
    if (f.ageMode === 'date') birthDate = emptyToUndef(f.birthDate);
    else if (f.ageMode === 'estimate') {
      if (years || months) {
        birthDate = birthDateFromAge(years, months);
        birthDateEstimated = true;
      } else if (existing?.birthDateEstimated) {
        birthDate = existing.birthDate;
        birthDateEstimated = true;
      }
    }
    const extra: Record<string, string | boolean> = {};
    for (const ef of species?.extraFields ?? []) {
      const v = f.extra[ef.key];
      if (v !== undefined && v !== '') extra[ef.key] = v;
    }
    const data = {
      name: f.name.trim(),
      speciesId: f.speciesId,
      breed: emptyToUndef(f.breed),
      sex: f.sex,
      reproductiveStatus: f.reproductiveStatus,
      birthDate,
      birthDateEstimated,
      color: emptyToUndef(f.color),
      markings: emptyToUndef(f.markings),
      microchip: emptyToUndef(f.microchip.replace(/\s/g, '')),
      tutors: f.tutors,
      status: f.status,
      deceasedDate: f.status === 'deceased' ? emptyToUndef(f.deceasedDate) : undefined,
      extra,
      notes: emptyToUndef(f.notes),
    };
    setSaving(true);
    try {
      const b = batch();
      const rec = existing
        ? b.update('patients', existing.id, (cur) => ({ ...cur, ...data }), { baseRev: existing.rev })
        : b.insert('patients', { ...data, background: {}, allergies: [], adverseReactions: [], conditions: [], currentMedications: [], alerts: [] });
      if (weight !== null && weight > 0 && weight !== lw?.weightKg) {
        b.insert('weights', { patientId: rec.id, date: todayISO(), weightKg: weight, source: 'manual' });
      }
      await b.commit();
      if (photo) {
        try {
          const att = await saveAttachment({ file: photo, ownerKind: 'patient', kind: 'photo', patientId: rec.id, caption: 'Foto de perfil' }, { maxDim: 1200 });
          await update('patients', rec.id, { photoAttachmentId: att.id }, { audit: false });
        } catch (e) {
          toast.error(`El paciente se guardó, pero la foto no: ${friendlyError(e)}`);
        }
      }
      await form.done();
      toast.success(existing ? 'Paciente actualizado' : 'Paciente registrado');
      navigate(`/pacientes/${rec.id}`, { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  if (id && !existing) {
    return (
      <>
        <PageHeader title="Paciente" back="/pacientes" />
        <Page>
          <Notice tone="warning">No se encontró este paciente.</Notice>
        </Page>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={existing ? `Editar: ${existing.name}` : 'Nuevo paciente'}
        back={existing ? `/pacientes/${existing.id}` : '/pacientes'}
        actions={
          <Button size="sm" onClick={save} loading={saving}>
            Guardar
          </Button>
        }
      />
      <Page>
        {form.restorable && <DraftBanner at={form.restorable.at} onRestore={form.restore} onDiscard={form.discardDraft} />}

        <Section title="Tutor(es)">
          <Card className="space-y-2">
            {f.tutors.map((t, i) => {
              const tutor = tables.tutors.get(t.tutorId);
              return (
                <div key={t.tutorId} className="flex items-center gap-2">
                  <UserRound className="size-5 shrink-0 text-ink-400" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{tutor?.fullName ?? 'Tutor no encontrado'}</span>
                  <Button
                    size="sm"
                    variant={t.role === 'primary' ? 'soft' : 'ghost'}
                    icon={<Star className="size-4" />}
                    onClick={() => form.setField('tutors', f.tutors.map((x, j) => ({ ...x, role: j === i ? 'primary' : 'secondary' })))}
                  >
                    {t.role === 'primary' ? 'Principal' : 'Secundario'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Quitar tutor"
                    onClick={() => {
                      const list = f.tutors.filter((_, j) => j !== i);
                      if (list.length && !list.some((x) => x.role === 'primary')) list[0] = { ...list[0], role: 'primary' };
                      form.setField('tutors', list);
                    }}
                  >
                    <Trash2 className="size-4 text-red-700" />
                  </Button>
                </div>
              );
            })}
            {tried && errors.tutors && <p className="text-sm font-medium text-red-700">{errors.tutors}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setPicker(true)}>
                {f.tutors.length ? 'Agregar otro tutor' : 'Elegir tutor'}
              </Button>
              {!existing && (
                <Link to="/tutores/nuevo?next=patient" className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold text-brand-700">
                  + Tutor nuevo
                </Link>
              )}
            </div>
          </Card>
        </Section>

        <Section title="Identificación">
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
                className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100"
                aria-label="Elegir foto del paciente"
              >
                {photoUrl ? <img src={photoUrl} alt="" className="size-full object-cover" /> : <Camera className="size-6" />}
              </button>
              <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              <Field label="Nombre" required error={tried ? errors.name : null} htmlFor="p-name" className="flex-1">
                <TextInput id="p-name" value={f.name} onChange={(e) => form.setField('name', e.target.value)} autoCapitalize="words" autoComplete="off" invalid={tried && !!errors.name} />
              </Field>
            </div>
            {existing && !photo && <p className="-mt-2 text-xs text-ink-500">{existing.photoAttachmentId ? 'Toca el círculo para reemplazar la foto.' : 'Toca el círculo para agregar una foto.'}</p>}
            {possibleDup.length > 0 && <Notice tone="warning">Este tutor ya tiene un paciente llamado “{possibleDup[0].name}”. Revisa que no sea un duplicado.</Notice>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Especie" required error={tried ? errors.speciesId : null}>
                <Select value={f.speciesId} onChange={(e) => form.setField('speciesId', e.target.value)} aria-label="Especie">
                  {speciesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Raza">
                <TextInput value={f.breed} onChange={(e) => form.setField('breed', e.target.value)} list="breeds" autoCapitalize="words" placeholder="Mestizo, Labrador…" />
                <datalist id="breeds">
                  {breeds.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </Field>
            </div>
            <Link to="/ajustes/especies" className="-mt-2 block text-xs font-semibold text-brand-700">
              ¿Otra especie? Agrégala en Ajustes › Especies
            </Link>
            <Field label="Sexo">
              <Segmented
                name="Sexo"
                value={f.sex}
                onChange={(v) => form.setField('sex', v)}
                options={[
                  { value: 'male', label: 'Macho' },
                  { value: 'female', label: 'Hembra' },
                  { value: 'unknown', label: 'Sin registrar' },
                ]}
              />
            </Field>
            <Field label="Estado reproductivo">
              <Segmented
                name="Estado reproductivo"
                value={f.reproductiveStatus}
                onChange={(v) => form.setField('reproductiveStatus', v)}
                options={[
                  { value: 'intact', label: 'Entero/a' },
                  { value: 'neutered', label: 'Esterilizado/a' },
                  { value: 'unknown', label: 'Sin registrar' },
                ]}
              />
            </Field>
            <Field label="Edad">
              <Segmented
                name="Forma de registrar la edad"
                size="sm"
                value={f.ageMode}
                onChange={(v) => form.setField('ageMode', v)}
                options={[
                  { value: 'date', label: 'Fecha de nacimiento' },
                  { value: 'estimate', label: 'Edad estimada' },
                  { value: 'unknown', label: 'Desconocida' },
                ]}
              />
            </Field>
            {f.ageMode === 'date' && (
              <Field label="Fecha de nacimiento" error={errors.birthDate} hint={f.birthDate ? `Edad: ${ageText(f.birthDate)}` : undefined}>
                <DateInput value={f.birthDate} onChange={(v) => form.setField('birthDate', v)} max={todayISO()} />
              </Field>
            )}
            {f.ageMode === 'estimate' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Años">
                    <IntegerInput value={f.ageYears} onChange={(v) => form.setField('ageYears', v)} unit="años" />
                  </Field>
                  <Field label="Meses">
                    <IntegerInput value={f.ageMonths} onChange={(v) => form.setField('ageMonths', v)} unit="meses" />
                  </Field>
                </div>
                {(tried || f.ageMonths) && errors.age && <p className="text-sm font-medium text-red-700">{errors.age}</p>}
                {existing?.birthDateEstimated && !f.ageYears && !f.ageMonths && (
                  <p className="text-sm text-ink-500">Edad estimada actual: {ageText(existing.birthDate, undefined, true)}. Escribe años y meses solo si quieres actualizarla.</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Color / pelaje">
                <TextInput value={f.color} onChange={(e) => form.setField('color', e.target.value)} />
              </Field>
              <Field label="Peso actual" error={errors.weight} hint={lw ? `Último: ${formatDecimal(lw.weightKg)} kg` : undefined}>
                <DecimalInput value={f.weightKg} onChange={(v) => form.setField('weightKg', v)} unit="kg" invalid={!!errors.weight} />
              </Field>
            </div>
            <Field label="Señas particulares">
              <TextInput value={f.markings} onChange={(e) => form.setField('markings', e.target.value)} placeholder="Mancha blanca en el pecho, oreja cortada…" />
            </Field>
            <Field label="Número de microchip" error={errors.microchip} hint={microchipWarn ?? undefined}>
              <TextInput value={f.microchip} onChange={(e) => form.setField('microchip', e.target.value)} inputMode="numeric" autoComplete="off" />
            </Field>
          </Card>
        </Section>

        {species && species.extraFields.length > 0 && (
          <Section title={`Datos propios de la especie (${species.name})`}>
            <Card className="space-y-4">
              {species.extraFields.map((ef) => (
                <Field key={ef.key} label={ef.label}>
                  {ef.type === 'select' ? (
                    <Select value={String(f.extra[ef.key] ?? '')} onChange={(e) => form.setField('extra', { ...f.extra, [ef.key]: e.target.value })} aria-label={ef.label}>
                      <option value="">Sin registrar</option>
                      {(ef.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  ) : ef.type === 'boolean' ? (
                    <Segmented
                      name={ef.label}
                      value={f.extra[ef.key] === true ? 'yes' : f.extra[ef.key] === false ? 'no' : undefined}
                      onChange={(v) => form.setField('extra', { ...f.extra, [ef.key]: v === 'yes' })}
                      options={[
                        { value: 'yes', label: 'Sí' },
                        { value: 'no', label: 'No' },
                      ]}
                    />
                  ) : (
                    <TextInput value={String(f.extra[ef.key] ?? '')} onChange={(e) => form.setField('extra', { ...f.extra, [ef.key]: e.target.value })} />
                  )}
                </Field>
              ))}
            </Card>
          </Section>
        )}

        {existing && (
          <Section title="Estado">
            <Card className="space-y-4">
              <Segmented
                name="Estado del paciente"
                value={f.status}
                onChange={(v) => form.setField('status', v)}
                options={[
                  { value: 'active', label: 'Activo' },
                  { value: 'inactive', label: 'Inactivo' },
                  { value: 'deceased', label: 'Fallecido' },
                ]}
              />
              {f.status === 'deceased' && (
                <Field label="Fecha de fallecimiento" error={errors.deceasedDate}>
                  <DateInput value={f.deceasedDate} onChange={(v) => form.setField('deceasedDate', v)} max={todayISO()} />
                </Field>
              )}
            </Card>
          </Section>
        )}

        <Section title="Observaciones generales">
          <Card>
            <TextArea value={f.notes} onChange={(e) => form.setField('notes', e.target.value)} aria-label="Observaciones generales" />
          </Card>
        </Section>
        {!existing && <Notice tone="neutral">Después de guardar podrás registrar antecedentes clínicos, alergias y alertas.</Notice>}
      </Page>
      <StickyActions>
        <Button
          variant="secondary"
          onClick={async () => {
            await form.discardDraft();
            await form.done();
            navigate(-1);
          }}
        >
          Cancelar
        </Button>
        <Button block onClick={save} loading={saving}>
          {existing ? 'Guardar cambios' : 'Guardar paciente'}
        </Button>
      </StickyActions>
      {picker && (
        <TutorPickerSheet
          newHref={!existing ? '/tutores/nuevo?next=patient' : undefined}
          onClose={() => setPicker(false)}
          onPick={(t) => {
            if (!f.tutors.some((x) => x.tutorId === t.id)) form.setField('tutors', [...f.tutors, { tutorId: t.id, role: f.tutors.length ? 'secondary' : 'primary' }]);
            setPicker(false);
          }}
        />
      )}
    </>
  );
}
