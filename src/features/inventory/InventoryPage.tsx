import { useMemo, useState } from 'react';
import { Boxes, Plus, TriangleAlert } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { LinkButton } from '@/components/Button';
import { Badge, EmptyState, List, ListRow, Notice } from '@/components/Card';
import { SearchInput } from '@/components/form';
import { useTables } from '@/data/hooks';
import { INVENTORY_CATEGORY } from '@/data/labels';
import { formatDecimal } from '@/lib/numbers';
import { matchesQuery } from '@/lib/text';
import { inventoryAlerts, itemStock } from './stock';

export function InventoryPage() {
  const tables = useTables();
  const [q, setQ] = useState('');
  const alerts = useMemo(() => inventoryAlerts(tables), [tables]);
  const items = useMemo(
    () => [...tables.inventoryItems.values()].filter((i) => matchesQuery(q, i.name, i.presentation, i.concentration, INVENTORY_CATEGORY[i.category])).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es')),
    [tables, q],
  );
  return (
    <>
      <PageHeader
        title="Inventario"
        back="/mas"
        actions={
          <LinkButton to="/inventario/nuevo" size="sm" icon={<Plus className="size-4" />}>
            Producto
          </LinkButton>
        }
      />
      <Page>
        <Notice tone="neutral">Módulo opcional para medicamentos e insumos. Sus movimientos no modifican las fichas ni las recetas.</Notice>
        {alerts.length > 0 && (
          <Notice tone="warning" icon={<TriangleAlert className="size-5" />} title="Alertas de inventario">
            <ul className="list-disc pl-4">
              {alerts.map((a, i) => (
                <li key={i}>{a.text}</li>
              ))}
            </ul>
          </Notice>
        )}
        <SearchInput value={q} onChange={setQ} placeholder="Buscar producto" />
        {items.length === 0 ? (
          <EmptyState icon={<Boxes className="size-6" />} title="Sin productos" action={<LinkButton to="/inventario/nuevo">Agregar producto</LinkButton>} />
        ) : (
          <List>
            {items.map((i) => {
              const stock = itemStock(tables, i.id);
              const low = i.minStock !== undefined && stock <= i.minStock;
              return (
                <ListRow
                  key={i.id}
                  to={`/inventario/${i.id}`}
                  title={i.name}
                  subtitle={[INVENTORY_CATEGORY[i.category], i.presentation, i.concentration].filter(Boolean).join(' · ')}
                  trailing={
                    <span className="flex flex-col items-end gap-1">
                      <span className={low ? 'font-bold text-amber-800' : 'font-semibold text-ink-800'}>
                        {formatDecimal(stock)} {i.unit}
                      </span>
                      {!i.active && <Badge>Inactivo</Badge>}
                    </span>
                  }
                />
              );
            })}
          </List>
        )}
      </Page>
    </>
  );
}
