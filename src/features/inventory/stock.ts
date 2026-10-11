import type { Tables } from '@/data/store';
import type { InventoryMovement } from '@/data/schema';
import { addDays, todayISO } from '@/lib/dates';

/** Signo de cada tipo de movimiento: entradas suman; salidas, usos, bajas y pérdidas restan; ajustes con su signo. */
export function signedQty(m: Pick<InventoryMovement, 'type' | 'quantity'>): number {
  if (m.type === 'in') return Math.abs(m.quantity);
  if (m.type === 'adjust') return m.quantity;
  return -Math.abs(m.quantity);
}

export function itemStock(t: Tables, itemId: string): number {
  let s = 0;
  for (const m of t.inventoryMovements.values()) if (m.itemId === itemId) s += signedQty(m);
  return Math.round(s * 1000) / 1000;
}

export function lotStock(t: Tables, lotId: string): number {
  let s = 0;
  for (const m of t.inventoryMovements.values()) if (m.lotId === lotId) s += signedQty(m);
  return Math.round(s * 1000) / 1000;
}

export interface InventoryAlert {
  kind: 'low' | 'expired' | 'expiring';
  itemId: string;
  lotId?: string;
  text: string;
}

export function inventoryAlerts(t: Tables, expiringDays = 60): InventoryAlert[] {
  const out: InventoryAlert[] = [];
  const today = todayISO();
  const soon = addDays(today, expiringDays);
  for (const item of t.inventoryItems.values()) {
    if (!item.active) continue;
    const stock = itemStock(t, item.id);
    if (item.minStock !== undefined && stock <= item.minStock) {
      out.push({ kind: 'low', itemId: item.id, text: `${item.name}: stock ${stock} ${item.unit} (mínimo ${item.minStock})` });
    }
    for (const lot of t.inventoryLots.values()) {
      if (lot.itemId !== item.id || !lot.expiryDate) continue;
      const ls = lotStock(t, lot.id);
      if (ls <= 0) continue;
      if (lot.expiryDate < today) out.push({ kind: 'expired', itemId: item.id, lotId: lot.id, text: `${item.name} lote ${lot.lotNumber ?? '—'}: vencido (${ls} ${item.unit})` });
      else if (lot.expiryDate <= soon) out.push({ kind: 'expiring', itemId: item.id, lotId: lot.id, text: `${item.name} lote ${lot.lotNumber ?? '—'}: vence pronto (${ls} ${item.unit})` });
    }
  }
  return out;
}
