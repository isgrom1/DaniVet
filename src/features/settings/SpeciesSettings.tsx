import { useState } from 'react';
import { PawPrint, Plus, Trash2 } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button } from '@/components/Button';
import { Badge, List, ListRow, Notice } from '@/components/Card';
import { DecimalInput, Field, Segmented, Select, Switch, TextInput } from '@/components/form';
import { Sheet, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { insert, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import type { Species } from '@/data/schema';
import { formatDecimal, parseDecimal } from '@/lib/numbers';

export function SpeciesSettings() {
  const tables = useTables();
  const [editing, setEditing] = useState<Species | 'new' | null>(null);
  const list = [...tables.species.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return (
    <>
      <PageHeader
        title="Especies"
        back="/mas"
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Nueva
          </Button>
        }
      />
      <Page>
        <Notice tone="info">
          Los rangos de referencia vienen vacíos: la app no trae valores predefinidos. Si los configuras según tu bibliografía, el examen físico destacará los valores fuera de
          rango (solo como ayuda visual).
        </Notice>
        <List>
          {list.map((s) => (
            <ListRow
              key={s.id}
              onClick={() => setEditing(s)}
              leading={<PawPrint className="size-5 text-brand-700" />}
              title={s.name}
              subtitle={`${s.extraFields.length} campo(s) propios · condición corporal 1–${s.bcsScale}${s.refRanges.temperatureC?.min !== undefined ? ' · con rangos' : ''}`}
              trailing={!s.active ? <Badge>Inactiva</Badge> : undefined}
            />
          ))}
        </List>
      </Page>
      {editing && <SpeciesSheet s={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

type Range = { min: string; max: string };
const toRange = (r?: { min?: number; max?: number }): Range => ({ min: r?.min !== undefined ? formatDecimal(r.min, 2) : '', max: r?.max !== undefined ? formatDecimal(r.max, 2) : '' });
const fromRange = (r: Range) => {
  const min = r.min ? parseDecimal(r.min) : null;
  const max = r.max ? parseDecimal(r.max) : null;
  if (min === null && max === null) return undefined;
  return { min: min ?? undefined, max: max ?? undefined };
};

function RangeRow({ label, unit, v, set }: { label: string; unit: string; v: Range; set: (r: Range) => void }) {
  return (
    <div className="grid grid-cols-[1fr_1fr] gap-2">
      <Field label={`${label} mín.`}>
        <DecimalInput value={v.min} onChange={(x) => set({ ...v, min: x })} unit={unit} />
      </Field>
      <Field label={`${label} máx.`}>
        <DecimalInput value={v.max} onChange={(x) => set({ ...v, max: x })} unit={unit} />
      </Field>
    </div>
  );
}

function SpeciesSheet({ s, onClose }: { s?: Species; onClose: () => void }) {
  const [name, setName] = useState(s?.name ?? '');
  const [active, setActive] = useState(s?.active ?? true);
  const [bcs, setBcs] = useState<'5' | '9'>(String(s?.bcsScale ?? 9) as '9');
  const [temp, setTemp] = useState(toRange(s?.refRanges.temperatureC));
  const [hr, setHr] = useState(toRange(s?.refRanges.heartRateBpm));
  const [rr, setRr] = useState(toRange(s?.refRanges.respRateRpm));
  const [fields, setFields] = useState(s?.extraFields ?? []);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return toast.error('Indica el nombre.');
    const ranges = { temperatureC: fromRange(temp), heartRateBpm: fromRange(hr), respRateRpm: fromRange(rr) };
    for (const r of Object.values(ranges)) if (r && r.min !== undefined && r.max !== undefined && r.min > r.max) return toast.error('En un rango, el mínimo no puede ser mayor que el máximo.');
    setBusy(true);
    const data = {
      name: name.trim(),
      active,
      bcsScale: Number(bcs) as 5 | 9,
      refRanges: ranges,
      extraFields: fields
        .filter((f) => f.label.trim())
        .map((f, i) => ({ ...f, key: f.key || `campo_${i}_${Date.now().toString(36)}`, label: f.label.trim(), options: f.type === 'select' ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined })),
    };
    try {
      if (s) await update('species', s.id, (cur) => ({ ...cur, ...data }));
      else await insert('species', data);
      toast.success('Especie guardada');
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
      title={s ? `Especie: ${s.name}` : 'Nueva especie'}
      size="full"
      footer={
        <Button block onClick={save} loading={busy}>
          Guardar
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Switch checked={active} onChange={setActive} label="Disponible al registrar pacientes" />
        <Field label="Escala de condición corporal">
          <Segmented
            name="Escala"
            value={bcs}
            onChange={setBcs}
            options={[
              { value: '9', label: '1 a 9' },
              { value: '5', label: '1 a 5' },
            ]}
          />
        </Field>
        <p className="text-sm font-semibold text-ink-700">Rangos de referencia (opcionales, definidos por ti)</p>
        <RangeRow label="Temperatura" unit="°C" v={temp} set={setTemp} />
        <RangeRow label="Frec. cardíaca" unit="lpm" v={hr} set={setHr} />
        <RangeRow label="Frec. respiratoria" unit="rpm" v={rr} set={setRr} />
        <p className="text-sm font-semibold text-ink-700">Campos propios de la especie</p>
        {fields.map((f, i) => (
          <div key={i} className="space-y-2 rounded-xl bg-sand-100 p-3">
            <div className="flex gap-2">
              <TextInput value={f.label} placeholder="Nombre del campo" aria-label="Nombre del campo" onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <button type="button" aria-label="Quitar campo" className="flex size-11 shrink-0 items-center justify-center text-red-700" onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                <Trash2 className="size-5" />
              </button>
            </div>
            <Select value={f.type} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, type: e.target.value as 'text' } : x)))} aria-label="Tipo de campo">
              <option value="text">Texto</option>
              <option value="select">Lista de opciones</option>
              <option value="boolean">Sí / No</option>
            </Select>
            {f.type === 'select' && (
              <TextInput
                value={(f.options ?? []).join(', ')}
                placeholder="Opciones separadas por coma"
                aria-label="Opciones"
                onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, options: e.target.value.split(',') } : x)))}
              />
            )}
          </div>
        ))}
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setFields([...fields, { key: '', label: '', type: 'text' }])}>
          Agregar campo
        </Button>
      </div>
    </Sheet>
  );
}
