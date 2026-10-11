import { useState } from 'react';
import { FileStack, Plus, Trash2 } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button } from '@/components/Button';
import { Badge, List, ListRow, Notice, Section } from '@/components/Card';
import { Field, Select, Switch, TextArea, TextInput } from '@/components/form';
import { Sheet, confirmDialog, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { insert, remove, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import type { Template, TemplateKind } from '@/data/schema';
import { TEMPLATABLE_FIELDS } from '@/features/consultations/model';

const KIND: Partial<Record<TemplateKind, string>> = {
  consultation: 'Consulta (textos para campos)',
  consent: 'Consentimiento informado',
  refusal: 'Rechazo de procedimiento',
  indications: 'Indicaciones posteriores',
  referral: 'Informe de derivación',
  exam_order: 'Orden de exámenes',
};

export function TemplatesSettings() {
  const tables = useTables();
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const list = [...tables.templates.values()].filter((t) => KIND[t.kind]).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'es'));
  return (
    <>
      <PageHeader
        title="Plantillas y textos"
        back="/mas"
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Nueva
          </Button>
        }
      />
      <Page>
        <Notice tone="info">
          Las plantillas de consulta completan textos frecuentes (motivo, historia, cuidados, recomendaciones) y quedan marcados para revisión. No incluyen examen físico,
          diagnósticos ni tratamientos. Las de documentos aceptan marcadores como {'{tutor}'} o {'{paciente}'}.
        </Notice>
        {(Object.keys(KIND) as TemplateKind[]).map((k) => {
          const items = list.filter((t) => t.kind === k);
          if (!items.length) return null;
          return (
            <Section key={k} title={KIND[k]}>
              <List>
                {items.map((t) => (
                  <ListRow key={t.id} onClick={() => setEditing(t)} leading={<FileStack className="size-5 text-brand-700" />} title={t.name} trailing={!t.active ? <Badge>Inactiva</Badge> : undefined} />
                ))}
              </List>
            </Section>
          );
        })}
      </Page>
      {editing && <TemplateSheet t={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TemplateSheet({ t, onClose }: { t?: Template; onClose: () => void }) {
  const [kind, setKind] = useState<TemplateKind>(t?.kind ?? 'consultation');
  const [name, setName] = useState(t?.name ?? '');
  const [fields, setFields] = useState<Record<string, string>>(t?.fields ?? {});
  const [active, setActive] = useState(t?.active ?? true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return toast.error('Indica un nombre.');
    setBusy(true);
    const data = { kind, name: name.trim(), fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim())), active };
    try {
      if (t) await update('templates', t.id, (cur) => ({ ...cur, ...data }));
      else await insert('templates', data);
      toast.success('Plantilla guardada');
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    if (!t) return;
    if (!(await confirmDialog({ title: 'Eliminar plantilla', confirmLabel: 'Eliminar', tone: 'danger' }))) return;
    try {
      await remove('templates', t.id);
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={t ? 'Editar plantilla' : 'Nueva plantilla'}
      size="full"
      footer={
        <div className="flex gap-2">
          {t && <Button variant="secondary" aria-label="Eliminar plantilla" icon={<Trash2 className="size-4 text-red-700" />} onClick={del} />}
          <Button block onClick={save} loading={busy}>
            Guardar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as TemplateKind)} disabled={!!t} aria-label="Tipo de plantilla">
            {Object.entries(KIND).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nombre" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {kind === 'consultation' ? (
          TEMPLATABLE_FIELDS.map((f) => (
            <Field key={f.path} label={f.label}>
              <TextArea value={fields[f.path] ?? ''} onChange={(e) => setFields({ ...fields, [f.path]: e.target.value })} minRows={2} />
            </Field>
          ))
        ) : (
          <Field label="Texto" hint="Marcadores: {tutor}, {rut_tutor}, {paciente}, {especie}, {profesional}, {procedimiento}, {fecha}.">
            <TextArea value={fields.body ?? ''} onChange={(e) => setFields({ ...fields, body: e.target.value })} minRows={10} />
          </Field>
        )}
        {fields.note && <p className="text-xs text-ink-500">{fields.note}</p>}
        <Switch checked={active} onChange={setActive} label="Activa" />
      </div>
    </Sheet>
  );
}
