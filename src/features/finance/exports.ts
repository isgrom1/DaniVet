import type { Tables } from '@/data/store';
import { CHARGE_CATEGORY, EXPENSE_CATEGORY, PAYMENT_STATUS } from '@/data/labels';
import { toCSV } from '@/lib/csv';
import { byCategory, chargeBalance, chargeState, chargeTotal, paidFor } from './calc';

const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

export function chargesCsv(t: Tables, from: string, to: string): string {
  const rows = [...t.charges.values()]
    .filter((c) => inRange(c.date, from, to))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => {
      const cat = byCategory(c.items);
      return [
        c.date,
        c.id.slice(0, 8).toUpperCase(),
        t.tutors.get(c.tutorId)?.fullName ?? '',
        c.patientId ? (t.patients.get(c.patientId)?.name ?? '') : '',
        cat.fee,
        cat.medication,
        cat.supply,
        cat.travel,
        cat.other,
        c.discountCLP,
        chargeTotal(c),
        paidFor(t, c.id),
        chargeBalance(t, c),
        PAYMENT_STATUS[chargeState(t, c)],
        c.items.map((i) => i.description).join(' | '),
      ];
    });
  return toCSV(
    ['Fecha', 'N.º interno', 'Tutor', 'Paciente', CHARGE_CATEGORY.fee, CHARGE_CATEGORY.medication, CHARGE_CATEGORY.supply, CHARGE_CATEGORY.travel, CHARGE_CATEGORY.other, 'Descuento general', 'Total', 'Pagado', 'Saldo', 'Estado', 'Detalle'],
    rows,
  );
}

export function paymentsCsv(t: Tables, from: string, to: string): string {
  const rows = [...t.payments.values()]
    .filter((p) => inRange(p.date, from, to))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => [p.date, t.tutors.get(p.tutorId)?.fullName ?? '', p.amountCLP, p.methodName, p.reference ?? '', p.chargeId.slice(0, 8).toUpperCase(), p.voided ? 'Anulado' : 'Vigente', p.voidReason ?? '']);
  return toCSV(['Fecha', 'Tutor', 'Monto', 'Medio de pago', 'Referencia', 'Cobro', 'Estado', 'Motivo anulación'], rows);
}

export function expensesCsv(t: Tables, from: string, to: string): string {
  const rows = [...t.expenses.values()]
    .filter((e) => inRange(e.date, from, to))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, EXPENSE_CATEGORY[e.category], e.description, e.amountCLP, e.km ?? '', e.notes ?? '']);
  return toCSV(['Fecha', 'Categoría', 'Descripción', 'Monto', 'Km', 'Notas'], rows);
}
