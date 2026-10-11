import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarPlus, GitMerge, Pencil, Plus, Receipt, ShieldOff, Trash2, UserRound } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { Button, LinkButton } from '@/components/Button';
import { Badge, Card, EmptyState, KeyValue, List, ListRow, Notice, Section } from '@/components/Card';
import { ContactActions, MapLinks } from '@/components/ContactActions';
import { confirmDialog, promptDialog, Sheet, toast } from '@/components/overlay';
import { SearchInput } from '@/components/form';
import { useTables } from '@/data/hooks';
import { batch, referencesTo, remove } from '@/data/repo';
import { friendlyError } from '@/data/errors';
import { APPT_STATUS, APPT_STATUS_TONE, CONTACT_PREF, PAYMENT_STATUS, PAYMENT_STATUS_TONE } from '@/data/labels';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import { formatCLP } from '@/lib/numbers';
import { addressText } from '@/lib/maps';
import { matchesQuery } from '@/lib/text';
import { useState } from 'react';
import { patientsOfTutor, patientSubtitle } from '@/features/patients/selectors';
import { PatientAvatar } from '@/features/attachments/AttachmentViews';
import { chargeBalance, chargeState, chargeTotal, tutorBalance } from '@/features/finance/calc';

export function TutorDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const tables = useTables();
  const tutor = tables.tutors.get(id);
  const [mergeOpen, setMergeOpen] = useState(false);

  const pets = useMemo(() => (tutor ? patientsOfTutor(tables, tutor.id) : []), [tables, tutor]);
  const appts = useMemo(
    () => [...tables.appointments.values()].filter((a) => a.tutorId === id).sort((a, b) => b.start.localeCompare(a.start)),
    [tables, id],
  );
  const charges = useMemo(() => [...tables.charges.values()].filter((c) => c.tutorId === id).sort((a, b) => b.date.localeCompare(a.date)), [tables, id]);
  const payments = useMemo(() => [...tables.payments.values()].filter((p) => p.tutorId === id).sort((a, b) => b.date.localeCompare(a.date)), [tables, id]);

  if (!tutor) {
    return (
      <>
        <PageHeader title="Tutor" back="/tutores" />
        <Page>
          <Notice tone="warning">No se encontró este tutor.</Notice>
        </Page>
      </>
    );
  }
  if (tutor.mergedIntoId) {
    return (
      <>
        <PageHeader title="Tutor fusionado" back="/tutores" />
        <Page>
          <Notice tone="info" title="Este registro fue fusionado">
            Sus datos se trasladaron a otro tutor.
          </Notice>
          <LinkButton to={`/tutores/${tutor.mergedIntoId}`}>Ver tutor actual</LinkButton>
        </Page>
      </>
    );
  }

  const debt = tutorBalance(tables, tutor.id);

  const anonymize = async () => {
    const reason = await promptDialog({
      title: 'Anonimizar datos personales',
      message:
        'Se eliminarán nombre, teléfonos, correo, RUT, direcciones y contactos de este tutor. Las fichas clínicas de sus mascotas se conservan sin sus datos personales. Úsalo ante una solicitud de supresión de datos. No se puede deshacer.',
      label: 'Motivo (queda en el historial)',
      multiline: true,
      confirmLabel: 'Anonimizar',
    });
    if (!reason) return;
    try {
      const b = batch();
      b.update(
        'tutors',
        tutor.id,
        (cur) => ({
          ...cur,
          fullName: 'Tutor anonimizado',
          rut: undefined,
          phone: undefined,
          phoneAlt: undefined,
          email: undefined,
          addresses: [],
          altContact: undefined,
          decisionMaker: undefined,
          notes: undefined,
          contactPreference: undefined,
          anonymizedAt: new Date().toISOString(),
        }),
        { action: 'anonymize', reason, audit: false },
      );
      // El historial de cambios también se depura: se conservan los nombres de campo, no sus valores personales.
      for (const entry of tables.auditLog.values()) {
        if (entry.entityId !== tutor.id || !entry.changes?.length) continue;
        b.update('auditLog', entry.id, (cur) => ({ ...cur, changes: cur.changes?.map((c) => ({ field: c.field })) }));
      }
      if (tables.drafts.get(`form:tutor:${tutor.id}`)) b.remove('drafts', `form:tutor:${tutor.id}`);
      b.log({ entity: 'tutors', entityId: tutor.id, action: 'anonymize', reason, summary: 'Datos personales del tutor eliminados' });
      await b.commit();
      toast.success('Datos personales anonimizados');
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const del = async () => {
    const refs = referencesTo('tutors', tutor.id);
    if (refs.length) {
      toast.error(`No se puede eliminar: tiene ${refs.length} registro(s) asociado(s). Puedes anonimizar sus datos personales.`);
      return;
    }
    const ok = await confirmDialog({ title: 'Eliminar tutor', message: 'Se eliminará este tutor. No tiene pacientes ni registros asociados.', confirmLabel: 'Eliminar', tone: 'danger' });
    if (!ok) return;
    try {
      await remove('tutors', tutor.id);
      toast.success('Tutor eliminado');
      navigate('/tutores', { replace: true });
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <>
      <PageHeader
        title={tutor.fullName}
        back="/tutores"
        actions={
          <LinkButton to={`/tutores/${tutor.id}/editar`} size="sm" variant="ghost" icon={<Pencil className="size-4" />}>
            Editar
          </LinkButton>
        }
      />
      <Page>
        <Card className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-sand-200 text-ink-700">
              <UserRound className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-ink-900">{tutor.fullName}</p>
              <p className="text-sm text-ink-500">
                {tutor.phone ? formatPhone(tutor.phone) : 'Sin teléfono'}
                {tutor.contactPreference && ` · Prefiere ${CONTACT_PREF[tutor.contactPreference]}`}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {tutor.demo && <Badge tone="accent">DEMO</Badge>}
                {debt > 0 && <Badge tone="warning">Saldo pendiente {formatCLP(debt)}</Badge>}
                {tutor.anonymizedAt && <Badge>Anonimizado el {formatDate(tutor.anonymizedAt)}</Badge>}
              </div>
            </div>
          </div>
          <ContactActions phone={tutor.phone} email={tutor.email} />
          <dl className="divide-y divide-sand-100">
            <KeyValue label="Teléfono alternativo" value={tutor.phoneAlt && formatPhone(tutor.phoneAlt)} />
            <KeyValue label="Correo" value={tutor.email} />
            <KeyValue label="RUT" value={tutor.rut} />
            <KeyValue label="Contacto alternativo" value={tutor.altContact && [tutor.altContact.name, tutor.altContact.relation, tutor.altContact.phone && formatPhone(tutor.altContact.phone)].filter(Boolean).join(' · ')} />
            <KeyValue label="Autorizado/a para decidir" value={tutor.decisionMaker && [tutor.decisionMaker.name, tutor.decisionMaker.relation, tutor.decisionMaker.phone && formatPhone(tutor.decisionMaker.phone)].filter(Boolean).join(' · ')} />
            <KeyValue label="Observaciones" value={tutor.notes} />
            <KeyValue label="Registrado el" value={formatDateTime(tutor.createdAt)} />
          </dl>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <LinkButton to={`/agenda/nueva?tutorId=${tutor.id}`} variant="soft" icon={<CalendarPlus className="size-4" />}>
            Agendar visita
          </LinkButton>
          <LinkButton to={`/finanzas/cobros/nuevo?tutorId=${tutor.id}`} variant="soft" icon={<Receipt className="size-4" />}>
            Nuevo cobro
          </LinkButton>
        </div>

        <Section title="Direcciones">
          {tutor.addresses.length === 0 ? (
            <Notice tone="neutral">Sin direcciones registradas.</Notice>
          ) : (
            tutor.addresses.map((a) => (
              <Card key={a.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{a.label || 'Dirección'}</p>
                  {a.primary && <Badge tone="brand">Principal</Badge>}
                </div>
                <p className="text-[15px] text-ink-700">{addressText(a) || 'Sin calle registrada'}</p>
                {a.directions && <p className="whitespace-pre-wrap rounded-lg bg-sand-100 p-2 text-sm text-ink-700">{a.directions}</p>}
                <MapLinks address={a} />
              </Card>
            ))
          )}
        </Section>

        <Section
          title={`Mascotas (${pets.length})`}
          action={
            <LinkButton to={`/pacientes/nuevo?tutorId=${tutor.id}`} size="sm" variant="ghost" icon={<Plus className="size-4" />}>
              Agregar
            </LinkButton>
          }
        >
          {pets.length === 0 ? (
            <EmptyState title="Sin mascotas registradas" action={<LinkButton to={`/pacientes/nuevo?tutorId=${tutor.id}`}>Registrar paciente</LinkButton>} />
          ) : (
            <List>
              {pets.map((p) => (
                <ListRow
                  key={p.id}
                  to={`/pacientes/${p.id}`}
                  leading={<PatientAvatar patient={p} />}
                  title={p.name}
                  subtitle={patientSubtitle(tables, p)}
                  meta={p.status !== 'active' ? <Badge>{p.status === 'deceased' ? 'Fallecido' : 'Inactivo'}</Badge> : undefined}
                />
              ))}
            </List>
          )}
        </Section>

        <Section title="Visitas">
          {appts.length === 0 ? (
            <p className="px-1 text-sm text-ink-500">Sin visitas registradas.</p>
          ) : (
            <List>
              {appts.slice(0, 8).map((a) => (
                <ListRow
                  key={a.id}
                  to={`/agenda/${a.id}`}
                  title={formatDateTime(a.start)}
                  subtitle={a.reason || a.patientIds.map((pid) => tables.patients.get(pid)?.name).filter(Boolean).join(', ')}
                  trailing={<Badge tone={APPT_STATUS_TONE[a.status]}>{APPT_STATUS[a.status]}</Badge>}
                />
              ))}
            </List>
          )}
        </Section>

        <Section title="Cobros y pagos" action={<span className="text-sm font-semibold text-ink-700">{debt > 0 ? `Pendiente: ${formatCLP(debt)}` : 'Sin deuda'}</span>}>
          {charges.length === 0 ? (
            <p className="px-1 text-sm text-ink-500">Sin cobros registrados.</p>
          ) : (
            <List>
              {charges.map((c) => {
                const st = chargeState(tables, c);
                return (
                  <ListRow
                    key={c.id}
                    to={`/finanzas/cobros/${c.id}`}
                    title={`${formatDate(c.date)} · ${formatCLP(chargeTotal(c))}`}
                    subtitle={c.items.map((i) => i.description).join(', ')}
                    trailing={
                      <span className="flex flex-col items-end gap-1">
                        <Badge tone={PAYMENT_STATUS_TONE[st]}>{PAYMENT_STATUS[st]}</Badge>
                        {chargeBalance(tables, c) > 0 && <span className="text-xs">Saldo {formatCLP(chargeBalance(tables, c))}</span>}
                      </span>
                    }
                  />
                );
              })}
            </List>
          )}
          {payments.length > 0 && (
            <p className="px-1 text-sm text-ink-500">
              {payments.filter((p) => !p.voided).length} pago(s) registrados · último el {formatDate(payments[0].date)}
            </p>
          )}
        </Section>

        <Section title="Corrección y privacidad">
          <div className="grid gap-2">
            <Button variant="secondary" icon={<GitMerge className="size-4" />} onClick={() => setMergeOpen(true)}>
              Fusionar con otro tutor duplicado
            </Button>
            {!tutor.anonymizedAt && (
              <Button variant="secondary" icon={<ShieldOff className="size-4" />} onClick={anonymize}>
                Anonimizar datos personales
              </Button>
            )}
            <Button variant="secondary" className="text-red-700" icon={<Trash2 className="size-4" />} onClick={del}>
              Eliminar tutor
            </Button>
          </div>
        </Section>
      </Page>
      {mergeOpen && <MergePicker sourceId={tutor.id} onClose={() => setMergeOpen(false)} />}
    </>
  );
}

function MergePicker({ sourceId, onClose }: { sourceId: string; onClose: () => void }) {
  const tables = useTables();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const list = [...tables.tutors.values()]
    .filter((t) => t.id !== sourceId && !t.mergedIntoId && !t.anonymizedAt && matchesQuery(q, t.fullName, t.phone, t.email))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))
    .slice(0, 30);
  return (
    <Sheet open onClose={onClose} title="¿Con qué tutor fusionar?">
      <p className="mb-3 text-sm text-ink-600">Elige el registro que es la misma persona. En el siguiente paso revisarás qué datos conservar antes de fusionar.</p>
      <SearchInput value={q} onChange={setQ} placeholder="Buscar tutor" />
      <List className="mt-3">
        {list.map((t) => (
          <ListRow key={t.id} onClick={() => navigate(`/tutores/fusionar?a=${t.id}&b=${sourceId}`)} title={t.fullName} subtitle={t.phone ? formatPhone(t.phone) : t.email} />
        ))}
        {list.length === 0 && <p className="p-4 text-sm text-ink-500">Sin resultados.</p>}
      </List>
    </Sheet>
  );
}
