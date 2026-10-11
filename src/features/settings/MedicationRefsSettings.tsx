import { useState } from 'react';
import { Pill, Plus } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button } from '@/components/Button';
import { Badge, EmptyState, List, ListRow, Notice } from '@/components/Card';
import { DecimalInput, Field, Select, Switch, TextArea, TextInput } from '@/components/form';
import { Sheet, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { insert, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { concentrationUnits, type MedicationRef } from '@/data/schema';
import { formatDecimal, parseDecimal } from '@/lib/numbers';

export function MedicationRefsSettings() {
  const tables = useTables();
  const [editing, setEditing] = useState<MedicationRef | 'new' | null>(null);
  const list = [...tables.medicationRefs.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return (
    <>
      <PageHeader
        title="Medicamentos frecuentes"
        back="/mas"
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Nuevo
          </Button>
        }
      />
      <Page>
        <Notice tone="info">Referencias para completar recetas más rápido (nombre, principio activo, concentración, presentación). No se guardan dosis: la dosis siempre la indicas tú en cada receta.</Notice>
        {list.length === 0 ? (
          <EmptyState icon={<Pill className="size-6" />} title="Sin medicamentos guardados" />
        ) : (
          <List>
            {list.map((m) => (
              <ListRow
                key={m.id}
                onClick={() => setEditing(m)}
                title={m.name}
                subtitle={[m.activeIngredient, m.concentrationValue ? `${formatDecimal(m.concentrationValue, 4)} ${m.concentrationUnit ?? ''}` : '', m.presentation].filter(Boolean).join(' · ')}
                meta={
                  m.antimicrobial || m.controlled || !m.active ? (
                    <>
                      {m.antimicrobial && <Badge tone="warning">Antimicrobiano</Badge>}
                      {m.controlled && <Badge tone="danger">Controlado</Badge>}
                      {!m.active && <Badge>Inactivo</Badge>}
                    </>
                  ) : undefined
                }
              />
            ))}
          </List>
        )}
      </Page>
      {editing && <MedSheet m={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function MedSheet({ m, onClose }: { m?: MedicationRef; onClose: () => void }) {
  const [f, setF] = useState({
    name: m?.name ?? '',
    activeIngredient: m?.activeIngredient ?? '',
    conc: m?.concentrationValue !== undefined ? formatDecimal(m.concentrationValue, 4) : '',
    unit: m?.concentrationUnit ?? 'mg/mL',
    presentation: m?.presentation ?? '',
    route: m?.route ?? '',
    notes: m?.notes ?? '',
    antimicrobial: m?.antimicrobial ?? false,
    controlled: m?.controlled ?? false,
    active: m?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.name.trim()) return toast.error('Indica el nombre.');
    const c = f.conc ? parseDecimal(f.conc) : null;
    if (f.conc && (c === null || c <= 0)) return toast.error('Concentración no válida.');
    setBusy(true);
    const data = {
      name: f.name.trim(),
      activeIngredient: f.activeIngredient.trim() || undefined,
      concentrationValue: c ?? undefined,
      concentrationUnit: c ? (f.unit as MedicationRef['concentrationUnit']) : undefined,
      presentation: f.presentation.trim() || undefined,
      route: f.route.trim() || undefined,
      notes: f.notes.trim() || undefined,
      antimicrobial: f.antimicrobial,
      controlled: f.controlled,
      active: f.active,
    };
    try {
      if (m) await update('medicationRefs', m.id, (cur) => ({ ...cur, ...data }));
      else await insert('medicationRefs', data);
      toast.success('Medicamento guardado');
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={m ? 'Editar medicamento' : 'Nuevo medicamento'}
      size="full"
      footer={
        <Button block onClick={save} loading={busy}>
          Guardar
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre comercial o genérico" required>
          <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Principio activo">
          <TextInput value={f.activeIngredient} onChange={(e) => setF({ ...f, activeIngredient: e.target.value })} />
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Concentración">
            <DecimalInput value={f.conc} onChange={(v) => setF({ ...f, conc: v })} />
          </Field>
          <Field label="Unidad">
            <Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as typeof f.unit })} aria-label="Unidad de concentración" className="w-40">
              {concentrationUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Presentación">
            <TextInput value={f.presentation} onChange={(e) => setF({ ...f, presentation: e.target.value })} />
          </Field>
          <Field label="Vía habitual">
            <TextInput value={f.route} onChange={(e) => setF({ ...f, route: e.target.value })} />
          </Field>
        </div>
        <Field label="Notas">
          <TextArea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} minRows={2} />
        </Field>
        <Switch checked={f.antimicrobial} onChange={(v) => setF({ ...f, antimicrobial: v })} label="Antimicrobiano" description="Mostrará el aviso de receta electrónica SAG." />
        <Switch checked={f.controlled} onChange={(v) => setF({ ...f, controlled: v })} label="Controlado / receta retenida" />
        <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Activo" />
      </div>
    </Sheet>
  );
}
