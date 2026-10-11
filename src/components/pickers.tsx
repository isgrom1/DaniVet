import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, UserRound } from 'lucide-react';
import { Sheet } from './overlay';
import { SearchInput } from './form';
import { List, ListRow, Badge } from './Card';
import { useTables } from '@/data/hooks';
import type { Patient, Tutor } from '@/data/schema';
import { formatPhone } from '@/lib/phone';
import { matchesQuery } from '@/lib/text';
import { patientsOfTutor, patientSubtitle, primaryTutor } from '@/features/patients/selectors';
import { PatientAvatar } from '@/features/attachments/AttachmentViews';

export function TutorPickerSheet({ onPick, onClose, newHref }: { onPick: (t: Tutor) => void; onClose: () => void; newHref?: string }) {
  const tables = useTables();
  const [q, setQ] = useState('');
  const list = useMemo(
    () =>
      [...tables.tutors.values()]
        .filter((t) => !t.mergedIntoId && !t.anonymizedAt)
        .filter((t) => matchesQuery(q, t.fullName, t.phone, t.email, ...patientsOfTutor(tables, t.id).map((p) => p.name)))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))
        .slice(0, 50),
    [tables, q],
  );
  return (
    <Sheet open onClose={onClose} title="Elegir tutor" size="full">
      <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre, teléfono o mascota" autoFocus />
      {newHref && (
        <Link to={newHref} className="mt-3 flex min-h-12 items-center gap-2 rounded-xl border border-dashed border-brand-300 px-4 font-semibold text-brand-700">
          <Plus className="size-5" /> Registrar tutor nuevo
        </Link>
      )}
      <List className="mt-3">
        {list.map((t) => (
          <ListRow
            key={t.id}
            onClick={() => onPick(t)}
            leading={<UserRound className="size-5 text-ink-400" />}
            title={t.fullName}
            subtitle={[t.phone && formatPhone(t.phone), patientsOfTutor(tables, t.id).map((p) => p.name).join(', ')].filter(Boolean).join(' · ')}
          />
        ))}
        {list.length === 0 && <p className="p-4 text-sm text-ink-500">Sin resultados.</p>}
      </List>
    </Sheet>
  );
}

export function PatientPickerSheet({
  onPick,
  onClose,
  title = 'Elegir paciente',
  filter,
  newHref,
}: {
  onPick: (p: Patient) => void;
  onClose: () => void;
  title?: string;
  filter?: (p: Patient) => boolean;
  newHref?: string;
}) {
  const tables = useTables();
  const [q, setQ] = useState('');
  const list = useMemo(
    () =>
      [...tables.patients.values()]
        .filter((p) => (filter ? filter(p) : true))
        .filter((p) => matchesQuery(q, p.name, p.breed, p.microchip, primaryTutor(tables, p)?.fullName, tables.species.get(p.speciesId)?.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .slice(0, 60),
    [tables, q, filter],
  );
  return (
    <Sheet open onClose={onClose} title={title} size="full">
      <SearchInput value={q} onChange={setQ} placeholder="Buscar paciente, tutor o microchip" autoFocus />
      {newHref && (
        <Link to={newHref} className="mt-3 flex min-h-12 items-center gap-2 rounded-xl border border-dashed border-brand-300 px-4 font-semibold text-brand-700">
          <Plus className="size-5" /> Registrar paciente nuevo
        </Link>
      )}
      <List className="mt-3">
        {list.map((p) => (
          <ListRow
            key={p.id}
            onClick={() => onPick(p)}
            leading={<PatientAvatar patient={p} size={40} />}
            title={p.name}
            subtitle={`${patientSubtitle(tables, p)} · ${primaryTutor(tables, p)?.fullName ?? 'sin tutor'}`}
            meta={p.status !== 'active' ? <Badge>{p.status === 'deceased' ? 'Fallecido' : 'Inactivo'}</Badge> : undefined}
          />
        ))}
        {list.length === 0 && <p className="p-4 text-sm text-ink-500">Sin resultados.</p>}
      </List>
    </Sheet>
  );
}
