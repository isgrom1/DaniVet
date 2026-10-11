import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MapPin, Plus, Star, Trash2, UserRoundSearch } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice, Section } from '@/components/Card';
import { Field, Segmented, TextArea, TextInput } from '@/components/form';
import { AddressFields } from '@/components/AddressFields';
import { DraftBanner } from '@/components/DraftBanner';
import { confirmDialog, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { insert, update } from '@/data/repo';
import { friendlyError, ValidationError } from '@/data/errors';
import type { Address, Tutor } from '@/data/schema';
import { newId } from '@/lib/ids';
import { formatPhone, isValidPhone, normalizePhone } from '@/lib/phone';
import { formatRut, isValidRut } from '@/lib/rut';
import { isValidEmail } from '@/lib/text';
import { emptyToUndef } from '@/lib/objects';
import { useFormDraft } from '@/lib/useFormDraft';
import { findTutorDuplicates } from './duplicates';

interface FormState {
  fullName: string;
  phone: string;
  phoneAlt: string;
  email: string;
  rut: string;
  contactPreference: '' | 'call' | 'whatsapp' | 'email' | 'sms';
  addresses: Array<Address>;
  altName: string;
  altPhone: string;
  altRelation: string;
  decName: string;
  decPhone: string;
  decRelation: string;
  notes: string;
}

function fromTutor(t?: Tutor): FormState {
  return {
    fullName: t?.fullName ?? '',
    phone: t?.phone ? formatPhone(t.phone) : '',
    phoneAlt: t?.phoneAlt ? formatPhone(t.phoneAlt) : '',
    email: t?.email ?? '',
    rut: t?.rut ?? '',
    contactPreference: t?.contactPreference ?? '',
    addresses: t?.addresses?.length ? t.addresses : [{ id: newId(), label: 'Casa', street: '', primary: true }],
    altName: t?.altContact?.name ?? '',
    altPhone: t?.altContact?.phone ?? '',
    altRelation: t?.altContact?.relation ?? '',
    decName: t?.decisionMaker?.name ?? '',
    decPhone: t?.decisionMaker?.phone ?? '',
    decRelation: t?.decisionMaker?.relation ?? '',
    notes: t?.notes ?? '',
  };
}

export function TutorForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const next = params.get('next');
  const navigate = useNavigate();
  const tables = useTables();
  const existing = id ? tables.tutors.get(id) : undefined;
  const form = useFormDraft<FormState>(`form:tutor:${id ?? 'new'}`, () => fromTutor(existing));
  const f = form.value;
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = {
    fullName: f.fullName.trim().length < 2 ? 'Ingresa el nombre completo' : null,
    phone: !f.phone.trim() ? 'El teléfono es necesario para coordinar las visitas' : !isValidPhone(f.phone) ? 'Teléfono no válido (ej.: +56 9 1234 5678)' : null,
    phoneAlt: f.phoneAlt && !isValidPhone(f.phoneAlt) ? 'Teléfono no válido' : null,
    email: f.email && !isValidEmail(f.email) ? 'Correo no válido' : null,
    rut: f.rut && !isValidRut(f.rut) ? 'RUT no válido (revisa el dígito verificador)' : null,
    altPhone: f.altPhone && !isValidPhone(f.altPhone) ? 'Teléfono no válido' : null,
    decPhone: f.decPhone && !isValidPhone(f.decPhone) ? 'Teléfono no válido' : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const duplicates = useMemo(
    () => findTutorDuplicates(tables, { fullName: f.fullName, phone: f.phone, phoneAlt: f.phoneAlt, email: f.email, rut: f.rut }, id),
    [tables, f.fullName, f.phone, f.phoneAlt, f.email, f.rut, id],
  );

  const setAddress = (i: number, a: Partial<Address>) => form.set((prev) => ({ ...prev, addresses: prev.addresses.map((x, j) => (j === i ? { ...x, ...a } : x)) }));
  const setPrimary = (i: number) => form.set((prev) => ({ ...prev, addresses: prev.addresses.map((x, j) => ({ ...x, primary: j === i })) }));
  const removeAddress = (i: number) =>
    form.set((prev) => {
      const list = prev.addresses.filter((_, j) => j !== i);
      if (list.length && !list.some((a) => a.primary)) list[0] = { ...list[0], primary: true };
      return { ...prev, addresses: list };
    });

  const afterSave = (tutorId: string) => {
    if (next === 'patient') navigate(`/pacientes/nuevo?tutorId=${tutorId}`, { replace: true });
    else if (next === 'appointment') navigate(`/agenda/nueva?tutorId=${tutorId}`, { replace: true });
    else navigate(`/tutores/${tutorId}`, { replace: true });
  };

  const save = async () => {
    setTried(true);
    if (hasErrors) {
      toast.error('Revisa los campos marcados.');
      return;
    }
    if (!id && duplicates.length) {
      const ok = await confirmDialog({
        title: 'Posible tutor duplicado',
        message: (
          <>
            <p>Encontramos {duplicates.length === 1 ? 'un registro parecido' : `${duplicates.length} registros parecidos`}:</p>
            <ul className="list-disc pl-5">
              {duplicates.map((d) => (
                <li key={d.tutor.id}>
                  <strong>{d.tutor.fullName}</strong> ({d.reasons.join(', ')})
                </li>
              ))}
            </ul>
            <p>¿Crear un tutor nuevo de todas formas?</p>
          </>
        ),
        confirmLabel: 'Crear de todas formas',
      });
      if (!ok) return;
    }
    const addresses = f.addresses
      .filter((a) => a.street.trim() || a.comuna?.trim() || a.directions?.trim())
      .map((a) => ({
        id: a.id,
        label: emptyToUndef(a.label),
        street: a.street.trim(),
        comuna: emptyToUndef(a.comuna),
        city: emptyToUndef(a.city),
        directions: emptyToUndef(a.directions),
        primary: a.primary,
      }));
    if (addresses.length && !addresses.some((a) => a.primary)) addresses[0].primary = true;
    const contact = (name: string, phone: string, relation: string) =>
      name.trim() || phone.trim() ? { name: emptyToUndef(name), phone: normalizePhone(phone) ?? emptyToUndef(phone), relation: emptyToUndef(relation) } : undefined;
    const data = {
      fullName: f.fullName.trim(),
      phone: normalizePhone(f.phone) ?? undefined,
      phoneAlt: normalizePhone(f.phoneAlt) ?? undefined,
      email: emptyToUndef(f.email)?.toLowerCase(),
      rut: f.rut ? formatRut(f.rut) : undefined,
      contactPreference: f.contactPreference || undefined,
      addresses,
      altContact: contact(f.altName, f.altPhone, f.altRelation),
      decisionMaker: contact(f.decName, f.decPhone, f.decRelation),
      notes: emptyToUndef(f.notes),
    };
    setSaving(true);
    try {
      const rec = existing
        ? await update('tutors', existing.id, (cur) => ({ ...cur, ...data }), { baseRev: existing.rev })
        : await insert('tutors', data);
      await form.done();
      toast.success(existing ? 'Tutor actualizado' : 'Tutor registrado');
      afterSave(rec.id);
    } catch (e) {
      toast.error(e instanceof ValidationError ? e.message : friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    await form.discardDraft();
    await form.done();
    navigate(-1);
  };

  if (id && !existing) {
    return (
      <>
        <PageHeader title="Tutor" back="/tutores" />
        <Page>
          <Notice tone="warning">No se encontró este tutor.</Notice>
        </Page>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={existing ? 'Editar tutor' : 'Nuevo tutor'}
        back={existing ? `/tutores/${existing.id}` : '/tutores'}
        actions={
          <Button size="sm" onClick={save} loading={saving}>
            Guardar
          </Button>
        }
      />
      <Page>
        {form.restorable && <DraftBanner at={form.restorable.at} onRestore={form.restore} onDiscard={form.discardDraft} />}
        <Section title="Datos de contacto">
          <Card className="space-y-4">
            <Field label="Nombre completo" required error={tried ? errors.fullName : null} htmlFor="t-name">
              <TextInput id="t-name" value={f.fullName} onChange={(e) => form.setField('fullName', e.target.value)} autoComplete="off" autoCapitalize="words" invalid={tried && !!errors.fullName} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Teléfono" required error={tried || f.phone.length > 8 ? errors.phone : null} htmlFor="t-phone">
                <TextInput id="t-phone" type="tel" inputMode="tel" autoComplete="off" value={f.phone} onChange={(e) => form.setField('phone', e.target.value)} placeholder="+56 9 1234 5678" invalid={tried && !!errors.phone} />
              </Field>
              <Field label="Teléfono alternativo" error={errors.phoneAlt} htmlFor="t-phone2">
                <TextInput id="t-phone2" type="tel" inputMode="tel" autoComplete="off" value={f.phoneAlt} onChange={(e) => form.setField('phoneAlt', e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Correo electrónico" error={errors.email} htmlFor="t-email">
                <TextInput id="t-email" type="email" inputMode="email" autoCapitalize="none" autoComplete="off" value={f.email} onChange={(e) => form.setField('email', e.target.value)} />
              </Field>
              <Field label="RUT (opcional)" error={errors.rut} htmlFor="t-rut" hint="Solo si lo necesitas para documentos.">
                <TextInput id="t-rut" autoComplete="off" value={f.rut} onChange={(e) => form.setField('rut', e.target.value)} onBlur={() => f.rut && isValidRut(f.rut) && form.setField('rut', formatRut(f.rut))} placeholder="12.345.678-9" />
              </Field>
            </div>
            <Field label="Preferencia de contacto">
              <Segmented
                name="Preferencia de contacto"
                value={f.contactPreference || undefined}
                onChange={(v) => form.setField('contactPreference', v === f.contactPreference ? '' : v)}
                options={[
                  { value: 'whatsapp', label: 'WhatsApp' },
                  { value: 'call', label: 'Llamada' },
                  { value: 'sms', label: 'SMS' },
                  { value: 'email', label: 'Correo' },
                ]}
              />
            </Field>
          </Card>
        </Section>

        {duplicates.length > 0 && (
          <Notice tone="warning" icon={<UserRoundSearch className="size-5" />} title="Posibles coincidencias">
            <ul className="mt-1 space-y-2">
              {duplicates.map((d) => (
                <li key={d.tutor.id} className="flex items-center justify-between gap-2">
                  <span>
                    <strong>{d.tutor.fullName}</strong>
                    {d.tutor.phone && <> · {formatPhone(d.tutor.phone)}</>}
                    <span className="block text-xs">{d.reasons.join(' · ')}</span>
                  </span>
                  {!id && (
                    <Button size="sm" variant="secondary" onClick={async () => { await form.discardDraft(); await form.done(); afterSave(d.tutor.id); }}>
                      Usar este
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {id && <p className="mt-2 text-xs">Si son la misma persona, puedes fusionarlos desde la ficha del tutor.</p>}
          </Notice>
        )}

        <Section
          title="Direcciones de atención"
          action={
            <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => form.set((prev) => ({ ...prev, addresses: [...prev.addresses, { id: newId(), street: '', primary: prev.addresses.length === 0 }] }))}>
              Agregar
            </Button>
          }
        >
          {f.addresses.length === 0 && <Notice tone="neutral">Sin direcciones. Agrega al menos una para las visitas a domicilio.</Notice>}
          {f.addresses.map((a, i) => (
            <Card key={a.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-700">
                  <MapPin className="size-4" /> Dirección {i + 1}
                </p>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant={a.primary ? 'soft' : 'ghost'} icon={<Star className="size-4" />} onClick={() => setPrimary(i)}>
                    {a.primary ? 'Principal' : 'Hacer principal'}
                  </Button>
                  {f.addresses.length > 1 && (
                    <Button size="sm" variant="ghost" aria-label="Quitar dirección" onClick={() => removeAddress(i)}>
                      <Trash2 className="size-4 text-red-700" />
                    </Button>
                  )}
                </div>
              </div>
              <AddressFields value={a} onChange={(v) => setAddress(i, v)} />
            </Card>
          ))}
        </Section>

        <Section title="Contacto alternativo (opcional)">
          <Card className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nombre">
                <TextInput value={f.altName} onChange={(e) => form.setField('altName', e.target.value)} autoCapitalize="words" />
              </Field>
              <Field label="Teléfono" error={errors.altPhone}>
                <TextInput type="tel" inputMode="tel" value={f.altPhone} onChange={(e) => form.setField('altPhone', e.target.value)} />
              </Field>
              <Field label="Relación">
                <TextInput value={f.altRelation} onChange={(e) => form.setField('altRelation', e.target.value)} placeholder="Hija, vecino…" />
              </Field>
            </div>
          </Card>
        </Section>

        <Section title="Persona autorizada para tomar decisiones (opcional)" description="Si alguien distinto del tutor puede autorizar procedimientos.">
          <Card className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nombre">
                <TextInput value={f.decName} onChange={(e) => form.setField('decName', e.target.value)} autoCapitalize="words" />
              </Field>
              <Field label="Teléfono" error={errors.decPhone}>
                <TextInput type="tel" inputMode="tel" value={f.decPhone} onChange={(e) => form.setField('decPhone', e.target.value)} />
              </Field>
              <Field label="Relación">
                <TextInput value={f.decRelation} onChange={(e) => form.setField('decRelation', e.target.value)} />
              </Field>
            </div>
          </Card>
        </Section>

        <Section title="Observaciones">
          <Card>
            <TextArea value={f.notes} onChange={(e) => form.setField('notes', e.target.value)} placeholder="Horarios preferidos, consideraciones relevantes…" aria-label="Observaciones" />
          </Card>
        </Section>
      </Page>
      <StickyActions>
        <Button variant="secondary" onClick={cancel}>
          Cancelar
        </Button>
        <Button block onClick={save} loading={saving}>
          {existing ? 'Guardar cambios' : 'Guardar tutor'}
        </Button>
      </StickyActions>
    </>
  );
}
