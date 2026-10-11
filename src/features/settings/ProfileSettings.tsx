import { useRef, useState } from 'react';
import { ImagePlus, PenLine, Trash2 } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice, Section } from '@/components/Card';
import { Field, Segmented, TextArea, TextInput } from '@/components/form';
import { Sheet, toast } from '@/components/overlay';
import { useProfile, useTables } from '@/data/hooks';
import { update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { formatRut, isValidRut } from '@/lib/rut';
import { isValidEmail } from '@/lib/text';
import { emptyToUndef } from '@/lib/objects';
import { deleteAttachment, saveAttachment, useBlobUrl } from '@/features/attachments/attachments';
import { SignaturePad } from '@/features/documents/SignaturePad';
import { DEFAULT_APP_NAME } from '@/lib/platform';

export function ProfileSettings() {
  const profile = useProfile();
  const tables = useTables();
  const [f, setF] = useState(() => ({
    fullName: profile?.fullName ?? '',
    title: profile?.title ?? 'Médica Veterinaria',
    rut: profile?.rut ?? '',
    licenseNumber: profile?.licenseNumber ?? '',
    phone: profile?.phone ?? '',
    email: profile?.email ?? '',
    address: profile?.address ?? '',
    comuna: profile?.comuna ?? '',
    city: profile?.city ?? '',
    serviceArea: profile?.serviceArea ?? '',
    documentFooter: profile?.documentFooter ?? '',
    appName: profile?.appName ?? DEFAULT_APP_NAME,
    paperSize: profile?.paperSize ?? 'letter',
  }));
  const [busy, setBusy] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const sigInput = useRef<HTMLInputElement>(null);
  const logo = profile?.logoAttachmentId ? tables.attachments.get(profile.logoAttachmentId) : undefined;
  const sig = profile?.signatureAttachmentId ? tables.attachments.get(profile.signatureAttachmentId) : undefined;
  const logoUrl = useBlobUrl(logo?.blobId).url;
  const sigUrl = useBlobUrl(sig?.blobId).url;
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const errors = {
    fullName: f.fullName.trim().length < 3 ? 'Ingresa tu nombre' : null,
    rut: f.rut && !isValidRut(f.rut) ? 'RUT no válido' : null,
    email: f.email && !isValidEmail(f.email) ? 'Correo no válido' : null,
    appName: !f.appName.trim() ? 'Indica un nombre' : null,
  };

  const save = async () => {
    if (Object.values(errors).some(Boolean)) {
      toast.error(Object.values(errors).find(Boolean)!);
      return;
    }
    setBusy(true);
    try {
      await update('profile', 'profile', (cur) => ({
        ...cur,
        fullName: f.fullName.trim(),
        title: f.title.trim(),
        rut: f.rut ? formatRut(f.rut) : undefined,
        licenseNumber: emptyToUndef(f.licenseNumber),
        phone: emptyToUndef(f.phone),
        email: emptyToUndef(f.email),
        address: emptyToUndef(f.address),
        comuna: emptyToUndef(f.comuna),
        city: emptyToUndef(f.city),
        serviceArea: emptyToUndef(f.serviceArea),
        documentFooter: emptyToUndef(f.documentFooter),
        appName: f.appName.trim(),
        paperSize: f.paperSize as 'letter' | 'a4',
      }));
      toast.success('Perfil guardado');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const setImage = async (file: Blob | undefined, kind: 'logo' | 'signature') => {
    if (!file) return;
    try {
      const prev = kind === 'logo' ? profile?.logoAttachmentId : profile?.signatureAttachmentId;
      const att = await saveAttachment({ file, fileName: kind === 'logo' ? 'logo.jpg' : 'firma.jpg', ownerKind: 'profile', kind }, { maxDim: kind === 'logo' ? 600 : 900 });
      await update('profile', 'profile', kind === 'logo' ? { logoAttachmentId: att.id } : { signatureAttachmentId: att.id });
      if (prev) await deleteAttachment(prev).catch(() => undefined);
      toast.success(kind === 'logo' ? 'Logo actualizado' : 'Firma actualizada');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <>
      <PageHeader title="Perfil profesional" back="/mas" />
      <Page>
        <Notice tone="info">Estos datos aparecen en recetas, certificados, informes y comprobantes. Puedes cambiarlos cuando quieras sin modificar documentos ya emitidos.</Notice>
        <Section title="Identificación">
          <Card className="space-y-4">
            <Field label="Nombre profesional" required error={errors.fullName}>
              <TextInput value={f.fullName} onChange={(e) => set('fullName', e.target.value)} autoCapitalize="words" />
            </Field>
            <Field label="Título">
              <TextInput value={f.title} onChange={(e) => set('title', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="RUT" error={errors.rut}>
                <TextInput value={f.rut} onChange={(e) => set('rut', e.target.value)} onBlur={() => f.rut && isValidRut(f.rut) && set('rut', formatRut(f.rut))} />
              </Field>
              <Field label="N.º registro / colegiatura" hint="Si corresponde.">
                <TextInput value={f.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value)} />
              </Field>
            </div>
          </Card>
        </Section>
        <Section title="Contacto">
          <Card className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Teléfono">
                <TextInput type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label="Correo" error={errors.email}>
                <TextInput type="email" inputMode="email" autoCapitalize="none" value={f.email} onChange={(e) => set('email', e.target.value)} />
              </Field>
            </div>
            <Field label="Dirección (opcional)">
              <TextInput value={f.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Comuna">
                <TextInput value={f.comuna} onChange={(e) => set('comuna', e.target.value)} />
              </Field>
              <Field label="Ciudad">
                <TextInput value={f.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
            </div>
            <Field label="Zona de atención a domicilio">
              <TextInput value={f.serviceArea} onChange={(e) => set('serviceArea', e.target.value)} placeholder="Ñuñoa, Providencia, La Reina…" />
            </Field>
          </Card>
        </Section>
        <Section title="Logo y firma">
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-xl bg-sand-100 ring-1 ring-sand-200">{logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-ink-500">Sin logo</span>}</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<ImagePlus className="size-4" />} onClick={() => logoInput.current?.click()}>
                  {logo ? 'Cambiar logo' : 'Subir logo'}
                </Button>
                {logo && (
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4 text-red-700" />} onClick={() => void deleteAttachment(logo.id).then(() => toast.success('Logo quitado'))}>
                    Quitar
                  </Button>
                )}
              </div>
              <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={(e) => void setImage(e.target.files?.[0], 'logo')} />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-sand-200">{sigUrl ? <img src={sigUrl} alt="Firma" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-ink-500">Sin firma</span>}</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" icon={<PenLine className="size-4" />} onClick={() => setDrawOpen(true)}>
                  Dibujar firma
                </Button>
                <Button size="sm" variant="secondary" icon={<ImagePlus className="size-4" />} onClick={() => sigInput.current?.click()}>
                  Subir imagen
                </Button>
                {sig && (
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4 text-red-700" />} onClick={() => void deleteAttachment(sig.id).then(() => toast.success('Firma quitada'))}>
                    Quitar
                  </Button>
                )}
              </div>
              <input ref={sigInput} type="file" accept="image/*" className="hidden" onChange={(e) => void setImage(e.target.files?.[0], 'signature')} />
            </div>
            <p className="text-xs text-ink-500">La firma se inserta como imagen en los PDF. No constituye firma electrónica avanzada. Puedes firmar a mano los documentos impresos.</p>
          </Card>
        </Section>
        <Section title="Documentos y app">
          <Card className="space-y-4">
            <Field label="Texto al pie de los documentos (opcional)">
              <TextArea value={f.documentFooter} onChange={(e) => set('documentFooter', e.target.value)} minRows={2} />
            </Field>
            <Field label="Tamaño de papel">
              <Segmented
                name="Tamaño de papel"
                value={f.paperSize as 'letter'}
                onChange={(v) => set('paperSize', v)}
                options={[
                  { value: 'letter', label: 'Carta' },
                  { value: 'a4', label: 'A4' },
                ]}
              />
            </Field>
            <Field label="Nombre de la app" error={errors.appName} hint="Aparece en el pie de los PDF y en los eventos de calendario. El nombre bajo el ícono de inicio se define al publicar la app.">
              <TextInput value={f.appName} onChange={(e) => set('appName', e.target.value)} />
            </Field>
          </Card>
        </Section>
      </Page>
      <StickyActions>
        <Button block onClick={save} loading={busy}>
          Guardar perfil
        </Button>
      </StickyActions>
      {drawOpen && (
        <Sheet open onClose={() => setDrawOpen(false)} title="Dibuja tu firma">
          <SignaturePad
            onSave={async (png) => {
              await setImage(png, 'signature');
              setDrawOpen(false);
            }}
          />
        </Sheet>
      )}
    </>
  );
}
