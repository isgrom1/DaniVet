import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Section } from '@/components/Card';
import { DecimalInput, Field, Select, Switch, TextArea, TextInput } from '@/components/form';
import { toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { insert, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { INVENTORY_CATEGORY } from '@/data/labels';
import type { InventoryItem } from '@/data/schema';
import { formatDecimal, parseDecimal } from '@/lib/numbers';
import { emptyToUndef } from '@/lib/objects';

export function InventoryItemForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tables = useTables();
  const existing = id ? tables.inventoryItems.get(id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState<InventoryItem['category']>(existing?.category ?? 'medication');
  const [presentation, setPresentation] = useState(existing?.presentation ?? '');
  const [concentration, setConcentration] = useState(existing?.concentration ?? '');
  const [unit, setUnit] = useState(existing?.unit ?? 'unidad');
  const [minStock, setMinStock] = useState(existing?.minStock !== undefined ? formatDecimal(existing.minStock) : '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || !unit.trim()) {
      toast.error('Indica el nombre y la unidad de stock.');
      return;
    }
    const min = minStock ? parseDecimal(minStock) : null;
    if (minStock && (min === null || min < 0)) {
      toast.error('Stock mínimo no válido.');
      return;
    }
    setBusy(true);
    const data = { name: name.trim(), category, presentation: emptyToUndef(presentation), concentration: emptyToUndef(concentration), unit: unit.trim(), minStock: min ?? undefined, active, notes: emptyToUndef(notes) };
    try {
      const rec = existing ? await update('inventoryItems', existing.id, (cur) => ({ ...cur, ...data })) : await insert('inventoryItems', data);
      toast.success('Producto guardado');
      navigate(`/inventario/${rec.id}`, { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title={existing ? 'Editar producto' : 'Nuevo producto'} back={existing ? `/inventario/${existing.id}` : '/inventario'} />
      <Page>
        <Section title="Producto">
          <Card className="space-y-4">
            <Field label="Nombre" required>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Categoría">
              <Select value={category} onChange={(e) => setCategory(e.target.value as InventoryItem['category'])} aria-label="Categoría">
                {Object.entries(INVENTORY_CATEGORY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Presentación">
                <TextInput value={presentation} onChange={(e) => setPresentation(e.target.value)} placeholder="Frasco 20 mL" />
              </Field>
              <Field label="Concentración">
                <TextInput value={concentration} onChange={(e) => setConcentration(e.target.value)} placeholder="50 mg/mL" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unidad de stock" required hint="Ej.: unidad, dosis, mL, comprimido.">
                <TextInput value={unit} onChange={(e) => setUnit(e.target.value)} list="units" />
                <datalist id="units">
                  {['unidad', 'dosis', 'mL', 'comprimido', 'frasco', 'caja', 'pipeta', 'ampolla'].map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </Field>
              <Field label="Stock mínimo (alerta)">
                <DecimalInput value={minStock} onChange={setMinStock} />
              </Field>
            </div>
            <Switch checked={active} onChange={setActive} label="Producto activo" />
            <Field label="Notas">
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} minRows={2} />
            </Field>
          </Card>
        </Section>
      </Page>
      <StickyActions>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
        <Button block onClick={save} loading={busy}>
          Guardar
        </Button>
      </StickyActions>
    </>
  );
}
