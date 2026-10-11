import type { Tables } from '@/data/store';
import type { Appointment, Settings } from '@/data/schema';
import { addMinutes, formatTime, localDateOf, localTimeOf } from '@/lib/dates';
import { addressText } from '@/lib/maps';

export function apptEnd(a: Pick<Appointment, 'start' | 'durationMin'>): string {
  return addMinutes(a.start, a.durationMin);
}

export function appointmentsOnDay(t: Tables, date: string, includeCancelled = true): Appointment[] {
  return [...t.appointments.values()]
    .filter((a) => localDateOf(a.start) === date && (includeCancelled || a.status !== 'cancelled'))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function appointmentsBetween(t: Tables, from: string, to: string): Appointment[] {
  return [...t.appointments.values()]
    .filter((a) => {
      const d = localDateOf(a.start);
      return d >= from && d <= to;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

export interface ScheduleIssue {
  level: 'error' | 'warning';
  message: string;
  appointmentId?: string;
}

/**
 * Detecta horarios incompatibles: superposición, tiempo de traslado insuficiente entre visitas
 * (según los minutos de traslado registrados) y visitas fuera del horario de trabajo configurado.
 */
export function scheduleIssues(
  t: Tables,
  s: Settings,
  cand: { id?: string; start: string; durationMin: number; travelMin?: number },
): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];
  const day = localDateOf(cand.start);
  const cStart = new Date(cand.start).getTime();
  const cEnd = cStart + cand.durationMin * 60_000;
  const cTravel = (cand.travelMin ?? s.agenda.defaultTravelMin) * 60_000;
  for (const o of appointmentsOnDay(t, day, false)) {
    if (o.id === cand.id) continue;
    const oStart = new Date(o.start).getTime();
    const oEnd = oStart + o.durationMin * 60_000;
    const oTravel = (o.travelMin ?? s.agenda.defaultTravelMin) * 60_000;
    const who = o.patientIds.map((id) => t.patients.get(id)?.name).filter(Boolean).join(', ') || 'otra visita';
    if (cStart < oEnd && oStart < cEnd) {
      issues.push({ level: 'error', message: `Se superpone con ${who} (${formatTime(o.start)}–${formatTime(apptEnd(o))}).`, appointmentId: o.id });
    } else if (oEnd <= cStart && cStart - oEnd < cTravel) {
      issues.push({
        level: 'warning',
        message: `Después de ${who} (termina ${formatTime(apptEnd(o))}) quedan ${Math.round((cStart - oEnd) / 60000)} min; el traslado estimado es de ${Math.round(cTravel / 60000)} min.`,
        appointmentId: o.id,
      });
    } else if (cEnd <= oStart && oStart - cEnd < oTravel) {
      issues.push({
        level: 'warning',
        message: `Antes de ${who} (${formatTime(o.start)}) quedan ${Math.round((oStart - cEnd) / 60000)} min; el traslado estimado a esa visita es de ${Math.round(oTravel / 60000)} min.`,
        appointmentId: o.id,
      });
    }
  }
  const startT = localTimeOf(cand.start);
  const endT = localTimeOf(new Date(cEnd).toISOString());
  if (startT < s.agenda.dayStart || endT > s.agenda.dayEnd || localDateOf(new Date(cEnd).toISOString()) !== day) {
    issues.push({ level: 'warning', message: `Fuera del horario de trabajo configurado (${s.agenda.dayStart}–${s.agenda.dayEnd}).` });
  }
  return issues;
}

/** Enlace a Google Maps con las direcciones del día en orden (sin API ni ubicación permanente). */
export function dayRouteHref(list: Appointment[]): string | null {
  const stops = list.filter((a) => a.status !== 'cancelled').map((a) => addressText(a.address)).filter(Boolean);
  if (!stops.length) return null;
  const enc = (s: string) => encodeURIComponent(`${s}, Chile`);
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1);
  return `https://www.google.com/maps/dir/?api=1&destination=${enc(destination)}${waypoints.length ? `&waypoints=${waypoints.map(enc).join('%7C')}` : ''}&travelmode=driving`;
}

// ---------------------------------------------------------------------------
// Exportación a Calendario (.ics): evento con alarma, sin información clínica.
// ---------------------------------------------------------------------------
function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function appointmentIcs(t: Tables, s: Settings, a: Appointment, appName: string): string {
  const patients = a.patientIds.map((id) => t.patients.get(id)?.name).filter(Boolean).join(', ');
  const summary = s.calendar.includePatientName && patients ? `Visita ${appName}: ${patients}` : `Visita ${appName}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${appName}//Agenda//ES`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${a.id}@vetcasa.local`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(a.start)}`,
    `DTEND:${icsDate(apptEnd(a))}`,
    `SUMMARY:${icsEscape(summary)}`,
  ];
  if (s.calendar.includeAddress && addressText(a.address)) lines.push(`LOCATION:${icsEscape(addressText(a.address))}`);
  lines.push(
    `DESCRIPTION:${icsEscape('Detalle disponible en la app.')}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(`Visita ${appName}`)}`,
    'TRIGGER:-PT60M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return `${lines.join('\r\n')}\r\n`;
}
