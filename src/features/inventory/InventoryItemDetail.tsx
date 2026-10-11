import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, Pencil } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button, LinkButton } from '@/components/Button';
import { Badge, Card, KeyValue, List, ListRow, Notice, Section } from '@/components/Card';
import { DateInput, DecimalInput, Field, MoneyInput, Select, TextInput } from '@/components/form';
import { Sheet, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { batch } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { INVENTORY_CATEGORY, MOVEMENT_TYPE } from '@/data/labels';
import type { InventoryItem, MovementType } from '@/data/schema';
import { formatDate, todayISO } from '@/lib/dates';
import { formatDecimal, parseDecimal } from '@/lib/numbers';
import { itemStock, lotStock, signedQty } from './stock';

export function InventoryItemDetail() {
  const { id = '' } = useParams();
  const tables = useTables();
  const item = tables.inventoryItems.get(id);
  const [mov, setMov] = useState<'in' | 'out' | null>(null);
  if (!item) {
    return (
      <>
        <PageHeader title="Producto" back="/inventario" />
        <Page>
          <Notice tone="warning">No se encontró este producto.</Notice>
        </Page>
      </>
    );
  }
  const lots = [...tables.inventoryLots.values()].filter((l) => l.itemId === id).sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999'));
  const moves = [...tables.inventoryMovements.values()].filter((m) => m.itemId === id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const stock = itemStock(tables, id);
  const today = todayISO();
  return (
    <>
      <PageHeader
        title={item.name}
        back="/inventario"
        actions={
          <LinkButton to={`/inventario/${item.id}/editar`} size="sm" variant="ghost" icon={<Pencil className="size-4" />}>
            Editar
          </LinkButton>
        }
      />
      <Page>
        <Card className="space-y-2">
          <p className="text-2xl font-bold tabular">
            {formatDecimal(stock)} {item.unit}
          </p>
          {item.minStock !== undefined && stock <= item.minStock && <Badge tone="warning">Stock bajo (mínimo {formatDecimal(item.minStock)})</Badge>}
          <dl className="divide-y divide-sand-100">
            <KeyValue label="Categoría" value={INVENTORY_CATEGORY[item.category]} />
            <KeyValue label="Presentación" value={item.presentation} />
            <KeyValue label="Concentración" value={item.concentration} />
            <KeyValue label="Notas" value={item.notes} />
          </dl>
        </Card>
        <div className="grid grid-cols-2 gap-2">
          <Button icon={<ArrowDownToLine className="size-4" />} onClick={() => setMov('in')}>
            Entrada
          </Button>
          <Button variant="secondary" icon={<ArrowUpFromLine className="size-4" />} onClick={() => setMov('out')}>
            Salida / ajuste
          </Button>
        </div>
        <Section title="Lotes">
          {lots.length === 0 ? (
            <p className="px-1 text-sm text-ink-500">Sin lotes registrados.</p>
          ) : (
            <List>
              {lots.map((l) => {
                const s = lotStock(tables, l.id);
                const expired = l.expiryDate && l.expiryDate < today;
                return (
                  <ListRow
                    key={l.id}
                    title={`Lote ${l.lotNumber || '—'}`}
                    subtitle={l.expiryDate ? `Vence ${formatDate(l.expiryDate)}` : 'Sin vencimiento registrado'}
                    trailing={
                      <span className="flex flex-col items-end gap-1">
                        <span className="font-semibold">
                          {formatDecimal(s)} {item.unit}
                        </span>
                        {expired && s > 0 && <Badge tone="danger">Vencido</Badge>}
                      </span>
                    }
                  />
                );
              })}
            </List>
          )}
        </Section>
        <Section title="Movimientos">
          {moves.length === 0 ? (
            <p className="px-1 text-sm text-ink-500">Sin movimientos.</p>
          ) : (
            <List>
              {moves.map((m) => {
                const q = signedQty(m);
                const p = m.patientId ? tables.patients.get(m.patientId) : undefined;
                return (
                  <ListRow
                    key={m.id}
                    title={`${MOVEMENT_TYPE[m.type]} · ${q > 0 ? '+' : ''}${formatDecimal(q)} ${item.unit}`}
                    subtitle={[formatDate(m.date), m.lotId ? `Lote ${tables.inventoryLots.get(m.lotId)?.lotNumber ?? ''}` : '', p ? `Paciente: ${p.name}` : '', m.notes].filter(Boolean).join(' · ')}
                    trailing={m.consultationId ? <Link to={`/consultas/${m.consultationId}`} className="text-sm text-brand-700">Consulta</Link> : undefined}
                    chevron={false}
                  />
                );
              })}
            </List>
          )}
        </Section>
      </Page>
      {mov && <MovementSheet item={item} mode={mov} onClose={() => setMov(null)} />}
    </>
  );
}

function MovementSheet({ item, mode, onClose }: { item: InventoryItem; mode: 'in' | 'out'; onClose: () => void }) {
  const tables = useTables();
  const lots = [...tables.inventoryLots.values()].filter((l) => l.itemId === item.id);
  const [type, setType] = useState<MovementType>(mode === 'in' ? 'in' : 'out');
  const [date, setDate] = useState(todayISO());
  const [qty, setQty] = useState('');
  const [lotId, setLotId] = useState(lots[0]?.id ?? '');
  const [newLot, setNewLot] = useState(mode === 'in' && lots.length === 0);
  const [lotNumber, setLotNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const n = parseDecimal(qty);
  const save = async () => {
    if (n === null || n === 0 || (type !== 'adjust' && n < 0)) {
      toast.error(type === 'adjust' ? 'Indica la cantidad del ajuste (positiva o negativa).' : 'Indica una cantidad mayor que 0.');
      return;
    }
    setBusy(true);
    try {
      const b = batch();
      let lid = lotId || undefined;
      if (mode === 'in' && newLot) {
        lid = b.insert('inventoryLots', { itemId: item.id, lotNumber: lotNumber.trim() || undefined, expiryDate: expiry || undefined }).id;
      }
      b.insert('inventoryMovements', { itemId: item.id, lotId: lid, date, type, quantity: n, unitCostCLP: cost ? Number(cost) : undefined, notes: notes.trim() || undefined });
      await b.commit();
      toast.success('Movimiento registrado');
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
      title={mode === 'in' ? 'Entrada de stock' : 'Salida o ajuste'}
      footer={
        <Button block onClick={save} loading={busy}>
          Registrar
        </Button>
      }
    >
      <div className="space-y-4">
        {mode === 'out' && (
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as MovementType)} aria-label="Tipo de movimiento">
              {(['out', 'use', 'expired', 'loss', 'adjust'] as MovementType[]).map((t) => (
                <option key={t} value={t}>
                  {MOVEMENT_TYPE[t]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <DateInput value={date} onChange={setDate} clearable={false} />
          </Field>
          <Field label={`Cantidad (${item.unit})`} hint={type === 'adjust' ? 'Negativa para restar.' : undefined}>
            <DecimalInput value={qty} onChange={setQty} />
          </Field>
        </div>
        {mode === 'in' && lots.length > 0 && (
          <Field label="Lote">
            <Select value={newLot ? '__new' : lotId} onChange={(e) => (e.target.value === '__new' ? setNewLot(true) : (setNewLot(false), setLotId(e.target.value)))} aria-label="Lote">
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber || 'Sin número'}
                  {l.expiryDate ? ` · vence ${formatDate(l.expiryDate)}` : ''}
                </option>
              ))}
              <option value="__new">Nuevo lote…</option>
            </Select>
          </Field>
        )}
        {mode === 'in' && newLot && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="N.º de lote">
              <TextInput value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} autoCapitalize="characters" />
            </Field>
            <Field label="Vencimiento del producto">
              <DateInput value={expiry} onChange={setExpiry} />
            </Field>
          </div>
        )}
        {mode === 'out' && lots.length > 0 && (
          <Field label="Lote">
            <Select value={lotId} onChange={(e) => setLotId(e.target.value)} aria-label="Lote">
              <option value="">Sin lote</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber || 'Sin número'} · stock {formatDecimal(lotStock(tables, l.id))}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {mode === 'in' && (
          <Field label="Costo unitario (opcional)">
            <MoneyInput value={cost} onChange={setCost} aria-label="Costo unitario" />
          </Field>
        )}
        <Field label="Notas">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
