import type { Tables } from '@/data/store';
import type { Charge, ChargeCategory, LineItem } from '@/data/schema';

/** Total de una línea en pesos: cantidad × precio unitario − descuento (nunca negativo). */
export function lineTotal(li: Pick<LineItem, 'qty' | 'unitPriceCLP' | 'discountCLP'>): number {
  return Math.max(0, Math.round(li.qty * li.unitPriceCLP) - (li.discountCLP || 0));
}

export function itemsSubtotal(items: Array<Pick<LineItem, 'qty' | 'unitPriceCLP' | 'discountCLP'>>): number {
  return items.reduce((s, li) => s + lineTotal(li), 0);
}

export function docTotal(doc: { items: LineItem[]; discountCLP: number }): number {
  return Math.max(0, itemsSubtotal(doc.items) - (doc.discountCLP || 0));
}

export const chargeTotal = (c: Charge) => docTotal(c);

export function paidFor(t: Tables, chargeId: string): number {
  let s = 0;
  for (const p of t.payments.values()) if (p.chargeId === chargeId && !p.voided) s += p.amountCLP;
  return s;
}

export type PaymentState = 'pending' | 'partial' | 'paid' | 'voided';

export function chargeState(t: Tables, c: Charge): PaymentState {
  if (c.voided) return 'voided';
  const total = chargeTotal(c);
  const paid = paidFor(t, c.id);
  if (paid >= total) return 'paid';
  if (paid > 0) return 'partial';
  return 'pending';
}

export function chargeBalance(t: Tables, c: Charge): number {
  if (c.voided) return 0;
  return Math.max(0, chargeTotal(c) - paidFor(t, c.id));
}

export function tutorBalance(t: Tables, tutorId: string): number {
  let s = 0;
  for (const c of t.charges.values()) if (c.tutorId === tutorId) s += chargeBalance(t, c);
  return s;
}

/** Desglose por categoría (honorarios, medicamentos, insumos, traslado, otros). El descuento global se informa aparte. */
export function byCategory(items: LineItem[]): Record<ChargeCategory, number> {
  const out: Record<ChargeCategory, number> = { fee: 0, medication: 0, supply: 0, travel: 0, other: 0 };
  for (const li of items) out[li.category] += lineTotal(li);
  return out;
}

export function pendingCharges(t: Tables) {
  return [...t.charges.values()]
    .filter((c) => !c.voided && chargeBalance(t, c) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface PeriodReport {
  billed: number;
  collected: number;
  pendingFromPeriod: number;
  byCategory: Record<ChargeCategory, number>;
  discounts: number;
  expenses: number;
  expensesByCategory: Record<string, number>;
  km: number;
  net: number;
  charges: number;
  payments: number;
}

/** Resumen de un período [from, to] (fechas 'AAAA-MM-DD', inclusivas). Ingresos = pagos recibidos en el período. */
export function periodReport(t: Tables, from: string, to: string): PeriodReport {
  const r: PeriodReport = {
    billed: 0,
    collected: 0,
    pendingFromPeriod: 0,
    byCategory: { fee: 0, medication: 0, supply: 0, travel: 0, other: 0 },
    discounts: 0,
    expenses: 0,
    expensesByCategory: {},
    km: 0,
    net: 0,
    charges: 0,
    payments: 0,
  };
  for (const c of t.charges.values()) {
    if (c.voided || c.date < from || c.date > to) continue;
    r.charges++;
    r.billed += chargeTotal(c);
    r.discounts += c.discountCLP + c.items.reduce((s, li) => s + (li.discountCLP || 0), 0);
    const cat = byCategory(c.items);
    for (const k of Object.keys(cat) as ChargeCategory[]) r.byCategory[k] += cat[k];
    r.pendingFromPeriod += chargeBalance(t, c);
  }
  for (const p of t.payments.values()) {
    if (p.voided || p.date < from || p.date > to) continue;
    r.payments++;
    r.collected += p.amountCLP;
  }
  for (const e of t.expenses.values()) {
    if (e.date < from || e.date > to) continue;
    r.expenses += e.amountCLP;
    r.expensesByCategory[e.category] = (r.expensesByCategory[e.category] ?? 0) + e.amountCLP;
    r.km += e.km ?? 0;
  }
  r.net = r.collected - r.expenses;
  return r;
}
