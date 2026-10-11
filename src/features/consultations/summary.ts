import type { Tables } from '@/data/store';
import type { Consultation, Diagnosis, Treatment } from '@/data/schema';
import { EXAM_SYSTEMS } from '@/data/schema';
import { ADHERENCE, CONSULT_KIND, DX_KIND, DX_STATUS, EXAM_SYSTEM, FINDING, TREAT_KIND, TREAT_STATUS } from '@/data/labels';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatDecimal } from '@/lib/numbers';

export interface SummarySection {
  title: string;
  rows: Array<{ label: string; value: string }>;
}

const v = (s?: string | null) => (s && s.trim() ? s.trim() : '');

/** Resumen estructurado de la consulta (solo datos registrados; lo no evaluado se declara como tal). */
export function consultationSummary(t: Tables, c: Consultation, diagnoses?: Diagnosis[], treatments?: Treatment[]): SummarySection[] {
  const dx = diagnoses ?? [...t.diagnoses.values()].filter((d) => d.consultationId === c.id);
  const tx = treatments ?? [...t.treatments.values()].filter((x) => x.consultationId === c.id);
  const out: SummarySection[] = [];
  const push = (title: string, rows: Array<[string, string | undefined | null]>) => {
    const filtered = rows.filter(([, val]) => v(val)).map(([label, val]) => ({ label, value: v(val) }));
    if (filtered.length) out.push({ title, rows: filtered });
  };

  push('Atención', [
    ['Tipo', CONSULT_KIND[c.kind]],
    ['Fecha', formatDateTime(c.startedAt)],
    ['Profesional', c.professionalName],
    ['Control de', c.followUpOfId ? `Consulta del ${formatDate(t.consultations.get(c.followUpOfId)?.startedAt)}` : undefined],
  ]);
  push('Motivo de consulta', [
    ['Motivo principal', c.reason.main],
    ['Síntomas informados por el tutor', c.reason.ownerSymptoms],
    ['Inicio', c.reason.onset],
    ['Evolución', c.reason.evolution],
    ['Antecedentes relacionados', c.reason.related],
  ]);
  push('Anamnesis', [
    ['Historia actual', c.anamnesis.current],
    ['Antecedentes médicos', c.anamnesis.medical],
    ['Alimentación', c.anamnesis.diet],
    ['Conducta y eliminación', c.anamnesis.behaviorElimination],
    ['Tratamientos previos', c.anamnesis.previousTreatments],
    ['Otros', c.anamnesis.other],
    ...c.anamnesis.custom.map((x) => [x.label, x.value] as [string, string]),
  ]);

  const e = c.exam;
  const vitals: Array<[string, string | undefined]> = [
    ['Peso', e.weightKg !== undefined ? `${formatDecimal(e.weightKg)} kg` : undefined],
    ['Temperatura', e.temperatureC !== undefined ? `${formatDecimal(e.temperatureC, 1)} °C` : undefined],
    ['Frecuencia cardíaca', e.heartRateBpm !== undefined ? `${e.heartRateBpm} lpm` : undefined],
    ['Frecuencia respiratoria', e.respRateRpm !== undefined ? `${e.respRateRpm} rpm` : undefined],
    ['Tiempo de llenado capilar', e.crtSec !== undefined ? `${formatDecimal(e.crtSec, 1)} s` : undefined],
    ['Condición corporal', e.bcs.value !== undefined ? `${e.bcs.value}/${e.bcs.scale}` : undefined],
  ];
  const findingText = (status: string, extra?: string, notes?: string) =>
    status === 'not_evaluated' ? '' : [FINDING[status as keyof typeof FINDING], extra, notes].filter(Boolean).join(' · ');
  const systems: Array<[string, string]> = [
    ['Estado general', findingText(e.generalState.status, undefined, e.generalState.notes)],
    ['Mucosas', findingText(e.mucous.status, e.mucous.color, e.mucous.notes)],
    ['Hidratación', findingText(e.hydration.status, e.hydration.dehydrationPct !== undefined ? `${formatDecimal(e.hydration.dehydrationPct)} % deshidratación` : undefined, e.hydration.notes)],
    ...EXAM_SYSTEMS.map((k) => [EXAM_SYSTEM[k], findingText(e.systems[k]?.status ?? 'not_evaluated', undefined, e.systems[k]?.notes)] as [string, string]),
  ];
  const notEvaluated = [
    e.generalState.status === 'not_evaluated' ? 'estado general' : null,
    e.mucous.status === 'not_evaluated' ? 'mucosas' : null,
    e.hydration.status === 'not_evaluated' ? 'hidratación' : null,
    ...EXAM_SYSTEMS.filter((k) => (e.systems[k]?.status ?? 'not_evaluated') === 'not_evaluated').map((k) => EXAM_SYSTEM[k].toLowerCase()),
  ].filter(Boolean);
  push('Examen físico', [
    ...vitals,
    ...systems,
    ['Otros hallazgos', e.otherFindings],
    ['Observaciones', e.notes],
    ['No evaluado', notEvaluated.length ? notEvaluated.join(', ') : undefined],
  ]);

  push('Evaluación clínica', [
    ['Lista de problemas', c.assessment.problems.map((p) => `• ${p.text}`).join('\n')],
    ['Diagnósticos diferenciales', dx.filter((d) => d.kind === 'differential').map((d) => `• ${d.name}`).join('\n')],
    ['Diagnóstico presuntivo', dx.filter((d) => d.kind === 'presumptive').map((d) => `• ${d.name} (${DX_STATUS[d.status].toLowerCase()})`).join('\n')],
    ['Diagnóstico confirmado', dx.filter((d) => d.kind === 'confirmed').map((d) => `• ${d.name} (${DX_STATUS[d.status].toLowerCase()})`).join('\n')],
    ['Exámenes solicitados', c.assessment.testsRequested],
    ['Resultados disponibles', c.assessment.resultsAvailable],
    ['Interpretación clínica', c.assessment.interpretation],
    ['Pronóstico', c.assessment.prognosis],
  ]);

  push('Plan de manejo', [
    [
      'Tratamientos',
      tx
        .map((x) =>
          `• ${x.name}${x.kind !== 'medication' ? ` (${TREAT_KIND[x.kind].toLowerCase()})` : ''}${[x.dose, x.route, x.frequency, x.durationDays ? `${x.durationDays} días` : ''].filter(Boolean).length ? `: ${[x.dose, x.route, x.frequency, x.durationDays ? `${x.durationDays} días` : ''].filter(Boolean).join(', ')}` : ''}${x.instructions ? `. ${x.instructions}` : ''}${x.status !== 'active' ? ` [${TREAT_STATUS[x.status]}]` : ''}`,
        )
        .join('\n'),
    ],
    ['Cuidados domiciliarios', c.plan.homeCare],
    ['Recomendaciones al tutor', c.plan.ownerRecommendations],
    ['Exámenes pendientes', c.plan.pendingTests],
    ['Derivación', [c.plan.referralTo, c.plan.referralReason].filter(Boolean).join(': ')],
    ['Próximo control', c.plan.controlDate ? formatDate(c.plan.controlDate) : undefined],
    ['Observaciones finales', c.plan.finalNotes],
  ]);

  if (c.followUp) {
    const f = c.followUp;
    push('Seguimiento', [
      ['Evolución de los síntomas', f.symptomsEvolution],
      ['Adherencia (informada por el tutor)', f.adherence ? `${ADHERENCE[f.adherence]}${f.adherenceNotes ? ` · ${f.adherenceNotes}` : ''}` : undefined],
      ['Respuesta clínica', f.clinicalResponse],
      ['Efectos adversos', f.adverseEffects],
      ['Nuevos hallazgos', f.newFindings],
      ['Ajustes terapéuticos', f.adjustments],
      ['Próxima revisión', f.nextReview ? formatDate(f.nextReview) : undefined],
    ]);
  }
  return out;
}

export function summaryAsText(sections: SummarySection[]): string {
  return sections.map((s) => `${s.title.toUpperCase()}\n${s.rows.map((r) => `${r.label}: ${r.value}`).join('\n')}`).join('\n\n');
}

export { DX_KIND };
