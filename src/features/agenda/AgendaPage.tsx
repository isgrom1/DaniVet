import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Plus, Route } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { ActionLink, LinkButton } from '@/components/Button';
import { Badge, EmptyState, Notice } from '@/components/Card';
import { Segmented } from '@/components/form';
import { useSettings, useTables } from '@/data/hooks';
import { APPT_STATUS, APPT_STATUS_TONE, VISIT_TYPE } from '@/data/labels';
import type { Appointment } from '@/data/schema';
import { addDays, dayMonth, formatDate, formatTime, isISODate, localDateOf, startOfWeek, todayISO, weekdayShort } from '@/lib/dates';
import { addressText } from '@/lib/maps';
import { cn } from '@/lib/cn';
import { appointmentsBetween, appointmentsOnDay, apptEnd, dayRouteHref } from './selectors';

export function AgendaPage() {
  const tables = useTables();
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const view = (params.get('vista') === 'semana' ? 'semana' : 'dia') as 'dia' | 'semana';
  const dateParam = params.get('fecha');
  const date = dateParam && isISODate(dateParam) ? dateParam : todayISO();
  const go = (d: string, v = view) => setParams({ fecha: d, vista: v }, { replace: true });

  const weekStart = startOfWeek(date, settings.agenda.weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const dayList = useMemo(() => appointmentsOnDay(tables, date), [tables, date]);
  const weekList = useMemo(() => appointmentsBetween(tables, weekStart, addDays(weekStart, 6)), [tables, weekStart]);
  const active = dayList.filter((a) => a.status !== 'cancelled');
  const route = dayRouteHref(active);

  return (
    <>
      <PageHeader
        title="Agenda"
        large
        subtitle={view === 'dia' ? formatDate(date, 'long') : `Semana del ${formatDate(weekStart)} al ${formatDate(addDays(weekStart, 6))}`}
        actions={
          <LinkButton to={`/agenda/nueva?fecha=${date}`} size="sm" icon={<Plus className="size-4" />}>
            Agendar
          </LinkButton>
        }
      />
      <Page className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Segmented
            name="Vista"
            size="sm"
            value={view}
            onChange={(v) => go(date, v)}
            options={[
              { value: 'dia', label: 'Día' },
              { value: 'semana', label: 'Semana' },
            ]}
          />
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Anterior" className="flex size-10 items-center justify-center rounded-full bg-white ring-1 ring-sand-300" onClick={() => go(addDays(date, view === 'dia' ? -1 : -7))}>
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" className="min-h-10 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-sand-300" onClick={() => go(todayISO())}>
              Hoy
            </button>
            <button type="button" aria-label="Siguiente" className="flex size-10 items-center justify-center rounded-full bg-white ring-1 ring-sand-300" onClick={() => go(addDays(date, view === 'dia' ? 1 : 7))}>
              <ChevronRight className="size-5" />
            </button>
            <input
              type="date"
              aria-label="Ir a fecha"
              value={date}
              onChange={(e) => e.target.value && go(e.target.value)}
              className="input-base !min-h-10 w-11 !px-1 text-transparent"
              style={{ colorScheme: 'light' }}
            />
          </div>
        </div>

        {/* Selector de día de la semana */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const count = appointmentsOnDay(tables, d, false).length;
            const sel = d === date;
            return (
              <button
                key={d}
                type="button"
                onClick={() => go(d, 'dia')}
                className={cn('flex min-h-14 flex-col items-center justify-center rounded-xl text-xs', sel ? 'bg-brand-700 text-white' : 'bg-white text-ink-700 ring-1 ring-sand-200', d === todayISO() && !sel && 'ring-2 ring-brand-400')}
              >
                <span className="font-medium capitalize">{weekdayShort(d).replace('.', '')}</span>
                <span className="text-base font-bold">{Number(d.slice(8))}</span>
                <span className={cn('h-1.5 w-1.5 rounded-full', count ? (sel ? 'bg-white' : 'bg-accent-500') : 'bg-transparent')} aria-label={count ? `${count} visitas` : undefined} />
              </button>
            );
          })}
        </div>

        {view === 'dia' ? (
          <>
            {active.length > 1 && (
              <Notice tone="neutral" icon={<Route className="size-5" />} title={`Jornada: ${active.length} visitas`}>
                <p>
                  {formatTime(active[0].start)} a {formatTime(apptEnd(active[active.length - 1]))}. Los tiempos de traslado son los que registraste en cada cita (no hay un servicio de
                  mapas configurado para estimarlos).
                </p>
                {route && (
                  <ActionLink href={route} className="mt-2" icon={<MapPin className="size-4" />}>
                    Ver ruta del día en Google Maps
                  </ActionLink>
                )}
              </Notice>
            )}
            {dayList.length === 0 ? (
              <EmptyState icon={<CalendarDays className="size-6" />} title="Sin visitas este día" action={<LinkButton to={`/agenda/nueva?fecha=${date}`}>Agendar visita</LinkButton>} />
            ) : (
              <div className="space-y-2">
                {dayList.map((a, i) => (
                  <AppointmentCard key={a.id} a={a} gapFrom={i > 0 ? dayList.slice(0, i).filter((x) => x.status !== 'cancelled').pop() : undefined} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {days.map((d) => {
              const list = weekList.filter((a) => localDateOf(a.start) === d);
              return (
                <section key={d} aria-label={formatDate(d, 'long')}>
                  <button type="button" onClick={() => go(d, 'dia')} className="mb-1.5 flex w-full items-center justify-between px-1 text-left">
                    <span className={cn('text-sm font-semibold capitalize', d === todayISO() ? 'text-brand-700' : 'text-ink-600')}>
                      {weekdayShort(d)} {dayMonth(d)}
                    </span>
                    <span className="text-xs text-ink-500">{list.filter((a) => a.status !== 'cancelled').length || 'Sin'} visitas</span>
                  </button>
                  {list.length > 0 && (
                    <div className="space-y-2">
                      {list.map((a) => (
                        <AppointmentCard key={a.id} a={a} compact />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </Page>
    </>
  );
}

function AppointmentCard({ a, compact, gapFrom }: { a: Appointment; compact?: boolean; gapFrom?: Appointment }) {
  const tables = useTables();
  const tutor = tables.tutors.get(a.tutorId);
  const pets = a.patientIds.map((id) => tables.patients.get(id)?.name).filter(Boolean).join(', ');
  const gapMin = gapFrom ? Math.round((new Date(a.start).getTime() - new Date(apptEnd(gapFrom)).getTime()) / 60000) : null;
  return (
    <>
      {gapMin !== null && a.status !== 'cancelled' && (
        <p className={cn('px-2 text-xs', a.travelMin !== undefined && gapMin < a.travelMin ? 'font-semibold text-red-700' : 'text-ink-500')}>
          {gapMin >= 0 ? `${gapMin} min libres` : `Superposición de ${-gapMin} min`}
          {a.travelMin !== undefined && ` · traslado estimado ${a.travelMin} min`}
        </p>
      )}
      <Link to={`/agenda/${a.id}`} className={cn('card flex gap-3 p-3 active:bg-sand-50', a.status === 'cancelled' && 'opacity-60')}>
        <div className="w-14 shrink-0 text-center">
          <p className="text-base font-bold tabular text-ink-900">{formatTime(a.start)}</p>
          <p className="flex items-center justify-center gap-0.5 text-[11px] text-ink-500">
            <Clock className="size-3" />
            {a.durationMin}′
          </p>
        </div>
        <div className="min-w-0 flex-1 border-l border-sand-200 pl-3">
          <p className={cn('truncate font-semibold text-ink-900', a.status === 'cancelled' && 'line-through')}>{pets || 'Sin paciente'}</p>
          <p className="truncate text-sm text-ink-600">
            {VISIT_TYPE[a.visitType]}
            {a.reason ? ` · ${a.reason}` : ''}
          </p>
          {!compact && <p className="truncate text-sm text-ink-500">{tutor?.fullName}</p>}
          <p className="truncate text-sm text-ink-500">{addressText(a.address) || 'Sin dirección'}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Badge tone={APPT_STATUS_TONE[a.status]}>{APPT_STATUS[a.status]}</Badge>
            {a.precautions && <Badge tone="danger">Precauciones</Badge>}
            {a.equipment && <Badge tone="info">Equipamiento</Badge>}
            {a.demo && <Badge tone="accent">DEMO</Badge>}
          </div>
        </div>
      </Link>
    </>
  );
}
