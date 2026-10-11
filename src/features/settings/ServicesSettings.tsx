import { useState } from 'react';
import { Plus, Tags } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button } from '@/components/Button';
import { Badge, EmptyState, List, ListRow, Notice, Section } from '@/components/Card';
import { Field, IntegerInput, MoneyInput, Select, Switch, TextArea, TextInput } from '@/components/form';
import { Sheet, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { insert, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { CHARGE_CATEGORY } from '@/data/labels';
import { SUGGESTED_SERVICES } from '@/data/defaults';
import type { ChargeCategory, Service } from '@/data/schema';
import { formatCLP } from '@/lib/numbers';

export function ServicesSettings() {
  const tables = useTables();
  const [editing, setEditing] = useState<Service | Partial<Service> | null>(null);
  const list = [...tables.services.values()].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'));
  const missing = SUGGESTED_SERVICES.filter((s) => !list.some((x) => x.name.toLowerCase() === s.name.toLowerCase()));
  return (
    <>
      <PageHeader
        title="Servicios y precios"
        back="/mas"
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing({ category: 'fee', active: true })}>
            Nuevo
          </Button>
        }
      />
      <Page>
        {list.length === 0 ? (
          <EmptyState icon={<Tags className="size-6" />} title="Aún no hay servicios">
            Define tus servicios con su precio para agregarlos rápido a los cobros.
          </EmptyState>
        ) : (
          <List>
            {list.map((s) => (
              <ListRow
                key={s.id}
                onClick={() => setEditing(s)}
                title={s.name}
                subtitle={`${CHARGE_CATEGORY[s.category]}${s.durationMin ? ` · ${s.durationMin} min` : ''}`}
                trailing={
                  <span className="flex flex-col items-end gap-1">
                    <span className="font-semibold tabular text-ink-800">{formatCLP(s.priceCLP)}</span>
                    {!s.active && <Badge>Inactivo</Badge>}
                  </span>
                }
              />
            ))}
          </List>
        )}
        {missing.length > 0 && (
          <Section title="Sugerencias (debes indicar tu precio)">
            <div className="flex flex-wrap gap-2">
              {missing.map((s) => (
                <button key={s.name} type="button" className="min-h-10 rounded-full bg-white px-3 text-sm font-medium ring-1 ring-sand-300" onClick={() => setEditing({ name: s.name, category: s.category, durationMin: s.durationMin, active: true })}>
                  + {s.name}
                </button>
              ))}
            </div>
          </Section>
        )}
        <Notice tone="neutral">La duración estimada se usa como sugerencia al agendar. Los precios no se modifican en cobros ya registrados.</Notice>
      </Page>
      {editing && <ServiceSheet s={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ServiceSheet({ s, onClose }: { s: Service | Partial<Service>; onClose: () => void }) {
  const existing = 'id' in s && s.id ? (s as Service) : undefined;
  const [name, setName] = useState(s.name ?? '');
  const [category, setCategory] = useState<ChargeCategory>(s.category ?? 'fee');
  const [price, setPrice] = useState(s.priceCLP !== undefined ? String(s.priceCLP) : '');
  const [duration, setDuration] = useState(s.durationMin !== undefined ? String(s.durationMin) : '');
  const [description, setDescription] = useState(s.description ?? '');
  const [active, setActive] = useState(s.active ?? true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || price === '') {
      toast.error('Indica nombre y precio.');
      return;
    }
    setBusy(true);
    const data = { name: name.trim(), category, priceCLP: Number(price), durationMin: duration ? Number(duration) : undefined, description: description.trim() || undefined, active };
    try {
      if (existing) await update('services', existing.id, (cur) => ({ ...cur, ...data }));
      else await insert('services', data);
      toast.success('Servicio guardado');
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
      title={existing ? 'Editar servicio' : 'Nuevo servicio'}
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
        <Field label="Tipo">
          <Select value={category} onChange={(e) => setCategory(e.target.value as ChargeCategory)} aria-label="Tipo">
            {Object.entries(CHARGE_CATEGORY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio" required>
            <MoneyInput value={price} onChange={setPrice} aria-label="Precio" />
          </Field>
          <Field label="Duración estimada">
            <IntegerInput value={duration} onChange={setDuration} unit="min" />
          </Field>
        </div>
        <Field label="Descripción">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} minRows={2} />
        </Field>
        <Switch checked={active} onChange={setActive} label="Activo" />
      </div>
    </Sheet>
  );
}
