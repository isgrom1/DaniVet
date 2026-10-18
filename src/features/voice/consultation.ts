import { EXAM_SYSTEMS, type Diagnosis, type ExamSystem, type Treatment } from '@/data/schema';
import { EXAM_SYSTEM } from '@/data/labels';
import { addDays, formatDate } from '@/lib/dates';
import { formatDecimal } from '@/lib/numbers';
import { findNumber, fold, segment, sentences, tidy, type MarkerDef, type Segment } from './text';

/**
 * Interpreta lo que la profesional dictó durante la consulta y lo convierte en datos propuestos para la ficha.
 * - Solo usa lo dictado: nunca agrega valores normales ni dosis por su cuenta.
 * - Cada dato se muestra antes de agregarlo y queda marcado "Dictado: revisar" hasta que se revisa.
 * - Lo que no se entiende no se descarta: queda en la transcripción guardada con la consulta.
 */

export type SectionKey = 'reason' | 'anamnesis' | 'exam' | 'assessment' | 'plan';

export const SECTION_LABEL: Record<SectionKey, string> = {
  reason: 'Motivo',
  anamnesis: 'Anamnesis',
  exam: 'Examen físico',
  assessment: 'Evaluación',
  plan: 'Plan',
};

export type TextPath =
  | 'reason.main'
  | 'reason.ownerSymptoms'
  | 'reason.onset'
  | 'anamnesis.current'
  | 'anamnesis.medical'
  | 'anamnesis.diet'
  | 'anamnesis.behaviorElimination'
  | 'anamnesis.previousTreatments'
  | 'exam.otherFindings'
  | 'exam.notes'
  | 'assessment.testsRequested'
  | 'assessment.interpretation'
  | 'assessment.prognosis'
  | 'plan.homeCare'
  | 'plan.ownerRecommendations'
  | 'plan.pendingTests'
  | 'plan.referralTo'
  | 'plan.finalNotes';
export type NumberPath = 'exam.weightKg' | 'exam.temperatureC' | 'exam.heartRateBpm' | 'exam.respRateRpm' | 'exam.crtSec';
export type FindingPath = 'exam.generalState' | `exam.systems.${ExamSystem}`;

export interface TreatmentChange {
  kind: 'treatment';
  txKind: Treatment['kind'];
  name: string;
  dose?: string;
  route?: string;
  frequency?: string;
  durationDays?: number;
  instructions?: string;
}

export type Change =
  | { kind: 'text'; path: TextPath; value: string; replace: boolean }
  | { kind: 'number'; path: NumberPath; value: number }
  | { kind: 'finding'; path: FindingPath; status: 'normal' | 'abnormal'; notes?: string }
  | { kind: 'mucous'; status: 'normal' | 'abnormal'; color?: string; notes?: string }
  | { kind: 'hydration'; status: 'normal' | 'abnormal'; pct?: number; notes?: string }
  | { kind: 'bcs'; value: number; scale: 5 | 9 }
  | { kind: 'restNormal' }
  | { kind: 'diagnosis'; name: string; dxKind: Diagnosis['kind'] }
  | TreatmentChange
  | { kind: 'controlDate'; date: string };

export interface ParsedItem {
  id: string;
  section: SectionKey;
  label: string;
  display: string;
  /** Frase dictada de la que salió el dato. */
  source: string;
  change: Change;
  warning?: string;
  /** Si se agrega por defecto (no, cuando el valor parece imposible o la palabra clave no se dijo). */
  selected: boolean;
}

export interface ParseResult {
  items: ParsedItem[];
  /** Frases que no se pudieron ubicar: quedan en la transcripción guardada. */
  unplaced: string[];
}

export interface ParseOptions {
  /** Fecha de la consulta ('AAAA-MM-DD'): base para "control en 7 días". */
  baseDate: string;
  /** Escala de condición corporal configurada para la especie. */
  bcsScale: 5 | 9;
  /** Nombres de medicamentos conocidos (catálogo y tratamientos anteriores). */
  knownMeds?: string[];
}

type NumKey = 'weight' | 'temperature' | 'heartRate' | 'respRate' | 'crt';
type Key =
  | TextPath
  | NumKey
  | 'bcs'
  | 'mucous'
  | 'hydration'
  | 'generalState'
  | 'restNormal'
  | 'diagnosis'
  | 'treatment'
  | 'control'
  | 'murmur'
  | `system:${ExamSystem}`;

/** Palabras que pueden ir entre la palabra clave y el número ("peso de 12", "temperatura rectal es 39"). */
const FILLER = /^[\s:=]*(?:(?:de|del|es|en|actual|hoy|corporal|rectal|aprox|aproximadamente|aproximad[oa]|cerca de|unos|unas|alrededor de|menor (?:a|de)|menos de|mayor (?:a|de)|mas de|[<>])[\s:=]*)*$/;
const NORMAL_WORDS = /^[\s:]*(?:normal(?:es)?|sin alteraciones|dentro de (?:lo|rangos?) normal(?:es)?)(?![a-z])/;

/** La palabra clave de un valor numérico vale solo si le sigue un número (o "normal", que se informa como no registrado). */
function numberFollows(after: string): boolean {
  if (NORMAL_WORDS.test(after)) return true;
  const n = findNumber(after.slice(0, 60));
  return !!n && FILLER.test(after.slice(0, n.index));
}

const CONTROL_AFTER = /^\s*(?:en|dentro de|a|para)\s+(?:(?:\d+|[a-z]+)\s+)?(?:dias?|semanas?|mes(?:es)?)(?![a-z])/;

const SYSTEM_MARKERS: Record<ExamSystem, string> = {
  cardiovascular: 'corazon|cardiovascular|cardiaco|auscultacion cardiaca|sistema cardiovascular',
  respiratory: 'respiratorio|sistema respiratorio|pulmones|pulmonar|campos pulmonares|auscultacion pulmonar|vias respiratorias',
  digestive: 'digestivo|sistema digestivo|abdomen|palpacion abdominal',
  dermatological: 'piel(?: y anexos)?|pelaje|manto|dermatologico',
  ocular: 'ojos|ocular|oftalmologico|oftalmico',
  otic: 'oidos|oido|otico|conductos? auditivos?|otoscopia',
  musculoskeletal: 'musculoesqueletico|locomotor|aparato locomotor|articulaciones',
  neurological: 'neurologico|examen neurologico|sistema nervioso',
  lymphNodes: 'linfonodos|linfonodulos|ganglios(?: linfaticos)?',
  urogenital: 'urogenital|genitourinario|sistema urinario|vejiga|genitales',
  oral: 'cavidad oral|boca|dientes|encias|dentadura',
};

/** Comienzo típico de un hallazgo ("pulmones con crepitaciones", "oídos sin secreción"). */
const FINDING_FOLLOWS = /^\s*(?::|con\b|sin\b|presenta|normal|alterad|conservad|s\/a|dentro de|se (?:palpa|observa|ausculta|aprecia|encuentra))/;
/** Contextos para aceptar una palabra clave a mitad de frase (dictado sin puntuación). */
const IN_EXAM = { sections: ['exam'], follow: FINDING_FOLLOWS };
const AFTER_EXAM = { sections: ['exam', 'assessment', 'plan'] };
const IN_PLAN = { sections: ['assessment', 'plan'] };

const MARKER_LIST: MarkerDef<Key>[] = [
  { key: 'reason.main', re: 'motivo de (?:la )?(?:consulta|visita|atencion)' },
  { key: 'reason.main', re: 'motivo|consulta por', weak: true },
  { key: 'reason.ownerSymptoms', re: '(?:el |la )?(?:tutora?|duen[oa]|propietari[oa]) (?:cuenta|refiere|indica|informa|comenta|dice|relata|senala)(?: que)?' },
  { key: 'reason.onset', re: '(?:fecha de )?inicio(?: de (?:los )?sintomas)?', weak: true },
  { key: 'anamnesis.previousTreatments', re: 'tratamientos? (?:previos?|anterior(?:es)?)' },
  { key: 'anamnesis.medical', re: 'antecedentes(?: medicos)?(?: relevantes)?', weak: true },
  { key: 'anamnesis.diet', re: 'alimentacion|dieta|se alimenta(?: con| de)?', weak: true },
  { key: 'anamnesis.current', re: 'historia actual' },
  { key: 'anamnesis.current', re: 'anamnesis(?: actual)?', weak: true },
  { key: 'anamnesis.behaviorElimination', re: 'conducta y eliminacion|eliminacion', weak: true },
  { key: 'weight', re: 'peso(?: corporal)?|pesa', accept: numberFollows },
  { key: 'temperature', re: 'temperatura(?: rectal)?|temp', accept: numberFollows },
  { key: 'heartRate', re: 'frecuencia cardiaca|fc|efe ce|pulso', accept: numberFollows },
  { key: 'respRate', re: 'frecuencia respiratoria|fr|efe erre', accept: numberFollows },
  { key: 'crt', re: 'tiempo de llen(?:ado|e) capilar|llen(?:ado|e) capilar|tllc|tlc', accept: numberFollows },
  { key: 'bcs', re: 'condicion corporal|bcs|puntaje corporal', accept: numberFollows },
  {
    key: 'mucous',
    re: 'mucosas?(?: orales| oculares)?',
    weak: true,
    context: { sections: ['exam'], follow: /^\s*(?::|rosad|palid|congestiv|hiperemic|cianotic|icteric|amarill|normal|humed|sec[oa]s?\b)/ },
  },
  { key: 'hydration', re: 'hidratacion|deshidratad[oa]|deshidratacion', weak: true, context: { sections: ['exam'] } },
  { key: 'generalState', re: '(?:(?:buen|mal|regular) )?estado general' },
  {
    key: 'restNormal',
    re: 'resto(?: del examen(?: fisico)?| de (?:los )?sistemas)? (?:es |esta |se encuentra )?(?:normal(?:es)?|sin alteraciones|sin hallazgos|s\\/a|sin particularidades|dentro de lo normal)',
  },
  { key: 'exam.otherFindings', re: 'otros hallazgos|hallazgos adicionales' },
  { key: 'exam.notes', re: 'observaciones del examen|notas del examen' },
  { key: 'assessment.testsRequested', re: 'solicito|se solicitan?|pido|se piden|examenes solicitados|examenes complementarios', weak: true, context: AFTER_EXAM },
  { key: 'assessment.interpretation', re: 'interpretacion(?: clinica)?|impresion clinica', weak: true },
  { key: 'assessment.prognosis', re: 'pronostico', weak: true, context: IN_PLAN },
  { key: 'diagnosis', re: 'diagnosticos? (?:presuntivos?|presuntivas?|confirmados?|definitivos?|diferencial(?:es)?|probables?)' },
  { key: 'diagnosis', re: 'diagnosticos?|dx|diferencial(?:es)?|impresion diagnostica|sospecha de|sospecho(?: de| que)?', weak: true, context: AFTER_EXAM },
  {
    key: 'treatment',
    re: 'tratamiento(?: indicado)?|indico|indicamos|receto|se indica|se receta|medicacion|terapia|plan terapeutico|se administra|administro|se aplica|aplico',
    weak: true,
    context: IN_PLAN,
  },
  { key: 'plan.homeCare', re: 'cuidados(?: en casa| domiciliarios| en el hogar)?', weak: true, context: IN_PLAN },
  {
    key: 'plan.ownerRecommendations',
    re: 'recomendaciones(?: al tutor| a la tutora)?|indicaciones al tutor|indicaciones a la tutora|recomiendo|se recomienda',
    weak: true,
    context: IN_PLAN,
  },
  { key: 'plan.pendingTests', re: 'examenes pendientes' },
  { key: 'control', re: '(?:proximo )?(?:re)?control|volver a (?:ver|revisar)(?:lo|la)?|revision', accept: (after) => CONTROL_AFTER.test(after) },
  { key: 'plan.referralTo', re: '(?:se )?deriv(?:o|ar|a|acion) (?:a|al)', weak: true, context: IN_PLAN },
  { key: 'plan.finalNotes', re: 'observaciones finales|notas? finale?s?|comentario final' },
  { key: 'murmur', re: 'soplos?', weak: true, keepMarker: true, context: { sections: ['exam'] } },
  ...EXAM_SYSTEMS.map((s) => ({ key: `system:${s}` as const, re: SYSTEM_MARKERS[s], weak: true, context: IN_EXAM })),
];

const TEXT_SPEC: Record<TextPath, { label: string; section: SectionKey; replace: boolean }> = {
  'reason.main': { label: 'Motivo principal', section: 'reason', replace: true },
  'reason.ownerSymptoms': { label: 'Síntomas informados por el tutor', section: 'reason', replace: false },
  'reason.onset': { label: 'Fecha de inicio', section: 'reason', replace: true },
  'anamnesis.current': { label: 'Historia actual', section: 'anamnesis', replace: false },
  'anamnesis.medical': { label: 'Antecedentes médicos', section: 'anamnesis', replace: false },
  'anamnesis.diet': { label: 'Alimentación', section: 'anamnesis', replace: false },
  'anamnesis.behaviorElimination': { label: 'Conducta y eliminación', section: 'anamnesis', replace: false },
  'anamnesis.previousTreatments': { label: 'Tratamientos previos', section: 'anamnesis', replace: false },
  'exam.otherFindings': { label: 'Otros hallazgos', section: 'exam', replace: false },
  'exam.notes': { label: 'Observaciones del examen', section: 'exam', replace: false },
  'assessment.testsRequested': { label: 'Exámenes solicitados', section: 'assessment', replace: false },
  'assessment.interpretation': { label: 'Interpretación clínica', section: 'assessment', replace: false },
  'assessment.prognosis': { label: 'Pronóstico', section: 'assessment', replace: true },
  'plan.homeCare': { label: 'Cuidados domiciliarios', section: 'plan', replace: false },
  'plan.ownerRecommendations': { label: 'Recomendaciones al tutor', section: 'plan', replace: false },
  'plan.pendingTests': { label: 'Exámenes pendientes', section: 'plan', replace: false },
  'plan.referralTo': { label: 'Derivación a', section: 'plan', replace: true },
  'plan.finalNotes': { label: 'Observaciones finales', section: 'plan', replace: false },
};

/** Límites: fuera de `hard` la ficha no lo admite (no se agrega por defecto); fuera de `usual` se pide revisar. */
const NUMBERS: Record<NumKey, { path: NumberPath; label: string; unit: string; digits: number; integer?: boolean; hard: [number, number]; usual: [number, number] }> = {
  weight: { path: 'exam.weightKg', label: 'Peso', unit: 'kg', digits: 3, hard: [0.001, 2000], usual: [0.03, 120] },
  temperature: { path: 'exam.temperatureC', label: 'Temperatura', unit: '°C', digits: 1, hard: [20, 46], usual: [35, 42.5] },
  heartRate: { path: 'exam.heartRateBpm', label: 'Frecuencia cardíaca', unit: 'lpm', digits: 0, integer: true, hard: [1, 500], usual: [30, 300] },
  respRate: { path: 'exam.respRateRpm', label: 'Frecuencia respiratoria', unit: 'rpm', digits: 0, integer: true, hard: [1, 300], usual: [5, 120] },
  crt: { path: 'exam.crtSec', label: 'Llenado capilar (TLLC)', unit: 's', digits: 1, hard: [0, 20], usual: [0, 5] },
};

/** Unidad dictada después del número (se descarta: la ficha ya define la unidad). */
const UNIT_AFTER = /^\s*(?:kilos?|kilogramos?|kgs?|gramos|grs?|g|grados(?: celsius| centigrados)?|°\s*c?|celsius|latidos(?: por minuto)?|lpm|respiraciones(?: por minuto)?|rpm|ciclos(?: por minuto)?|(?:por|x) minuto|segundos?|segs?|s)(?![a-z])\.?/;

const NORMAL_RE =
  /^[\s:,]*(?:(?:es|esta|estan|se encuentra|se encuentran|se ve|se ven|se aprecia|se aprecian)\s+)?(?:normal(?:es)?|sin alteraciones|sin hallazgos(?: relevantes)?|sin particularidades|s\/a|conservad[oa]s?|dentro de (?:lo|rangos?) normal(?:es)?|nada (?:que destacar|relevante)|buen[oa]?|adecuad[oa]s?|bien|ok)(?![a-z])/;
const LEAD_ABNORMAL = /^[\s:,]*(?:(?:esta|estan|se encuentra|se encuentran|se observa|se observan|se aprecia|se aprecian|presenta|presentan|con|alterad[oa]s?|anormal(?:es)?)(?![a-z])[\s:,]*)+/;
/** Palabras que indican un hallazgo aunque la frase comience con "normal" o "sin…". */
const CONTRAST = /\b(?:pero|aunque|salvo|excepto|con|presenta|presentan|se (?:palpa|palpan|observa|observan|aprecia|aprecian|ausculta|detecta))\b/;

const MUCOUS_COLOR: Array<[RegExp, string, 'normal' | 'abnormal']> = [
  [/\brosad/, 'Rosadas', 'normal'],
  [/\bpalid/, 'Pálidas', 'abnormal'],
  [/\b(?:congestiv|hiperemic)/, 'Congestivas', 'abnormal'],
  [/\bcianotic/, 'Cianóticas', 'abnormal'],
  [/\b(?:icteric|amarill)/, 'Ictéricas', 'abnormal'],
];
const MUCOUS_WORD = /^[\s:,]*(?:(?:estan|se ven|se observan|se aprecian)\s+)?(?:rosad[oa]s?|palid[oa]s?|congestiv[oa]s?|hiperemic[oa]s?|cianotic[oa]s?|icteric[oa]s?|amarill[oa]s?|normal(?:es)?)(?![a-z])[\s,]*(?:y\s+)?/;

const ROUTES: Array<[RegExp, string]> = [
  [/\b(?:via )?(?:oral|vo|por boca)\b/, 'Oral'],
  [/\b(?:via )?(?:subcutanea|subcutaneo|sc|sq)\b/, 'SC'],
  [/\b(?:via )?(?:intramuscular|im)\b/, 'IM'],
  [/\b(?:via )?(?:intravenosa|intravenoso|endovenosa|endovenoso|iv|ev)\b/, 'IV'],
  [/\b(?:via )?(?:topica|topico|en la piel)\b/, 'Tópica'],
  [/\b(?:via )?(?:otica|en el oido|en los oidos)\b/, 'Ótica'],
  [/\b(?:via )?(?:oftalmica|en el ojo|en los ojos)\b/, 'Oftálmica'],
];
const DOSE_RE =
  /(\d+(?:[.,]\d+)?|medio|media|un cuarto|una?|1\/2|1\/4|3\/4)\s*(?:de\s+)?(mg|miligramos?|ml|mililitros?|mcg|microgramos?|ug|µg|g|gr|gramos?|ui|unidad(?:es)?|cc|comprimidos?|tabletas?|tabs?|capsulas?|gotas?|pipetas?|aplicacion(?:es)?|puffs?|sobres?)(?![a-z])(?:\s*(?:\/|por)\s*(?:kg|kilo(?:gramo)?s?)(?![a-z]))?/;
const FREQ_RE =
  /\b(?:cada|c\/)\s*(\d+(?:[.,]\d+)?|[a-z]+)\s*(?:horas?|hrs?|h)(?![a-z])|\b(?:una|dos|tres|cuatro) veces al dia\b|\b(?:una vez al dia|diariamente|cada dia|al dia|en dosis unica|dosis unica)\b/;
const DURATION_RE = /\b(?:por|durante)\s+(\d+|[a-z]+)\s+(dias?|semanas?|mes(?:es)?)(?![a-z])/;
/** Palabras de enlace que no forman parte del nombre de un medicamento ni de sus instrucciones. */
const LINK_WORDS = new Set(['y', 'e', 'luego', 'despues', 'ademas', 'mas', 'tambien', 'junto', 'con', 'via', 'de', 'del', 'por', 'durante', 'cada', 'al', 'el', 'la', 'los', 'las', 'a', 'en', 'dosis']);

/** Tramos de dosis, vía, frecuencia y duración dentro de una frase de tratamiento (texto plegado). */
function treatmentSpans(f: string): Array<{ start: number; end: number; dose: boolean }> {
  const spans: Array<{ start: number; end: number; dose: boolean }> = [];
  const collect = (re: RegExp, dose = false) => {
    const g = new RegExp(re.source, 'g');
    for (let m = g.exec(f); m; m = g.exec(f)) {
      if (!m[0]) {
        g.lastIndex++;
        continue;
      }
      spans.push({ start: m.index, end: m.index + m[0].length, dose });
    }
  };
  collect(DOSE_RE, true);
  collect(FREQ_RE);
  collect(DURATION_RE);
  for (const [re] of ROUTES) collect(re);
  return spans.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** Palabras con contenido (no de enlace) en un tramo; devuelve la posición de la primera. */
function firstContentWord(f: string, from: number, to: number): number {
  const re = /[a-z]+/g;
  re.lastIndex = from;
  for (let m = re.exec(f); m && m.index < to; m = re.exec(f)) if (m[0].length > 2 && !LINK_WORDS.has(m[0])) return m.index;
  return -1;
}

/**
 * Separa varios medicamentos dictados en una misma frase ("maropitant 1 mg/kg SC cada 24 horas y omeprazol 1 mg/kg
 * oral cada 12 horas"): un nombre nuevo seguido de otra dosis comienza otro tratamiento.
 */
function splitTreatments(text: string): string[] {
  const f = fold(text);
  const spans = treatmentSpans(f);
  const cuts: number[] = [];
  let maxEnd = -1;
  for (const s of spans) {
    if (s.dose && maxEnd >= 0 && s.start > maxEnd) {
      const at = firstContentWord(f, maxEnd, s.start);
      if (at >= 0) cuts.push(at);
    }
    maxEnd = Math.max(maxEnd, s.end);
  }
  const out: string[] = [];
  let from = 0;
  for (const c of cuts) {
    out.push(text.slice(from, c));
    from = c;
  }
  out.push(text.slice(from));
  return out.map(tidy).filter(Boolean);
}

let seq = 0;
const nid = () => `d${Date.now().toString(36)}${(seq++).toString(36)}`;

const SECTION_OF: Partial<Record<Key, SectionKey>> = {
  diagnosis: 'assessment',
  treatment: 'plan',
  control: 'plan',
};
function sectionOf(k: Key): SectionKey {
  if (k in TEXT_SPEC) return TEXT_SPEC[k as TextPath].section;
  return SECTION_OF[k] ?? 'exam';
}

const MARKERS: MarkerDef<Key>[] = MARKER_LIST.map((d) => ({ ...d, section: sectionOf(d.key) }));

/** "7", "siete", "una" → número (para duraciones y plazos). */
function countOf(f: string): number | null {
  const n = findNumber(f);
  if (n && n.index === 0) return n.value;
  return /^(?:un|una|uno)$/.test(f.trim()) ? 1 : null;
}

/** "pancreatitis, cuerpo extraño y gastritis" → 3 nombres (se busca en el texto plegado: "ñ" no corta palabras). */
function splitList(text: string): string[] {
  const f = fold(text);
  const out: string[] = [];
  let from = 0;
  for (const m of f.matchAll(/\s*(?:[,;]|\b(?:y|e|o|u)\b)\s*/g)) {
    out.push(text.slice(from, m.index));
    from = m.index + m[0].length;
  }
  out.push(text.slice(from));
  return out.map(tidy).filter(Boolean);
}

function numberItem(key: NumKey, seg: Segment<Key>, unplaced: string[]): ParsedItem | null {
  const spec = NUMBERS[key];
  const n = findNumber(seg.folded.slice(0, 60));
  if (!n || !FILLER.test(seg.folded.slice(0, n.index))) {
    // "Temperatura normal": la ficha necesita el valor; no se registra nada.
    unplaced.push(seg.source);
    return null;
  }
  let value = n.value;
  let note = '';
  let end = n.index + n.length;
  const raw = seg.folded.slice(n.index, end);
  const unit = UNIT_AFTER.exec(seg.folded.slice(end));
  if (key === 'weight' && unit && /^\s*(?:gramos|grs?|g)(?![a-z])/.test(unit[0])) {
    // "12.400 gramos": el punto separa miles.
    value = /^\d{1,3}\.\d{3}$/.test(raw) ? Number(raw.replace('.', '')) / 1000 : value / 1000;
    note = ' (dictado en gramos)';
  }
  if (unit) end += unit[0].length;
  if (key === 'weight' && unit && !note) {
    const grams = /^\s*(?:y\s+)?(\d{1,3})\s*(?:gramos|grs?|g)(?![a-z])\.?/.exec(seg.folded.slice(end));
    if (grams) {
      value += Number(grams[1]) / 1000;
      end += grams[0].length;
    }
  }
  if (spec.integer && !Number.isInteger(value)) value = Math.round(value);
  const qualifier = /(menor|menos|mayor|mas)/.exec(seg.folded.slice(0, n.index));
  const rest = tidy(seg.text.slice(end));
  if (fold(rest).replace(/[^a-z0-9]/g, '').length > 2) unplaced.push(rest);
  const impossible = value < spec.hard[0] || value > spec.hard[1];
  const unusual = value < spec.usual[0] || value > spec.usual[1];
  return {
    id: nid(),
    section: 'exam',
    label: spec.label,
    display: `${formatDecimal(value, spec.digits)} ${spec.unit}${note}`,
    source: seg.source,
    change: { kind: 'number', path: spec.path, value },
    warning: impossible
      ? 'Valor fuera de lo que admite la ficha: no se agregará.'
      : qualifier
        ? `Dictaste «${qualifier[1]}…»: la ficha guarda solo el número.`
        : unusual
          ? 'Valor poco habitual: revisa que se haya entendido bien.'
          : undefined,
    selected: !impossible,
  };
}

function findingFrom(seg: Segment<Key>): { status: 'normal' | 'abnormal'; notes?: string } | null {
  const f = seg.folded;
  const normal = NORMAL_RE.exec(f);
  if (normal) {
    const extra = tidy(seg.text.slice(normal[0].length));
    if (extra && CONTRAST.test(fold(extra))) return { status: 'abnormal', notes: tidy(seg.text) };
    return { status: 'normal', notes: extra || undefined };
  }
  const lead = LEAD_ABNORMAL.exec(f);
  const body = tidy(seg.text.slice(lead ? lead[0].length : 0));
  if (!body) return null;
  // "Oídos sin secreción", "abdomen sin dolor": ausencia de hallazgos → normal, conservando la frase.
  if (/^sin\s/.test(fold(body)) && !CONTRAST.test(fold(body))) return { status: 'normal', notes: body };
  return { status: 'abnormal', notes: body };
}

type TreatmentPart = Partial<Pick<TreatmentChange, 'dose' | 'route' | 'frequency' | 'durationDays' | 'instructions'>>;

/** Una frase de tratamiento: medicamento, dosis, vía, frecuencia y duración tal como se dictaron. */
function treatmentFrom(text: string, knownMeds: string[]): TreatmentChange | { partial: TreatmentPart } | null {
  const f = fold(text);
  const freq = FREQ_RE.exec(f);
  const dur = DURATION_RE.exec(f);
  const dose = DOSE_RE.exec(f);
  let route: string | undefined;
  let routeAt = -1;
  for (const [re, label] of ROUTES) {
    const m = re.exec(f);
    if (m && (routeAt < 0 || m.index < routeAt)) {
      route = label;
      routeAt = m.index;
    }
  }
  const spans = treatmentSpans(f);
  const first = spans[0]?.start ?? f.length;
  const clean = (s: string) => tidy(s.replace(/^\s*(?:con|a base de|de|del|el|la|los|las)\s+/i, '').replace(/\s+(?:a|de|del|via|vía|en|por)\s*$/i, ''));
  let name = clean(text.slice(0, first));
  let doseEnd = dose ? dose.index + dose[0].length : -1;
  if (dose) {
    // "1 comprimido de 50 mg": la segunda cantidad es parte de la misma dosis.
    const more = new RegExp(`^\\s*de\\s+(?:${DOSE_RE.source})`).exec(f.slice(doseEnd));
    if (more) doseEnd += more[0].length;
  }
  if (!name && dose && dose.index === first) {
    // "1 comprimido de omeprazol cada 24 horas"
    const next = Math.min(...spans.filter((x) => x.start >= doseEnd).map((x) => x.start), f.length);
    name = clean(text.slice(doseEnd, next));
  }
  // Lo que no es nombre, dosis, vía, frecuencia ni duración ("con comida") va a las instrucciones.
  const extras: string[] = [];
  let covered = first;
  for (const s of [...spans, { start: f.length, end: f.length, dose: false }]) {
    if (s.start > covered && firstContentWord(f, covered, s.start) >= 0) {
      const piece = tidy(text.slice(covered, s.start).replace(/^\s*(?:y|e)\s+/i, ''));
      if (piece && fold(piece) !== fold(name)) extras.push(piece);
    }
    covered = Math.max(covered, s.end);
  }
  let frequency: string | undefined;
  if (freq) {
    if (freq[1]) {
      const n = findNumber(freq[1]);
      frequency = `Cada ${n ? formatDecimal(n.value) : freq[1]} horas`;
    } else frequency = tidy(text.slice(freq.index, freq.index + freq[0].length));
  }
  let durationDays: number | undefined;
  if (dur) {
    const n = countOf(dur[1]);
    if (n) durationDays = Math.round(n * (dur[2].startsWith('semana') ? 7 : dur[2].startsWith('mes') ? 30 : 1));
  }
  const doseText = dose
    ? text
        .slice(dose.index, doseEnd)
        .replace(/\s*(?:por|\/)\s*(?:kg|kilo(?:gramo)?s?)$/i, '/kg')
        .replace(/miligramos?/gi, 'mg')
        .replace(/mililitros?/gi, 'mL')
        .replace(/microgramos?/gi, 'µg')
        .replace(/\bml\b/g, 'mL')
        .trim()
    : undefined;
  const extra = extras.join('. ') || undefined;
  if (!name) {
    return doseText || route || frequency || durationDays || extra ? { partial: { dose: doseText, route, frequency, durationDays, instructions: extra } } : null;
  }
  const known = knownMeds.some((m) => fold(name).startsWith(m));
  const txKind: Treatment['kind'] = doseText || route || known ? 'medication' : 'other';
  return {
    kind: 'treatment',
    txKind,
    name,
    dose: doseText,
    route,
    // Si no es un medicamento, la frecuencia va en las instrucciones (la ficha muestra frecuencia solo en medicamentos).
    frequency: txKind === 'medication' ? frequency : undefined,
    instructions: [txKind === 'medication' ? undefined : frequency, extra].filter(Boolean).join('. ') || undefined,
    durationDays,
  };
}

export function treatmentDisplay(ch: TreatmentChange): string {
  const parts = [ch.dose, ch.route, ch.frequency, ch.durationDays ? `${ch.durationDays} día${ch.durationDays === 1 ? '' : 's'}` : undefined, ch.instructions].filter(Boolean);
  return `${ch.name}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
}

function controlFrom(seg: Segment<Key>, baseDate: string): string | null {
  const m = /^\s*(?:en|dentro de|a|para)\s+(?:(\d+|[a-z]+)\s+)?(dias?|semanas?|mes(?:es)?)(?![a-z])/.exec(seg.folded);
  if (!m) return null;
  const n = m[1] ? countOf(m[1]) : 1;
  if (!n) return null;
  const days = m[2].startsWith('semana') ? n * 7 : m[2].startsWith('mes') ? n * 30 : n;
  return addDays(baseDate, Math.round(days));
}

const findingDisplay = (r: { status: 'normal' | 'abnormal'; notes?: string }) => (r.status === 'normal' ? `Normal${r.notes ? ` · ${r.notes}` : ''}` : `Alterado · ${r.notes}`);

/** Convierte el texto dictado en datos propuestos para la consulta. */
export function parseConsultationDictation(text: string, opts: ParseOptions): ParseResult {
  const { segments, lead } = segment(text, MARKERS);
  const knownMeds = (opts.knownMeds ?? []).map((m) => fold(m).trim()).filter((m) => m.length > 2);
  const items: ParsedItem[] = [];
  const unplaced: string[] = [];
  const push = (it: Omit<ParsedItem, 'id' | 'selected'> & { selected?: boolean }) => {
    const item: ParsedItem = { id: nid(), selected: true, ...it };
    items.push(item);
    return item;
  };
  const addText = (path: TextPath, value: string, source: string, extra?: Partial<ParsedItem>) => {
    const spec = TEXT_SPEC[path];
    if (value) push({ section: spec.section, label: spec.label, display: value, source, change: { kind: 'text', path, value, replace: spec.replace }, ...extra });
  };

  if (fold(lead).replace(/[^a-z0-9]/g, '').length > 2) {
    // Lo dictado antes de cualquier palabra clave suele ser el motivo: se propone, pero sin marcar.
    if (segments.some((s) => s.key === 'reason.main')) unplaced.push(lead);
    else addText('reason.main', lead, lead, { selected: false, warning: 'No dijiste «motivo»: márcalo si corresponde.' });
  }

  let ctx: SectionKey = 'reason';
  let lastTreatment: { change: TreatmentChange; item: ParsedItem } | null = null;
  for (const seg of segments) {
    const k = seg.key;
    // "Dieta blanda por 3 días" dictado junto al plan es una indicación, no un antecedente.
    if (k === 'anamnesis.diet' && (ctx === 'plan' || ctx === 'assessment')) {
      addText('plan.homeCare', seg.source, seg.source);
      continue;
    }
    ctx = sectionOf(k);
    if (k !== 'treatment') lastTreatment = null;

    if (k in TEXT_SPEC) {
      if (k === 'reason.main') {
        // Primera frase: motivo. El resto: historia actual.
        const [first, ...more] = sentences(seg.text.replace(/^[\s:,]*(?:es|por|fue)\s+/i, ''));
        addText('reason.main', first ?? '', seg.source);
        if (more.length) addText('anamnesis.current', more.join('. '), seg.source);
        continue;
      }
      addText(k as TextPath, tidy(seg.text), seg.source);
      continue;
    }
    if (k in NUMBERS) {
      const it = numberItem(k as NumKey, seg, unplaced);
      if (it) items.push(it);
      continue;
    }
    if (k.startsWith('system:') || k === 'murmur') {
      const system = k === 'murmur' ? 'cardiovascular' : (k.slice(7) as ExamSystem);
      const res = k === 'murmur' ? { status: 'abnormal' as const, notes: tidy(seg.text) } : findingFrom(seg);
      if (!res) continue;
      push({ section: 'exam', label: EXAM_SYSTEM[system], display: findingDisplay(res), source: seg.source, change: { kind: 'finding', path: `exam.systems.${system}`, ...res } });
      continue;
    }
    switch (k) {
      case 'generalState': {
        const quality = /^(buen|mal|regular)/.exec(seg.marker)?.[1];
        const res = quality
          ? quality === 'buen'
            ? { status: 'normal' as const, notes: tidy(seg.text) || undefined }
            : { status: 'abnormal' as const, notes: tidy(seg.source) }
          : findingFrom(seg);
        if (!res) break;
        push({ section: 'exam', label: 'Estado general', display: findingDisplay(res), source: seg.source, change: { kind: 'finding', path: 'exam.generalState', ...res } });
        break;
      }
      case 'mucous': {
        const color = MUCOUS_COLOR.find(([re]) => re.test(seg.folded));
        const normal = NORMAL_RE.test(seg.folded);
        const word = MUCOUS_WORD.exec(seg.folded);
        const extra = tidy(seg.text.slice(word ? word[0].length : 0));
        if (!color && !normal && !extra) break;
        const status = color ? color[2] : normal ? 'normal' : 'abnormal';
        push({
          section: 'exam',
          label: 'Mucosas',
          display: [color?.[1] ?? (normal ? 'Normales' : 'Alteradas'), extra].filter(Boolean).join(' · '),
          source: seg.source,
          change: { kind: 'mucous', status, color: color?.[1], notes: extra || undefined },
        });
        break;
      }
      case 'hydration': {
        const dehydrated = /deshidrat/.test(seg.marker) || /deshidrat/.test(seg.folded);
        if (!dehydrated && NORMAL_RE.test(seg.folded)) {
          push({ section: 'exam', label: 'Hidratación', display: 'Normal', source: seg.source, change: { kind: 'hydration', status: 'normal' } });
          break;
        }
        const n = findNumber(seg.folded);
        const pct = dehydrated && n ? n.value : undefined;
        const body = tidy(/deshidrat/.test(seg.marker) ? seg.source : seg.text);
        if (!dehydrated && !body) break;
        const bad = pct !== undefined && pct > 30;
        const notes = pct === undefined || bad ? body || 'Deshidratación' : undefined;
        push({
          section: 'exam',
          label: 'Hidratación',
          display: `Alterada · ${pct !== undefined && !bad ? `deshidratación ${formatDecimal(pct, 1)} %` : notes}`,
          source: seg.source,
          change: { kind: 'hydration', status: 'abnormal', pct: bad ? undefined : pct, notes },
          warning: bad ? 'Porcentaje fuera de lo que admite la ficha (0–30 %): queda solo como texto.' : undefined,
        });
        break;
      }
      case 'bcs': {
        const n = findNumber(seg.folded.slice(0, 60));
        if (!n || !FILLER.test(seg.folded.slice(0, n.index))) {
          unplaced.push(seg.source);
          break;
        }
        const scaleMatch = /^\s*(?:de|sobre|\/)\s*(5|9|cinco|nueve)(?![a-z0-9])/.exec(seg.folded.slice(n.index + n.length));
        const scale: 5 | 9 = scaleMatch ? (/5|cinco/.test(scaleMatch[1]) ? 5 : 9) : opts.bcsScale;
        const value = n.value;
        const warning = !Number.isInteger(value)
          ? 'La ficha registra la condición corporal en números enteros.'
          : value < 1 || value > scale
            ? `Debe estar entre 1 y ${scale}.`
            : scale !== opts.bcsScale
              ? `La especie usa la escala de 1 a ${opts.bcsScale}: no se convierte automáticamente.`
              : undefined;
        push({ section: 'exam', label: 'Condición corporal', display: `${formatDecimal(value, 1)}/${scale}`, source: seg.source, change: { kind: 'bcs', value, scale }, warning, selected: !warning });
        break;
      }
      case 'restNormal': {
        push({ section: 'exam', label: 'Resto de los sistemas', display: 'Normal (los sistemas que no dictaste)', source: seg.source, change: { kind: 'restNormal' } });
        const extra = tidy(seg.text);
        if (extra.length > 3) unplaced.push(extra);
        break;
      }
      case 'diagnosis': {
        const dxKind: Diagnosis['kind'] = /diferencial/.test(seg.marker) ? 'differential' : /confirmad|definitiv/.test(seg.marker) ? 'confirmed' : 'presumptive';
        const body = tidy(seg.text.replace(/^[\s:,]*(?:de|que|es|seria)\s+/i, ''));
        if (!body) break;
        const names = dxKind === 'differential' ? splitList(body) : [body];
        const label = dxKind === 'differential' ? 'Diagnóstico diferencial' : dxKind === 'confirmed' ? 'Diagnóstico confirmado' : 'Diagnóstico presuntivo';
        for (const name of names) push({ section: 'assessment', label, display: name, source: seg.source, change: { kind: 'diagnosis', name, dxKind } });
        break;
      }
      case 'treatment': {
        // Cada frase (y cada medicamento con su propia dosis) es un tratamiento; una frase sin nombre
        // ("Cada 12 horas por 7 días") completa el anterior.
        for (const s of sentences(seg.text).flatMap(splitTreatments)) {
          const r = treatmentFrom(s, knownMeds);
          if (!r) {
            unplaced.push(s);
            continue;
          }
          if ('partial' in r) {
            if (!lastTreatment) {
              unplaced.push(s);
              continue;
            }
            const merged: TreatmentChange = { ...lastTreatment.change };
            const p = r.partial;
            if (!merged.dose && p.dose) merged.dose = p.dose;
            if (!merged.route && p.route) merged.route = p.route;
            if (!merged.durationDays && p.durationDays) merged.durationDays = p.durationDays;
            if (merged.dose || merged.route) merged.txKind = 'medication';
            const notes = [merged.instructions, p.instructions];
            if (p.frequency && !merged.frequency) {
              if (merged.txKind === 'medication') merged.frequency = p.frequency;
              else notes.splice(1, 0, p.frequency);
            }
            merged.instructions = notes.filter(Boolean).join('. ') || undefined;
            lastTreatment.item.change = merged;
            lastTreatment.item.display = treatmentDisplay(merged);
            lastTreatment.change = merged;
            continue;
          }
          const item = push({ section: 'plan', label: r.txKind === 'medication' ? 'Tratamiento' : 'Indicación', display: treatmentDisplay(r), source: seg.source, change: r });
          lastTreatment = { change: r, item };
        }
        break;
      }
      case 'control': {
        const date = controlFrom(seg, opts.baseDate);
        if (!date) {
          unplaced.push(seg.source);
          break;
        }
        push({ section: 'plan', label: 'Control recomendado', display: formatDate(date), source: seg.source, change: { kind: 'controlDate', date } });
        const m = CONTROL_AFTER.exec(seg.folded);
        const extra = tidy(seg.text.slice(m ? m[0].length : 0));
        if (fold(extra).replace(/[^a-z0-9]/g, '').length > 2) unplaced.push(extra);
        break;
      }
    }
  }

  return { items: mergeRepeated(items), unplaced: unplaced.filter((u) => fold(u).replace(/[^a-z0-9]/g, '').length > 2) };
}

/**
 * Datos repetidos: los hallazgos de un mismo sistema se combinan ("Corazón normal… soplo grado 2" → alterado, con ambas
 * frases); de los demás datos de valor único se propone el último dictado.
 */
function mergeRepeated(items: ParsedItem[]): ParsedItem[] {
  const out: ParsedItem[] = [];
  const findings = new Map<string, ParsedItem>();
  const singles = new Map<string, ParsedItem>();
  for (const it of items) {
    const ch = it.change;
    if (ch.kind === 'finding') {
      const prev = findings.get(ch.path);
      if (prev && prev.change.kind === 'finding') {
        const merged = {
          ...prev.change,
          status: prev.change.status === 'abnormal' || ch.status === 'abnormal' ? ('abnormal' as const) : ('normal' as const),
          notes: [prev.change.notes, ch.notes].filter(Boolean).join('. ') || undefined,
        };
        prev.change = merged;
        prev.display = findingDisplay(merged);
        prev.source = `${prev.source} … ${it.source}`;
        continue;
      }
      findings.set(ch.path, it);
    } else {
      const key =
        ch.kind === 'number'
          ? `number:${ch.path}`
          : ch.kind === 'text' && ch.replace
            ? `text:${ch.path}`
            : ch.kind === 'mucous' || ch.kind === 'hydration' || ch.kind === 'bcs' || ch.kind === 'controlDate'
              ? ch.kind
              : null;
      if (key) {
        const prev = singles.get(key);
        if (prev && prev.selected && it.selected) {
          prev.selected = false;
          prev.warning = 'Dictado más de una vez: se propone el último.';
        }
        singles.set(key, it);
      }
    }
    out.push(it);
  }
  return out;
}
