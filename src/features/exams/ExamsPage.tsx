import { useMemo, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Badge, EmptyState, List, ListRow } from '@/components/Card';
import { SearchInput, Segmented } from '@/components/form';
import { useTables } from '@/data/hooks';
import { EXAM_STATUS, EXAM_STATUS_TONE, EXAM_TYPE } from '@/data/labels';
import { formatDate } from '@/lib/dates';
import { matchesQuery } from '@/lib/text';

export function ExamsPage() {
  const tables = useTables();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'pending' | 'review' | 'all'>('pending');
  const list = useMemo(
    () =>
      [...tables.exams.values()]
        .filter((e) => (filter === 'all' ? true : filter === 'review' ? e.status === 'received' : ['requested', 'sampled', 'sent'].includes(e.status)))
        .filter((e) => matchesQuery(q, e.name, EXAM_TYPE[e.type], e.lab, tables.patients.get(e.patientId)?.name))
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [tables, q, filter],
  );
  return (
    <>
      <PageHeader title="Exámenes" back="/mas" />
      <Page>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por paciente, examen o laboratorio" />
        <Segmented
          name="Filtro"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'pending', label: 'Esperando resultado' },
            { value: 'review', label: 'Por revisar' },
            { value: 'all', label: 'Todos' },
          ]}
        />
        {list.length === 0 ? (
          <EmptyState icon={<FlaskConical className="size-6" />} title="Sin exámenes en esta vista">
            Los exámenes se registran desde la ficha del paciente o desde una consulta.
          </EmptyState>
        ) : (
          <List>
            {list.map((e) => (
              <ListRow
                key={e.id}
                to={`/examenes/${e.id}`}
                title={`${tables.patients.get(e.patientId)?.name ?? 'Paciente'} · ${e.name || EXAM_TYPE[e.type]}`}
                subtitle={[formatDate(e.requestedAt), e.lab].filter(Boolean).join(' · ')}
                trailing={<Badge tone={EXAM_STATUS_TONE[e.status]}>{EXAM_STATUS[e.status]}</Badge>}
              />
            ))}
          </List>
        )}
      </Page>
    </>
  );
}
