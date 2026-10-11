import { useMemo, useState } from 'react';
import { CalendarDays, ClipboardList, FileText, FlaskConical, PawPrint, Pill, UserRound } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Badge, List, ListRow, Section } from '@/components/Card';
import { SearchInput, Select } from '@/components/form';
import { useTables } from '@/data/hooks';
import { APPT_STATUS, CONSULT_KIND, CONSULT_STATUS, DOC_KIND, EXAM_STATUS, EXAM_TYPE } from '@/data/labels';
import { formatDate, formatDateTime, localDateOf } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import { matchesQuery, normalizeText } from '@/lib/text';
import { cn } from '@/lib/cn';
import { primaryTutor } from '@/features/patients/selectors';

type Kind = 'all' | 'patients' | 'tutors' | 'consultations' | 'prescriptions' | 'exams' | 'appointments' | 'documents';
const KINDS: Array<{ k: Kind; label: string }> = [
  { k: 'all', label: 'Todo' },
  { k: 'patients', label: 'Pacientes' },
  { k: 'tutors', label: 'Tutores' },
  { k: 'consultations', label: 'Consultas' },
  { k: 'prescriptions', label: 'Recetas' },
  { k: 'exams', label: 'Exámenes' },
  { k: 'appointments', label: 'Citas' },
  { k: 'documents', label: 'Documentos' },
];

export function SearchPage() {
  const tables = useTables();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [species, setSpecies] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const active = normalizeText(q).length >= 2 || !!species || !!from || !!to;
  const inDate = (d?: string) => {
    if (!d) return !from && !to;
    const day = d.length > 10 ? localDateOf(d) : d;
    return (!from || day >= from) && (!to || day <= to);
  };
  const okSpecies = (patientId?: string) => !species || tables.patients.get(patientId ?? '')?.speciesId === species;

  const r = useMemo(() => {
    if (!active) return null;
    const pname = (id?: string) => (id ? tables.patients.get(id)?.name : '');
    return {
      patients: [...tables.patients.values()].filter((p) => (!species || p.speciesId === species) && matchesQuery(q, p.name, p.breed, p.microchip, p.color, primaryTutor(tables, p)?.fullName)),
      tutors: species || from || to ? [] : [...tables.tutors.values()].filter((t) => !t.mergedIntoId && matchesQuery(q, t.fullName, t.phone, t.email, t.rut, ...t.addresses.map((a) => `${a.street} ${a.comuna ?? ''}`))),
      consultations: [...tables.consultations.values()].filter(
        (c) =>
          okSpecies(c.patientId) &&
          inDate(c.startedAt) &&
          matchesQuery(q, pname(c.patientId), c.reason.main, c.reason.ownerSymptoms, ...[...tables.diagnoses.values()].filter((d) => d.consultationId === c.id).map((d) => d.name)),
      ),
      prescriptions: [...tables.prescriptions.values()].filter((p) => okSpecies(p.patientId) && inDate(p.date) && matchesQuery(q, p.patientSnap.name, p.tutorSnap.fullName, ...p.items.map((i) => `${i.medicationName} ${i.activeIngredient ?? ''}`))),
      exams: [...tables.exams.values()].filter((e) => okSpecies(e.patientId) && inDate(e.requestedAt) && matchesQuery(q, pname(e.patientId), e.name, EXAM_TYPE[e.type], e.lab, e.results)),
      appointments: [...tables.appointments.values()].filter(
        (a) => (!species || a.patientIds.some((id) => okSpecies(id))) && inDate(a.start) && matchesQuery(q, a.reason, tables.tutors.get(a.tutorId)?.fullName, a.address.street, a.address.comuna, ...a.patientIds.map(pname)),
      ),
      documents: [...tables.documents.values()].filter((d) => okSpecies(d.patientId) && inDate(d.date) && matchesQuery(q, d.title, DOC_KIND[d.kind], pname(d.patientId))),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, q, species, from, to, active]);

  const show = (k: Kind) => kind === 'all' || kind === k;
  const total = r ? Object.values(r).reduce((s, l) => s + l.length, 0) : 0;
  const limit = kind === 'all' ? 5 : 50;

  return (
    <>
      <PageHeader title="Buscar" back="/" />
      <Page>
        <SearchInput value={q} onChange={setQ} placeholder="Nombre, tutor, diagnóstico, medicamento…" autoFocus />
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex w-max gap-1.5">
            {KINDS.map((x) => (
              <button key={x.k} type="button" onClick={() => setKind(x.k)} className={cn('min-h-9 rounded-full px-3 text-sm font-medium', kind === x.k ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-sand-300')}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Select value={species} onChange={(e) => setSpecies(e.target.value)} aria-label="Especie" className="min-h-10 py-1.5 text-sm">
            <option value="">Especie</option>
            {[...tables.species.values()].map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde" className="input-base !min-h-10 text-sm" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta" className="input-base !min-h-10 text-sm" />
        </div>
        {!active && <p className="px-1 text-sm text-ink-500">Escribe al menos 2 letras o usa los filtros. La búsqueda se hace en el dispositivo, sin conexión.</p>}
        {r && total === 0 && <p className="px-1 text-sm text-ink-500">Sin resultados.</p>}
        {r && show('patients') && r.patients.length > 0 && (
          <Section title={`Pacientes (${r.patients.length})`}>
            <List>
              {r.patients.slice(0, limit).map((p) => (
                <ListRow key={p.id} to={`/pacientes/${p.id}`} leading={<PawPrint className="size-5 text-brand-700" />} title={p.name} subtitle={`${tables.species.get(p.speciesId)?.name ?? ''} · ${primaryTutor(tables, p)?.fullName ?? ''}`} />
              ))}
            </List>
          </Section>
        )}
        {r && show('tutors') && r.tutors.length > 0 && (
          <Section title={`Tutores (${r.tutors.length})`}>
            <List>
              {r.tutors.slice(0, limit).map((t) => (
                <ListRow key={t.id} to={`/tutores/${t.id}`} leading={<UserRound className="size-5 text-brand-700" />} title={t.fullName} subtitle={t.phone ? formatPhone(t.phone) : t.email} />
              ))}
            </List>
          </Section>
        )}
        {r && show('consultations') && r.consultations.length > 0 && (
          <Section title={`Consultas (${r.consultations.length})`}>
            <List>
              {r.consultations
                .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
                .slice(0, limit)
                .map((c) => (
                  <ListRow
                    key={c.id}
                    to={`/consultas/${c.id}`}
                    leading={<ClipboardList className="size-5 text-brand-700" />}
                    title={`${tables.patients.get(c.patientId)?.name ?? ''} · ${c.reason.main || CONSULT_KIND[c.kind]}`}
                    subtitle={formatDateTime(c.startedAt)}
                    trailing={<Badge>{CONSULT_STATUS[c.status]}</Badge>}
                  />
                ))}
            </List>
          </Section>
        )}
        {r && show('prescriptions') && r.prescriptions.length > 0 && (
          <Section title={`Recetas (${r.prescriptions.length})`}>
            <List>
              {r.prescriptions.slice(0, limit).map((p) => (
                <ListRow key={p.id} to={`/recetas/${p.id}`} leading={<Pill className="size-5 text-brand-700" />} title={`${p.patientSnap.name} · ${p.items.map((i) => i.medicationName).join(', ')}`} subtitle={formatDate(p.date)} />
              ))}
            </List>
          </Section>
        )}
        {r && show('exams') && r.exams.length > 0 && (
          <Section title={`Exámenes (${r.exams.length})`}>
            <List>
              {r.exams.slice(0, limit).map((e) => (
                <ListRow key={e.id} to={`/examenes/${e.id}`} leading={<FlaskConical className="size-5 text-brand-700" />} title={`${tables.patients.get(e.patientId)?.name ?? ''} · ${e.name || EXAM_TYPE[e.type]}`} subtitle={formatDate(e.requestedAt)} trailing={<Badge>{EXAM_STATUS[e.status]}</Badge>} />
              ))}
            </List>
          </Section>
        )}
        {r && show('appointments') && r.appointments.length > 0 && (
          <Section title={`Citas (${r.appointments.length})`}>
            <List>
              {r.appointments
                .sort((a, b) => b.start.localeCompare(a.start))
                .slice(0, limit)
                .map((a) => (
                  <ListRow
                    key={a.id}
                    to={`/agenda/${a.id}`}
                    leading={<CalendarDays className="size-5 text-brand-700" />}
                    title={a.patientIds.map((id) => tables.patients.get(id)?.name).filter(Boolean).join(', ')}
                    subtitle={formatDateTime(a.start)}
                    trailing={<Badge>{APPT_STATUS[a.status]}</Badge>}
                  />
                ))}
            </List>
          </Section>
        )}
        {r && show('documents') && r.documents.length > 0 && (
          <Section title={`Documentos (${r.documents.length})`}>
            <List>
              {r.documents.slice(0, limit).map((d) => (
                <ListRow key={d.id} to={`/documentos/${d.id}`} leading={<FileText className="size-5 text-brand-700" />} title={d.title} subtitle={`${tables.patients.get(d.patientId ?? '')?.name ?? ''} · ${formatDate(d.date)}`} />
              ))}
            </List>
          </Section>
        )}
      </Page>
    </>
  );
}
