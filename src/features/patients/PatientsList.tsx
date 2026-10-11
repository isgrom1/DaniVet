import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PawPrint, Plus, UsersRound } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { LinkButton } from '@/components/Button';
import { Badge, EmptyState, List, ListRow } from '@/components/Card';
import { SearchInput, Select } from '@/components/form';
import { useTables } from '@/data/hooks';
import { matchesQuery } from '@/lib/text';
import { formatDate } from '@/lib/dates';
import { patientAlerts, patientSubtitle, primaryTutor } from './selectors';
import { PatientAvatar } from '@/features/attachments/AttachmentViews';

export function PatientsList() {
  const tables = useTables();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const species = params.get('especie') ?? '';
  const status = params.get('estado') ?? 'active';
  const sort = params.get('orden') ?? 'name';

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const lastVisit = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of tables.consultations.values()) {
      if (c.status === 'voided') continue;
      const prev = m.get(c.patientId);
      if (!prev || c.startedAt > prev) m.set(c.patientId, c.startedAt);
    }
    return m;
  }, [tables]);

  const rows = useMemo(() => {
    const list = [...tables.patients.values()].filter((p) => {
      if (species && p.speciesId !== species) return false;
      if (status && status !== 'all' && p.status !== status) return false;
      const tutor = primaryTutor(tables, p);
      return matchesQuery(q, p.name, p.breed, p.microchip, p.color, tutor?.fullName, tutor?.phone, tables.species.get(p.speciesId)?.name);
    });
    if (sort === 'recent') return list.sort((a, b) => (lastVisit.get(b.id) ?? '').localeCompare(lastVisit.get(a.id) ?? ''));
    return list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [tables, q, species, status, sort, lastVisit]);

  const speciesList = [...tables.species.values()].filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <>
      <PageHeader
        title="Pacientes"
        large
        actions={
          <>
            <LinkButton to="/tutores" size="sm" variant="ghost" icon={<UsersRound className="size-4" />}>
              Tutores
            </LinkButton>
            <LinkButton to="/pacientes/nuevo" size="sm" icon={<Plus className="size-4" />}>
              Nuevo
            </LinkButton>
          </>
        }
      />
      <Page>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre, tutor, raza o microchip" />
        <div className="grid grid-cols-3 gap-2">
          <Select value={species} onChange={(e) => setParam('especie', e.target.value)} aria-label="Filtrar por especie" className="min-h-10 py-1.5 text-sm">
            <option value="">Todas las especies</option>
            {speciesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setParam('estado', e.target.value)} aria-label="Filtrar por estado" className="min-h-10 py-1.5 text-sm">
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
            <option value="deceased">Fallecidos</option>
            <option value="all">Todos</option>
          </Select>
          <Select value={sort} onChange={(e) => setParam('orden', e.target.value)} aria-label="Ordenar" className="min-h-10 py-1.5 text-sm">
            <option value="name">Por nombre</option>
            <option value="recent">Atención reciente</option>
          </Select>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={<PawPrint className="size-6" />}
            title={tables.patients.size ? 'Sin resultados' : 'Aún no hay pacientes'}
            action={!tables.patients.size && <LinkButton to="/pacientes/nuevo">Registrar paciente</LinkButton>}
          >
            {tables.patients.size ? 'Prueba con otra búsqueda o cambia los filtros.' : 'Registra a tu primer paciente y su tutor.'}
          </EmptyState>
        ) : (
          <List>
            {rows.map((p) => {
              const alerts = patientAlerts(p).filter((a) => a.level === 'critical');
              const lv = lastVisit.get(p.id);
              return (
                <ListRow
                  key={p.id}
                  to={`/pacientes/${p.id}`}
                  leading={<PatientAvatar patient={p} />}
                  title={p.name}
                  subtitle={`${patientSubtitle(tables, p)} · ${primaryTutor(tables, p)?.fullName ?? 'Sin tutor'}`}
                  trailing={lv ? <span className="text-xs">{formatDate(lv)}</span> : undefined}
                  meta={
                    alerts.length || p.demo || p.status !== 'active' ? (
                      <>
                        {alerts.length > 0 && <Badge tone="danger">{alerts.length === 1 ? '1 alerta' : `${alerts.length} alertas`}</Badge>}
                        {p.status === 'deceased' && <Badge>Fallecido</Badge>}
                        {p.status === 'inactive' && <Badge>Inactivo</Badge>}
                        {p.demo && <Badge tone="accent">DEMO</Badge>}
                      </>
                    ) : undefined
                  }
                />
              );
            })}
          </List>
        )}
        <p className="px-1 text-center text-xs text-ink-500">{rows.length} paciente(s)</p>
      </Page>
    </>
  );
}
