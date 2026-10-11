import { useState } from 'react';
import { BellOff } from 'lucide-react';
import { PageHeader, Page, StickyActions } from '@/components/layout';
import { Button } from '@/components/Button';
import { Card, Notice, Section } from '@/components/Card';
import { Field, IntegerInput, MoneyInput, Select, Switch, TimeInput } from '@/components/form';
import { toast } from '@/components/overlay';
import { useSettings } from '@/data/hooks';
import { update } from '@/data/repo';
import { friendlyError } from '@/data/errors';

export function AgendaSettings() {
  const s = useSettings();
  const [f, setF] = useState({
    defaultDurationMin: String(s.agenda.defaultDurationMin),
    defaultTravelMin: String(s.agenda.defaultTravelMin),
    dayStart: s.agenda.dayStart,
    dayEnd: s.agenda.dayEnd,
    weekStartsOn: String(s.agenda.weekStartsOn),
    kmRate: s.kmRateCLP !== undefined ? String(s.kmRateCLP) : '',
    vaccineDaysAhead: String(s.reminders.vaccineDaysAhead),
    dewormingDaysAhead: String(s.reminders.dewormingDaysAhead),
    controlDaysAhead: String(s.reminders.controlDaysAhead),
    overdueWindowDays: String(s.reminders.overdueWindowDays),
    includePatientName: s.calendar.includePatientName,
    includeAddress: s.calendar.includeAddress,
    backupDays: String(s.backup.reminderDays),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    const n = (v: string) => Number(v || 0);
    if (f.dayEnd <= f.dayStart) {
      toast.error('El fin de la jornada debe ser posterior al inicio.');
      return;
    }
    setBusy(true);
    try {
      await update('settings', 'settings', (cur) => ({
        ...cur,
        agenda: { defaultDurationMin: Math.max(5, n(f.defaultDurationMin)), defaultTravelMin: n(f.defaultTravelMin), dayStart: f.dayStart, dayEnd: f.dayEnd, weekStartsOn: n(f.weekStartsOn) },
        kmRateCLP: f.kmRate ? n(f.kmRate) : undefined,
        reminders: { vaccineDaysAhead: n(f.vaccineDaysAhead), dewormingDaysAhead: n(f.dewormingDaysAhead), controlDaysAhead: n(f.controlDaysAhead), overdueWindowDays: n(f.overdueWindowDays) },
        calendar: { includePatientName: f.includePatientName, includeAddress: f.includeAddress },
        backup: { reminderDays: Math.max(1, n(f.backupDays)) },
      }));
      toast.success('Ajustes guardados');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Agenda y recordatorios" back="/mas" />
      <Page>
        <Section title="Agenda">
          <Card className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duración habitual de visita">
                <IntegerInput value={f.defaultDurationMin} onChange={(v) => set('defaultDurationMin', v)} unit="min" />
              </Field>
              <Field label="Traslado habitual entre visitas">
                <IntegerInput value={f.defaultTravelMin} onChange={(v) => set('defaultTravelMin', v)} unit="min" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inicio de jornada">
                <TimeInput value={f.dayStart} onChange={(v) => set('dayStart', v)} />
              </Field>
              <Field label="Fin de jornada">
                <TimeInput value={f.dayEnd} onChange={(v) => set('dayEnd', v)} />
              </Field>
            </div>
            <Field label="La semana comienza el">
              <Select value={f.weekStartsOn} onChange={(e) => set('weekStartsOn', e.target.value)} aria-label="Inicio de semana">
                <option value="1">Lunes</option>
                <option value="0">Domingo</option>
              </Select>
            </Field>
            <Field label="Tarifa por kilómetro (opcional)" hint="Para calcular gastos de traslado a partir de los km.">
              <MoneyInput value={f.kmRate} onChange={(v) => set('kmRate', v)} aria-label="Tarifa por kilómetro" />
            </Field>
            <Notice tone="neutral">Las estimaciones automáticas de tiempo de traslado requieren un proveedor de mapas, que no está configurado. Los tiempos se registran manualmente en cada cita.</Notice>
          </Card>
        </Section>
        <Section title="Recordatorios en Inicio (días de anticipación)">
          <Card className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Vacunas">
                <IntegerInput value={f.vaccineDaysAhead} onChange={(v) => set('vaccineDaysAhead', v)} unit="días" />
              </Field>
              <Field label="Desparasit.">
                <IntegerInput value={f.dewormingDaysAhead} onChange={(v) => set('dewormingDaysAhead', v)} unit="días" />
              </Field>
              <Field label="Controles">
                <IntegerInput value={f.controlDaysAhead} onChange={(v) => set('controlDaysAhead', v)} unit="días" />
              </Field>
            </div>
            <Field label="Mostrar vencidos de hasta" hint="Días hacia atrás.">
              <IntegerInput value={f.overdueWindowDays} onChange={(v) => set('overdueWindowDays', v)} unit="días" />
            </Field>
            <Notice tone="warning" icon={<BellOff className="size-5" />} title="Notificaciones del teléfono: no configuradas">
              Los recordatorios se muestran dentro de la app. Enviar notificaciones a la pantalla bloqueada requeriría un servidor de notificaciones, que esta versión no usa.
              Para recibir una alerta del iPhone, usa “Agregar a Calendario” en cada visita.
            </Notice>
          </Card>
        </Section>
        <Section title="Eventos de Calendario (.ics)">
          <Card>
            <Switch checked={f.includePatientName} onChange={(v) => set('includePatientName', v)} label="Incluir nombre del paciente" description="El evento queda en tu calendario (y en iCloud si lo sincronizas)." />
            <Switch checked={f.includeAddress} onChange={(v) => set('includeAddress', v)} label="Incluir dirección" />
            <p className="pb-2 text-xs text-ink-500">Nunca se incluyen datos clínicos en los eventos.</p>
          </Card>
        </Section>
        <Section title="Respaldo">
          <Card>
            <Field label="Recordarme crear un respaldo cada">
              <IntegerInput value={f.backupDays} onChange={(v) => set('backupDays', v)} unit="días" />
            </Field>
          </Card>
        </Section>
      </Page>
      <StickyActions>
        <Button block onClick={save} loading={busy}>
          Guardar
        </Button>
      </StickyActions>
    </>
  );
}
