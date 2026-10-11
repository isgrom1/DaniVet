import type { NewEntity } from './schema';

export const DASHBOARD_SECTIONS = [
  { key: 'today', label: 'Visitas de hoy' },
  { key: 'drafts', label: 'Consultas por completar' },
  { key: 'tasks', label: 'Tareas de seguimiento' },
  { key: 'exams', label: 'Resultados por revisar' },
  { key: 'controls', label: 'Controles y tratamientos próximos' },
  { key: 'preventive', label: 'Vacunas y desparasitaciones' },
  { key: 'payments', label: 'Pagos pendientes' },
  { key: 'upcoming', label: 'Próximas visitas' },
  { key: 'recent', label: 'Pacientes recientes' },
  { key: 'inventory', label: 'Inventario (stock y vencimientos)' },
] as const;

export type DashboardSectionKey = (typeof DASHBOARD_SECTIONS)[number]['key'];

export function defaultSettings(): NewEntity<'settings'> {
  const s: NewEntity<'settings'> = {
    id: 'settings',
    dashboard: { order: DASHBOARD_SECTIONS.map((s) => s.key), hidden: [] },
    agenda: { defaultDurationMin: 60, defaultTravelMin: 20, dayStart: '08:00', dayEnd: '20:00', weekStartsOn: 1 },
    reminders: { vaccineDaysAhead: 30, dewormingDaysAhead: 15, controlDaysAhead: 7, overdueWindowDays: 180 },
    security: { autoLockMinutes: 15 },
    paymentMethods: [
      { id: 'cash', name: 'Efectivo', active: true },
      { id: 'transfer', name: 'Transferencia', active: true },
      { id: 'card', name: 'Tarjeta (terminal externo)', active: true },
      { id: 'other', name: 'Otro', active: true },
    ],
    calendar: { includePatientName: true, includeAddress: false },
    backup: { reminderDays: 7 },
  };
  return s;
}

export function defaultSpecies(): Array<NewEntity<'species'>> {
  return [
    {
      name: 'Perro',
      active: true,
      builtin: 'dog',
      bcsScale: 9,
      refRanges: {},
      extraFields: [
        { key: 'size', label: 'Talla', type: 'select', options: ['Toy', 'Pequeña', 'Mediana', 'Grande', 'Gigante'] },
        { key: 'activity', label: 'Nivel de actividad', type: 'select', options: ['Bajo', 'Moderado', 'Alto', 'Trabajo / deporte'] },
      ],
    },
    {
      name: 'Gato',
      active: true,
      builtin: 'cat',
      bcsScale: 9,
      refRanges: {},
      extraFields: [
        { key: 'outdoor', label: 'Acceso al exterior', type: 'select', options: ['Solo interior', 'Interior y exterior', 'Principalmente exterior'] },
        { key: 'retroviral', label: 'Estado FIV/FeLV (si fue testeado)', type: 'text' },
        { key: 'litter', label: 'Tipo de arena / bandeja', type: 'text' },
      ],
    },
  ];
}

const DISCLAIMER =
  'Plantilla editable. Revise y adapte este texto con su asesoría o su colegio profesional antes de usarlo.';

/** Plantillas iniciales de documentos (texto genérico y editable). Marcadores: {tutor}, {rut_tutor}, {paciente}, {especie}, {profesional}, {procedimiento}, {fecha}. */
export function defaultTemplates(): Array<NewEntity<'templates'>> {
  return [
    {
      kind: 'consent',
      name: 'Consentimiento informado (general)',
      active: true,
      fields: {
        note: DISCLAIMER,
        body:
          'Yo, {tutor}, RUT {rut_tutor}, en mi calidad de tutor(a) responsable de {paciente} ({especie}), declaro que {profesional} me ha informado de manera clara sobre el procedimiento indicado, su objetivo, los beneficios esperados, los riesgos y posibles complicaciones, las alternativas disponibles y las consecuencias de no realizarlo. He tenido la oportunidad de hacer preguntas, las que fueron respondidas.\n\nEn conocimiento de lo anterior, autorizo la realización del procedimiento descrito en este documento. Si durante su ejecución surgiera una situación imprevista, autorizo a la profesional a adoptar las medidas necesarias para resguardar la vida y el bienestar del paciente, informándome a la brevedad.',
      },
    },
    {
      kind: 'refusal',
      name: 'Rechazo de procedimiento',
      active: true,
      fields: {
        note: DISCLAIMER,
        body:
          'Yo, {tutor}, RUT {rut_tutor}, en mi calidad de tutor(a) responsable de {paciente} ({especie}), declaro que {profesional} me ha informado sobre la indicación de {procedimiento}, sus beneficios, sus riesgos y las posibles consecuencias de no realizarlo.\n\nHabiendo comprendido esta información, decido no autorizar su realización en este momento y asumo la responsabilidad por esta decisión. Se me ha explicado que puedo cambiar de opinión y solicitar nuevamente la atención.',
      },
    },
    {
      kind: 'indications',
      name: 'Indicaciones posteriores a la atención',
      active: true,
      fields: {
        note: DISCLAIMER,
        body:
          'Siga las indicaciones de este documento. Ante cualquier duda, o si observa signos de alarma, comuníquese con la profesional tratante. Si no logra contactarla en una urgencia, acuda a un centro veterinario de urgencia.',
      },
    },
    {
      kind: 'referral',
      name: 'Informe de derivación',
      active: true,
      fields: {
        note: DISCLAIMER,
        body: 'Se deriva al paciente para evaluación y manejo según se detalla. Quedo disponible para complementar la información clínica.',
      },
    },
    {
      kind: 'exam_order',
      name: 'Orden de exámenes',
      active: true,
      fields: {
        note: DISCLAIMER,
        body: 'Solicito realizar los exámenes indicados al paciente individualizado en este documento.',
      },
    },
  ];
}

export const SUGGESTED_SERVICES: Array<{ name: string; category: 'fee' | 'travel' | 'supply' | 'medication' | 'other'; durationMin?: number }> = [
  { name: 'Consulta a domicilio', category: 'fee', durationMin: 60 },
  { name: 'Control', category: 'fee', durationMin: 30 },
  { name: 'Vacunación (aplicación)', category: 'fee', durationMin: 30 },
  { name: 'Desparasitación (aplicación)', category: 'fee', durationMin: 20 },
  { name: 'Toma de muestras', category: 'fee', durationMin: 30 },
  { name: 'Curación', category: 'fee', durationMin: 30 },
  { name: 'Recargo por traslado', category: 'travel' },
];
