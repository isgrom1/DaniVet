import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, MessageCircle, ShieldCheck, X } from 'lucide-react';
import { PageHeader, Page } from '@/components/layout';
import { ActionLink, Button } from '@/components/Button';
import { Badge, Card, EmptyState, Notice } from '@/components/Card';
import { Segmented } from '@/components/form';
import { toast } from '@/components/overlay';
import { useProfile, useSettings, useTables } from '@/data/hooks';
import { friendlyError } from '@/data/errors';
import { formatDate, formatDateTime, relativeDays } from '@/lib/dates';
import { whatsappHref } from '@/lib/phone';
import { preventiveDue, type DueItem } from '@/features/reminders/derive';
import { setDueState } from '@/features/reminders/actions';
import { primaryTutor } from '@/features/patients/selectors';

export function PreventivePage() {
  const tables = useTables();
  const settings = useSettings();
  const profile = useProfile();
  const [kind, setKind] = useState<'all' | 'vaccine' | 'deworming'>('all');
  const [when, setWhen] = useState<'overdue' | 'upcoming' | 'all'>('all');
  const items = useMemo(() => {
    const extended = { ...settings, reminders: { ...settings.reminders, vaccineDaysAhead: Math.max(settings.reminders.vaccineDaysAhead, 60), dewormingDaysAhead: Math.max(settings.reminders.dewormingDaysAhead, 60) } };
    return preventiveDue(tables, extended).filter((i) => (kind === 'all' || i.kind === kind) && (when === 'all' || (when === 'overdue' ? i.overdue : !i.overdue)));
  }, [tables, settings, kind, when]);

  const act = async (item: DueItem, patch: Parameters<typeof setDueState>[1], msg: string) => {
    try {
      await setDueState(item, patch);
      toast.success(msg);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <>
      <PageHeader title="Vacunas y desparasitaciones" back="/mas" />
      <Page>
        <Notice tone="info" icon={<ShieldCheck className="size-5" />}>
          Esta lista se basa en las fechas de próxima dosis que registraste. Son recordatorios dentro de la app: no se envían notificaciones ni mensajes automáticos.
        </Notice>
        <Segmented
          name="Tipo"
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Todo' },
            { value: 'vaccine', label: 'Vacunas' },
            { value: 'deworming', label: 'Desparasitaciones' },
          ]}
        />
        <Segmented
          name="Período"
          size="sm"
          value={when}
          onChange={setWhen}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'overdue', label: 'Vencidos' },
            { value: 'upcoming', label: 'Próximos 60 días' },
          ]}
        />
        {items.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="size-6" />} title="Nada pendiente">
            No hay vacunas ni desparasitaciones con fecha próxima registrada en este período.
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {items.map((i) => {
              const p = i.patientId ? tables.patients.get(i.patientId) : undefined;
              const tutor = p ? primaryTutor(tables, p) : undefined;
              const text = `Hola ${tutor?.fullName.split(' ')[0] ?? ''}, le escribo para recordarle que ${p?.name ?? 'su mascota'} tiene pendiente: ${i.title.toLowerCase()} (fecha indicada: ${formatDate(i.date)}). ¿Coordinamos una visita? Saludos, ${profile?.fullName ?? ''}.`;
              return (
                <Card key={i.key} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={p ? `/pacientes/${p.id}?tab=preventivo` : '#'} className="font-semibold text-ink-900">
                        {p?.name ?? 'Paciente'} · {i.title}
                      </Link>
                      <p className="text-sm text-ink-500">
                        {tutor?.fullName} · {formatDate(i.date)}
                      </p>
                      {i.contactedAt && <p className="text-xs font-semibold text-emerald-700">Contactado el {formatDateTime(i.contactedAt)}</p>}
                    </div>
                    <Badge tone={i.overdue ? 'danger' : 'brand'}>{relativeDays(i.date!)}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tutor?.phone && (
                      <ActionLink href={whatsappHref(tutor.phone, text)} icon={<MessageCircle className="size-4" />} className="min-h-9 text-sm">
                        WhatsApp
                      </ActionLink>
                    )}
                    <Button size="sm" variant="secondary" icon={<Check className="size-4" />} onClick={() => act(i, { contactedAt: new Date().toISOString() }, 'Marcado como contactado')}>
                      Contactado
                    </Button>
                    <Link to={i.to} className="inline-flex min-h-9 items-center rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white">
                      Registrar
                    </Link>
                    <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => act(i, { status: 'dismissed' }, 'Recordatorio descartado')}>
                      Descartar
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Page>
    </>
  );
}
