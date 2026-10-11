import { useMemo } from 'react';
import { Field, Select, TextInput, DecimalInput } from '@/components/form';
import { Notice } from '@/components/Card';
import { useTables } from '@/data/hooks';
import type { Protocol } from '@/data/schema';
import { addDays, formatDate } from '@/lib/dates';
import { lotStock } from '@/features/inventory/stock';

/** Selector de pauta: sugiere la próxima fecha según el intervalo que definió la profesional (siempre editable). */
export function ProtocolPicker({
  kind,
  speciesId,
  value,
  onChange,
  baseDate,
}: {
  kind: Protocol['kind'] | Protocol['kind'][];
  speciesId?: string;
  value: string;
  onChange: (protocolId: string, suggestedDate?: string) => void;
  baseDate: string;
}) {
  const tables = useTables();
  const kinds = Array.isArray(kind) ? kind : [kind];
  const list = [...tables.protocols.values()].filter((p) => p.active && kinds.includes(p.kind) && (!p.speciesId || p.speciesId === speciesId));
  if (!list.length)
    return (
      <p className="text-sm text-ink-500">
        No tienes pautas configuradas. Puedes definirlas en Ajustes › Pautas para que la app sugiera la próxima fecha.
      </p>
    );
  return (
    <Field label="Pauta aplicada (opcional)" hint={value ? 'La fecha sugerida es editable.' : undefined}>
      <Select
        value={value}
        aria-label="Pauta"
        onChange={(e) => {
          const p = list.find((x) => x.id === e.target.value);
          onChange(e.target.value, p?.intervalDays ? addDays(baseDate, p.intervalDays) : undefined);
        }}
      >
        <option value="">Sin pauta</option>
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.intervalDays ? ` (cada ${p.intervalDays} días)` : ''}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export interface InventoryChoice {
  itemId: string;
  lotId: string;
  qty: string;
}

/** Descuento opcional del inventario. El movimiento queda vinculado, pero no modifica la ficha clínica. */
export function InventoryPicker({ categories, value, onChange, onLotPicked }: { categories: string[]; value: InventoryChoice; onChange: (v: InventoryChoice) => void; onLotPicked?: (lot: { lotNumber?: string; expiryDate?: string }) => void }) {
  const tables = useTables();
  const items = useMemo(() => [...tables.inventoryItems.values()].filter((i) => i.active && categories.includes(i.category)), [tables, categories]);
  const lots = [...tables.inventoryLots.values()].filter((l) => l.itemId === value.itemId);
  if (!items.length) return <p className="text-sm text-ink-500">Sin productos de inventario de este tipo.</p>;
  const item = tables.inventoryItems.get(value.itemId);
  return (
    <div className="space-y-3">
      <Field label="Producto del inventario">
        <Select value={value.itemId} onChange={(e) => onChange({ itemId: e.target.value, lotId: '', qty: value.qty || '1' })} aria-label="Producto del inventario">
          <option value="">No descontar del inventario</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      </Field>
      {value.itemId && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lote">
            <Select
              value={value.lotId}
              aria-label="Lote"
              onChange={(e) => {
                onChange({ ...value, lotId: e.target.value });
                const lot = tables.inventoryLots.get(e.target.value);
                if (lot) onLotPicked?.({ lotNumber: lot.lotNumber, expiryDate: lot.expiryDate });
              }}
            >
              <option value="">Sin lote</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber || 'Sin número'}
                  {l.expiryDate ? ` · vence ${formatDate(l.expiryDate)}` : ''} · stock {lotStock(tables, l.id)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Cantidad (${item?.unit ?? 'unidad'})`}>
            <DecimalInput value={value.qty} onChange={(v) => onChange({ ...value, qty: v })} />
          </Field>
        </div>
      )}
      {value.itemId && <Notice tone="neutral">Al guardar se registrará una salida de inventario vinculada a este paciente.</Notice>}
    </div>
  );
}

export function ExpiryWarning({ productExpiry, applicationDate }: { productExpiry?: string; applicationDate: string }) {
  if (!productExpiry || productExpiry >= applicationDate) return null;
  return (
    <Notice tone="danger" title="Producto vencido">
      La fecha de vencimiento del producto ({formatDate(productExpiry)}) es anterior a la fecha de aplicación. Verifica el envase.
    </Notice>
  );
}

export { TextInput };
