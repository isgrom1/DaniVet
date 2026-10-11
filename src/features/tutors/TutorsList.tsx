import { useMemo, useState } from 'react';
import { Plus, UsersRound } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { LinkButton } from '@/components/Button';
import { EmptyState, List, ListRow, Badge } from '@/components/Card';
import { SearchInput } from '@/components/form';
import { useTables } from '@/data/hooks';
import { formatPhone } from '@/lib/phone';
import { formatCLP } from '@/lib/numbers';
import { matchesQuery, initials } from '@/lib/text';
import { patientsOfTutor } from '@/features/patients/selectors';
import { tutorBalance } from '@/features/finance/calc';

export function TutorsList() {
  const tables = useTables();
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    return [...tables.tutors.values()]
      .filter((t) => !t.mergedIntoId)
      .map((t) => ({ t, pets: patientsOfTutor(tables, t.id) }))
      .filter(({ t, pets }) =>
        matchesQuery(q, t.fullName, t.phone, t.phoneAlt, t.email, t.rut, ...t.addresses.flatMap((a) => [a.street, a.comuna]), ...pets.map((p) => p.name)),
      )
      .sort((a, b) => a.t.fullName.localeCompare(b.t.fullName, 'es'));
  }, [tables, q]);

  return (
    <>
      <PageHeader
        title="Tutores"
        back="/mas"
        actions={
          <LinkButton to="/tutores/nuevo" size="sm" icon={<Plus className="size-4" />}>
            Nuevo
          </LinkButton>
        }
      />
      <Page>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre, teléfono, comuna o mascota" />
        {rows.length === 0 ? (
          <EmptyState icon={<UsersRound className="size-6" />} title={q ? 'Sin resultados' : 'Aún no hay tutores'} action={!q && <LinkButton to="/tutores/nuevo">Registrar tutor</LinkButton>}>
            {q ? 'Prueba con otra palabra o revisa la ortografía.' : 'Registra a los tutores para asociarles sus mascotas.'}
          </EmptyState>
        ) : (
          <List>
            {rows.map(({ t, pets }) => {
              const debt = tutorBalance(tables, t.id);
              const primary = t.addresses.find((a) => a.primary) ?? t.addresses[0];
              return (
                <ListRow
                  key={t.id}
                  to={`/tutores/${t.id}`}
                  leading={<span className="flex size-10 items-center justify-center rounded-full bg-sand-200 text-sm font-bold text-ink-700">{initials(t.fullName)}</span>}
                  title={t.fullName}
                  subtitle={[t.phone && formatPhone(t.phone), primary?.comuna].filter(Boolean).join(' · ')}
                  meta={
                    <>
                      {pets.slice(0, 3).map((p) => (
                        <Badge key={p.id} tone="brand">
                          {p.name}
                        </Badge>
                      ))}
                      {pets.length > 3 && <Badge>+{pets.length - 3}</Badge>}
                      {t.demo && <Badge tone="accent">DEMO</Badge>}
                      {debt > 0 && <Badge tone="warning">Debe {formatCLP(debt)}</Badge>}
                      {t.anonymizedAt && <Badge>Anonimizado</Badge>}
                    </>
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
