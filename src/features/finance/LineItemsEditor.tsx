import { Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DecimalInput, Field, MoneyInput, Select, TextInput } from '@/components/form';
import { useTables } from '@/data/hooks';
import { CHARGE_CATEGORY } from '@/data/labels';
import type { ChargeCategory } from '@/data/schema';
import { formatCLP, formatDecimal, parseDecimal } from '@/lib/numbers';
import { newId } from '@/lib/ids';
import { byCategory, lineTotal } from './calc';

/** Ítem en edición: montos como texto para permitir escribir libremente. */
export interface LineDraft {
  id: string;
  serviceId?: string;
  description: string;
  category: ChargeCategory;
  qty: string;
  unitPrice: string;
  discount: string;
}

export function toLineItems(lines: LineDraft[]) {
  return lines
    .filter((l) => l.description.trim())
    .map((l) => ({
      id: l.id,
      serviceId: l.serviceId,
      description: l.description.trim(),
      category: l.category,
      qty: parseDecimal(l.qty) ?? 0,
      unitPriceCLP: Number(l.unitPrice || 0),
      discountCLP: Number(l.discount || 0),
    }));
}

export function fromLineItems(items: Array<{ id: string; serviceId?: string; description: string; category: ChargeCategory; qty: number; unitPriceCLP: number; discountCLP: number }>): LineDraft[] {
  return items.map((i) => ({ id: i.id, serviceId: i.serviceId, description: i.description, category: i.category, qty: formatDecimal(i.qty), unitPrice: String(i.unitPriceCLP), discount: i.discountCLP ? String(i.discountCLP) : '' }));
}

export function lineErrors(lines: LineDraft[]): string[] {
  const out: string[] = [];
  lines.forEach((l, i) => {
    if (!l.description.trim()) return;
    const q = parseDecimal(l.qty);
    if (q === null || q <= 0) out.push(`Ítem ${i + 1}: cantidad no válida`);
    const sub = Math.round((q ?? 0) * Number(l.unitPrice || 0));
    if (Number(l.discount || 0) > sub) out.push(`Ítem ${i + 1}: el descuento supera el total del ítem`);
  });
  if (!lines.some((l) => l.description.trim())) out.push('Agrega al menos un ítem');
  return out;
}

export function LineItemsEditor({ lines, onChange, globalDiscount, onGlobalDiscount }: { lines: LineDraft[]; onChange: (l: LineDraft[]) => void; globalDiscount: string; onGlobalDiscount: (v: string) => void }) {
  const tables = useTables();
  const services = [...tables.services.values()].filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const set = (i: number, p: Partial<LineDraft>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const addService = (id: string) => {
    const s = tables.services.get(id);
    if (!s) return;
    onChange([...lines.filter((l) => l.description.trim()), { id: newId(), serviceId: s.id, description: s.name, category: s.category, qty: '1', unitPrice: String(s.priceCLP), discount: '' }]);
  };
  const items = toLineItems(lines);
  const subtotal = items.reduce((s, li) => s + lineTotal(li), 0);
  const total = Math.max(0, subtotal - Number(globalDiscount || 0));
  const cats = byCategory(items);
  return (
    <div className="space-y-3">
      {services.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {services.map((s) => (
            <button key={s.id} type="button" onClick={() => addService(s.id)} className="min-h-9 rounded-full bg-white px-3 text-sm font-medium text-brand-800 ring-1 ring-brand-200 active:bg-brand-50">
              + {s.name} · {formatCLP(s.priceCLP)}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-500">
          Define tus servicios y precios en{' '}
          <Link to="/ajustes/servicios" className="font-semibold text-brand-700">
            Ajustes › Servicios
          </Link>{' '}
          para agregarlos con un toque.
        </p>
      )}
      {lines.map((l, i) => (
        <Card key={l.id} padded={false} className="space-y-2 p-3">
          <div className="flex gap-2">
            <TextInput value={l.description} placeholder="Descripción" aria-label={`Descripción ítem ${i + 1}`} onChange={(e) => set(i, { description: e.target.value })} />
            <button type="button" aria-label="Quitar ítem" className="flex size-11 shrink-0 items-center justify-center text-red-700" onClick={() => onChange(lines.filter((_, j) => j !== i))}>
              <Trash2 className="size-5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={l.category} onChange={(e) => set(i, { category: e.target.value as ChargeCategory })} aria-label="Tipo de ítem">
              {Object.entries(CHARGE_CATEGORY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Field label="">
              <DecimalInput value={l.qty} onChange={(v) => set(i, { qty: v })} unit="cant." aria-label="Cantidad" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Precio unitario">
              <MoneyInput value={l.unitPrice} onChange={(v) => set(i, { unitPrice: v })} aria-label="Precio unitario" />
            </Field>
            <Field label="Descuento">
              <MoneyInput value={l.discount} onChange={(v) => set(i, { discount: v })} aria-label="Descuento del ítem" />
            </Field>
          </div>
          <p className="text-right text-sm font-semibold tabular text-ink-700">Total ítem: {formatCLP(lineTotal({ qty: parseDecimal(l.qty) ?? 0, unitPriceCLP: Number(l.unitPrice || 0), discountCLP: Number(l.discount || 0) }))}</p>
        </Card>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => onChange([...lines, { id: newId(), description: '', category: 'fee', qty: '1', unitPrice: '', discount: '' }])}>
        Agregar ítem
      </Button>
      <Card className="space-y-1.5 text-[15px]">
        {(Object.keys(cats) as ChargeCategory[])
          .filter((k) => cats[k])
          .map((k) => (
            <div key={k} className="flex justify-between text-ink-600">
              <span>{CHARGE_CATEGORY[k]}</span>
              <span className="tabular">{formatCLP(cats[k])}</span>
            </div>
          ))}
        <div className="flex justify-between border-t border-sand-200 pt-1.5">
          <span>Subtotal</span>
          <span className="tabular">{formatCLP(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Descuento general</span>
          <div className="w-36">
            <MoneyInput value={globalDiscount} onChange={onGlobalDiscount} aria-label="Descuento general" />
          </div>
        </div>
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span className="tabular" data-testid="charge-total">
            {formatCLP(total)}
          </span>
        </div>
        {Number(globalDiscount || 0) > subtotal && <p className="text-sm font-medium text-red-700">El descuento supera el subtotal.</p>}
      </Card>
    </div>
  );
}
