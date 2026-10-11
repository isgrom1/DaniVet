import { useState } from 'react';
import { Plus, Repeat } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button } from '@/components/Button';
import { Badge, EmptyState, List, ListRow, Notice } from '@/components/Card';
import { Field, IntegerInput, Select, Switch, TextArea, TextInput } from '@/components/form';
import { Sheet, toast } from '@/components/overlay';
import { useTables } from '@/data/hooks';
import { insert, update } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import type { Protocol } from '@/data/schema';

const KIND = { vaccine: 'Vacuna', deworming_internal: 'Desparasitación interna', deworming_external: 'Desparasitación externa' } as const;

export function ProtocolsSettings() {
  const tables = useTables();
  const [editing, setEditing] = useState<Protocol | 'new' | null>(null);
  const list = [...tables.protocols.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'es'));
  return (
    <>
      <PageHeader
        title="Pautas"
        back="/mas"
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Nueva
          </Button>
        }
      />
      <Page>
        <Notice tone="info">
          Define tus pautas (por ejemplo, “Refuerzo anual” cada 365 días). Al registrar una vacuna o desparasitación podrás elegir la pauta para sugerir la próxima fecha, siempre
          editable. La app no asume frecuencias por defecto.
        </Notice>
        {list.length === 0 ? (
          <EmptyState icon={<Repeat className="size-6" />} title="Sin pautas configuradas" />
        ) : (
          <List>
            {list.map((p) => (
              <ListRow
                key={p.id}
                onClick={() => setEditing(p)}
                title={p.name}
                subtitle={`${KIND[p.kind]}${p.intervalDays ? ` · cada ${p.intervalDays} días` : ''}${p.speciesId ? ` · ${tables.species.get(p.speciesId)?.name ?? ''}` : ''}`}
                trailing={!p.active ? <Badge>Inactiva</Badge> : undefined}
              />
            ))}
          </List>
        )}
      </Page>
      {editing && <ProtocolSheet p={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ProtocolSheet({ p, onClose }: { p?: Protocol; onClose: () => void }) {
  const tables = useTables();
  const [kind, setKind] = useState<Protocol['kind']>(p?.kind ?? 'vaccine');
  const [name, setName] = useState(p?.name ?? '');
  const [speciesId, setSpeciesId] = useState(p?.speciesId ?? '');
  const [intervalDays, setIntervalDays] = useState(p?.intervalDays !== undefined ? String(p.intervalDays) : '');
  const [notes, setNotes] = useState(p?.notes ?? '');
  const [active, setActive] = useState(p?.active ?? true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return toast.error('Indica el nombre.');
    setBusy(true);
    const data = { kind, name: name.trim(), speciesId: speciesId || undefined, intervalDays: intervalDays ? Number(intervalDays) : undefined, notes: notes.trim() || undefined, active };
    try {
      if (p) await update('protocols', p.id, (cur) => ({ ...cur, ...data }));
      else await insert('protocols', data);
      toast.success('Pauta guardada');
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
      title={p ? 'Editar pauta' : 'Nueva pauta'}
      footer={
        <Button block onClick={save} loading={busy}>
          Guardar
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Protocol['kind'])} aria-label="Tipo">
            {Object.entries(KIND).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nombre" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Refuerzo anual polivalente" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Especie (opcional)">
            <Select value={speciesId} onChange={(e) => setSpeciesId(e.target.value)} aria-label="Especie">
              <option value="">Todas</option>
              {[...tables.species.values()].map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Intervalo">
            <IntegerInput value={intervalDays} onChange={setIntervalDays} unit="días" />
          </Field>
        </div>
        <Field label="Notas">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} minRows={2} />
        </Field>
        <Switch checked={active} onChange={setActive} label="Activa" />
      </div>
    </Sheet>
  );
}
