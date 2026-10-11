import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, ClipboardList, DatabaseBackup, Search, SlidersHorizontal, Stethoscope, UserPlus, Sparkles } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { LinkButton } from '@/components/Button';
import { Badge, List, ListRow, Notice, Section } from '@/components/Card';
import { useProfile, useSettings, useTables } from '@/data/hooks';
import { APPT_STATUS, APPT_STATUS_TONE } from '@/data/labels';
import { DASHBOARD_SECTIONS, type DashboardSectionKey } from '@/data/defaults';
import { addDays, diffDays, formatDate, formatDateTime, formatTime, localDateOf, relativeDays, todayISO } from '@/lib/dates';
import { formatCLP } from '@/lib/numbers';
import { useMeta } from '@/lib/useMeta';
import { appointmentsBetween, appointmentsOnDay } from '@/features/agenda/selectors';
import { controlsDue, examsToReview, openTasks, paymentsDue, preventiveDue, type DueItem } from '@/features/reminders/derive';
import { chargeBalance } from '@/features/finance/calc';
import { inventoryAlerts } from '@/features/inventory/stock';
import { PatientAvatar } from '@/features/attachments/AttachmentViews';
import { capitalizeFirst } from '@/lib/text';

export function Dashboard() {
  const tables = useTables();
  const settings = useSettings();
  const profile = useProfile();
  const today = todayISO();
  const lastBackup = useMeta<string>('lastBackupAt', [tables.auditLog.size]);
  const accountCreated = useMeta<string>('accountCreatedAt');

  const data = useMemo(() => {
    const todays = appointmentsOnDay(tables, today, false);
    const upcoming = appointmentsBetween(tables, addDays(today, 1), addDays(today, 7)).filter((a) => a.status !== 'cancelled' && a.status !== 'completed');
    const drafts = [...tables.consultations.values()].filter((c) => c.status === 'draft').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const recentIds: string[] = [];
    for (const c of [...tables.consultations.values()].filter((c) => c.status === 'final').sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
      if (!recentIds.includes(c.patientId)) recentIds.push(c.patientId);
      if (recentIds.length >= 6) break;
    }
    return {
      todays,
      upcoming,
      drafts,
      recent: recentIds.map((id) => tables.patients.get(id)).filter((p): p is NonNullable<typeof p> => !!p),
      tasks: openTasks(tables),
      exams: examsToReview(tables),
      controls: controlsDue(tables, settings),
      preventive: preventiveDue(tables, settings),
      payments: paymentsDue(tables),
      inventory: inventoryAlerts(tables),
    };
  }, [tables, settings, today]);

  const hasData = tables.patients.size > 0;
  const backupDays = lastBackup ? diffDays(localDateOf(lastBackup), today) : null;
  const needsBackup = hasData && (backupDays === null || backupDays >= settings.backup.reminderDays);
  const order = settings.dashboard.order.filter((k) => !settings.dashboard.hidden.includes(k)) as DashboardSectionKey[];
  const missing = DASHBOARD_SECTIONS.map((s) => s.key).filter((k) => !settings.dashboard.order.includes(k) && !settings.dashboard.hidden.includes(k));
  const sections = [...order, ...missing] as DashboardSectionKey[];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const firstName = profile?.fullName?.replace(/^(dra?\.?|dr\.?)\s+/i, '').split(' ')[0];

  const render: Record<DashboardSectionKey, ReactNode> = {
    today: (
      <Section key="today" title={`Visitas de hoy (${data.todays.length})`} action={<Link to="/agenda" className="text-sm font-semibold text-brand-700">Agenda</Link>}>
        {data.todays.length === 0 ? (
          <p className="px-1 text-sm text-ink-500">No hay visitas agendadas para hoy.</p>
        ) : (
          <List>
            {data.todays.map((a) => (
              <ListRow
                key={a.id}
                to={`/agenda/${a.id}`}
                leading={<span className="w-12 text-center text-[15px] font-bold tabular text-ink-900">{formatTime(a.start)}</span>}
                title={a.patientIds.map((id) => tables.patients.get(id)?.name).filter(Boolean).join(', ') || 'Visita'}
                subtitle={[tables.tutors.get(a.tutorId)?.fullName, a.address.comuna].filter(Boolean).join(' · ')}
                trailing={<Badge tone={APPT_STATUS_TONE[a.status]}>{APPT_STATUS[a.status]}</Badge>}
              />
            ))}
          </List>
        )}
      </Section>
    ),
    drafts: data.drafts.length ? (
      <Section key="drafts" title={`Consultas por completar (${data.drafts.length})`}>
        <List>
          {data.drafts.slice(0, 5).map((c) => {
            const p = tables.patients.get(c.patientId);
            return (
              <ListRow
                key={c.id}
                to={`/consultas/${c.id}`}
                leading={p ? <PatientAvatar patient={p} size={36} /> : <ClipboardList className="size-5" />}
                title={p?.name ?? 'Paciente'}
                subtitle={`${formatDateTime(c.startedAt)} · ${c.reason.main || 'sin motivo'}`}
                trailing={<Badge tone="warning">Borrador</Badge>}
              />
            );
          })}
        </List>
      </Section>
    ) : null,
    tasks: data.tasks.length ? <DueSection key="tasks" title="Tareas de seguimiento" items={data.tasks} more="/tareas" /> : null,
    exams: data.exams.length ? <DueSection key="exams" title="Resultados de exámenes" items={data.exams} more="/examenes" /> : null,
    controls: data.controls.length ? <DueSection key="controls" title="Controles y tratamientos próximos" items={data.controls} /> : null,
    preventive: data.preventive.length ? <DueSection key="preventive" title="Vacunas y desparasitaciones" items={data.preventive} more="/preventivo" /> : null,
    payments: data.payments.length ? (
      <Section key="payments" title="Pagos pendientes" action={<Link to="/finanzas/cobros" className="text-sm font-semibold text-brand-700">Ver todos</Link>}>
        <List>
          {data.payments.slice(0, 5).map((p) => (
            <ListRow key={p.key} to={p.to} title={p.title} subtitle={formatDate(p.date)} trailing={<span className="font-semibold tabular text-amber-800">{formatCLP(chargeBalance(tables, tables.charges.get(p.key.split(':')[1])!))}</span>} />
          ))}
        </List>
      </Section>
    ) : null,
    upcoming: data.upcoming.length ? (
      <Section key="upcoming" title="Próximas visitas (7 días)">
        <List>
          {data.upcoming.slice(0, 6).map((a) => (
            <ListRow
              key={a.id}
              to={`/agenda/${a.id}`}
              title={a.patientIds.map((id) => tables.patients.get(id)?.name).filter(Boolean).join(', ')}
              subtitle={`${formatDate(a.start, 'medium')} · ${formatTime(a.start)} · ${tables.tutors.get(a.tutorId)?.fullName ?? ''}`}
              trailing={<Badge tone={APPT_STATUS_TONE[a.status]}>{APPT_STATUS[a.status]}</Badge>}
            />
          ))}
        </List>
      </Section>
    ) : null,
    recent: data.recent.length ? (
      <Section key="recent" title="Pacientes atendidos recientemente">
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex w-max gap-3">
            {data.recent.map((p) => (
              <Link key={p.id} to={`/pacientes/${p.id}`} className="flex w-20 flex-col items-center gap-1 text-center">
                <PatientAvatar patient={p} size={56} />
                <span className="w-full truncate text-xs font-semibold text-ink-800">{p.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </Section>
    ) : null,
    inventory: data.inventory.length ? (
      <Section key="inventory" title="Inventario" action={<Link to="/inventario" className="text-sm font-semibold text-brand-700">Abrir</Link>}>
        <Notice tone="warning">
          <ul className="list-disc pl-4">
            {data.inventory.slice(0, 4).map((a, i) => (
              <li key={i}>{a.text}</li>
            ))}
          </ul>
        </Notice>
      </Section>
    ) : null,
  };

  return (
    <>
      <PageHeader
        title={`${greet}${firstName ? `, ${firstName}` : ''}`}
        subtitle={capitalizeFirst(formatDate(today, 'long'))}
        large
        actions={
          <>
            <LinkButton to="/buscar" variant="ghost" size="sm" aria-label="Buscar" icon={<Search className="size-5" />} />
            <LinkButton to="/ajustes/inicio" variant="ghost" size="sm" aria-label="Personalizar inicio" icon={<SlidersHorizontal className="size-5" />} />
          </>
        }
      />
      <Page>
        <div className="grid grid-cols-3 gap-2">
          <QuickAction to="/consulta" icon={<Stethoscope className="size-5" />} label="Nueva consulta" primary />
          <QuickAction to="/pacientes/nuevo" icon={<UserPlus className="size-5" />} label="Nuevo paciente" />
          <QuickAction to="/agenda/nueva" icon={<CalendarPlus className="size-5" />} label="Agendar visita" />
        </div>
        {needsBackup && (
          <Notice tone="warning" icon={<DatabaseBackup className="size-5" />} title={backupDays === null ? 'Aún no has creado un respaldo' : `Último respaldo hace ${backupDays} días`}>
            Tus datos están solo en este dispositivo. <Link to="/ajustes/respaldo" className="font-semibold underline">Crear respaldo ahora</Link>
          </Notice>
        )}
        {(!profile?.rut || !profile?.phone || tables.services.size === 0) && (accountCreated || hasData) && (
          <Notice tone="info" icon={<Sparkles className="size-5" />} title="Completa tu configuración">
            <ul className="list-disc pl-4">
              {(!profile?.rut || !profile?.phone) && (
                <li>
                  <Link to="/ajustes/perfil" className="font-semibold underline">Perfil profesional</Link> (RUT, teléfono, firma: aparecen en recetas y documentos)
                </li>
              )}
              {tables.services.size === 0 && (
                <li>
                  <Link to="/ajustes/servicios" className="font-semibold underline">Servicios y precios</Link>
                </li>
              )}
              {!hasData && (
                <li>
                  <Link to="/pacientes/nuevo" className="font-semibold underline">Registrar tu primer paciente</Link>
                </li>
              )}
            </ul>
          </Notice>
        )}
        {sections.map((k) => render[k])}
      </Page>
    </>
  );
}

function QuickAction({ to, icon, label, primary }: { to: string; icon: ReactNode; label: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={
        primary
          ? 'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-brand-700 px-2 text-center text-[13px] font-semibold text-white shadow-sm active:bg-brand-800'
          : 'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-white px-2 text-center text-[13px] font-semibold text-ink-800 ring-1 ring-sand-200 active:bg-sand-100'
      }
    >
      {icon}
      {label}
    </Link>
  );
}

function DueSection({ title, items, more }: { title: string; items: DueItem[]; more?: string }) {
  const tables = useTables();
  return (
    <Section title={`${title} (${items.length})`} action={more ? <Link to={more} className="text-sm font-semibold text-brand-700">Ver todo</Link> : undefined}>
      <List>
        {items.slice(0, 5).map((i) => {
          const p = i.patientId ? tables.patients.get(i.patientId) : undefined;
          return (
            <ListRow
              key={i.key}
              to={i.to}
              title={p ? `${p.name} · ${i.title}` : i.title}
              subtitle={i.subtitle}
              trailing={i.date ? <Badge tone={i.overdue ? 'danger' : 'brand'}>{relativeDays(i.date)}</Badge> : undefined}
            />
          );
        })}
      </List>
    </Section>
  );
}
