import type { Exam } from '@/data/schema';
import { fold } from '@/features/voice/text';

/**
 * Catálogo de valores de laboratorio para registrar resultados y ver su evolución.
 * Solo define nombres, unidades habituales y sinónimos: la app NO trae rangos de referencia
 * (cada laboratorio informa los suyos y se registran desde el informe).
 */

export type PanelKey = 'hemogram' | 'biochemistry' | 'electrolytes' | 'urine' | 'endocrine';

export const PANEL_LABEL: Record<PanelKey | 'other', string> = {
  hemogram: 'Hemograma',
  biochemistry: 'Bioquímica',
  electrolytes: 'Electrolitos',
  urine: 'Orina',
  endocrine: 'Endocrino',
  other: 'Otros',
};

export const PANELS: PanelKey[] = ['hemogram', 'biochemistry', 'electrolytes', 'urine', 'endocrine'];

export interface AnalyteDef {
  code: string;
  name: string;
  panel: PanelKey;
  /** Unidad habitual (la primera de `units`). '' = sin unidad. */
  unit: string;
  /** Otras unidades con que suele informarse. */
  units?: string[];
  /** Decimales al mostrar. */
  digits: number;
  /** Sinónimos y siglas, sin tildes y en minúsculas (para el dictado y la búsqueda). */
  aliases: string[];
  /** Resultado cualitativo (p. ej. tira de orina): se registra como texto. */
  qualitative?: boolean;
}

const K3 = '×10³/µL';
const K6 = '×10⁶/µL';
const COUNT_UNITS = [K3, '/µL', '%'];

export const ANALYTES: AnalyteDef[] = [
  // Hemograma
  { code: 'hct', name: 'Hematocrito', panel: 'hemogram', unit: '%', digits: 1, aliases: ['hematocrito', 'hto', 'hct', 'volumen globular'] },
  { code: 'hgb', name: 'Hemoglobina', panel: 'hemogram', unit: 'g/dL', digits: 1, aliases: ['hemoglobina', 'hb', 'hgb'] },
  { code: 'rbc', name: 'Eritrocitos', panel: 'hemogram', unit: K6, units: [K6, '/µL'], digits: 2, aliases: ['eritrocitos', 'globulos rojos', 'recuento de globulos rojos', 'hematies', 'gr', 'rbc'] },
  { code: 'mcv', name: 'VCM', panel: 'hemogram', unit: 'fL', digits: 1, aliases: ['vcm', 'volumen corpuscular medio', 'vgm', 'volumen globular medio', 'mcv'] },
  { code: 'mch', name: 'HCM', panel: 'hemogram', unit: 'pg', digits: 1, aliases: ['hcm', 'hemoglobina corpuscular media', 'mch'] },
  { code: 'mchc', name: 'CHCM', panel: 'hemogram', unit: 'g/dL', digits: 1, aliases: ['chcm', 'concentracion de hemoglobina corpuscular media', 'mchc'] },
  { code: 'rdw', name: 'RDW', panel: 'hemogram', unit: '%', digits: 1, aliases: ['rdw', 'amplitud de distribucion eritrocitaria', 'ade'] },
  { code: 'retic', name: 'Reticulocitos', panel: 'hemogram', unit: K3, units: [K3, '/µL', '%'], digits: 1, aliases: ['reticulocitos', 'retic'] },
  { code: 'wbc', name: 'Leucocitos', panel: 'hemogram', unit: K3, units: [K3, '/µL'], digits: 2, aliases: ['leucocitos', 'leucocitos totales', 'recuento de leucocitos', 'globulos blancos', 'gb', 'wbc'] },
  { code: 'neut', name: 'Neutrófilos segmentados', panel: 'hemogram', unit: K3, units: COUNT_UNITS, digits: 2, aliases: ['neutrofilos segmentados', 'neutrofilos', 'segmentados', 'seg'] },
  { code: 'band', name: 'Baciliformes', panel: 'hemogram', unit: K3, units: COUNT_UNITS, digits: 2, aliases: ['baciliformes', 'abastonados', 'neutrofilos en banda', 'bandas'] },
  { code: 'lymph', name: 'Linfocitos', panel: 'hemogram', unit: K3, units: COUNT_UNITS, digits: 2, aliases: ['linfocitos', 'linf'] },
  { code: 'mono', name: 'Monocitos', panel: 'hemogram', unit: K3, units: COUNT_UNITS, digits: 2, aliases: ['monocitos', 'mono'] },
  { code: 'eos', name: 'Eosinófilos', panel: 'hemogram', unit: K3, units: COUNT_UNITS, digits: 2, aliases: ['eosinofilos', 'eos'] },
  { code: 'baso', name: 'Basófilos', panel: 'hemogram', unit: K3, units: COUNT_UNITS, digits: 2, aliases: ['basofilos', 'baso'] },
  { code: 'plt', name: 'Plaquetas', panel: 'hemogram', unit: K3, units: [K3, '/µL'], digits: 0, aliases: ['plaquetas', 'recuento de plaquetas', 'trombocitos', 'plt'] },
  { code: 'ppt', name: 'Proteínas plasmáticas totales', panel: 'hemogram', unit: 'g/dL', digits: 1, aliases: ['proteinas plasmaticas totales', 'proteinas plasmaticas', 'ppt', 'solidos totales'] },
  // Bioquímica
  { code: 'glu', name: 'Glucosa', panel: 'biochemistry', unit: 'mg/dL', digits: 0, aliases: ['glucosa', 'glicemia', 'glu'] },
  { code: 'bun', name: 'BUN (nitrógeno ureico)', panel: 'biochemistry', unit: 'mg/dL', digits: 1, aliases: ['nitrogeno ureico en sangre', 'nitrogeno ureico', 'bun'] },
  { code: 'urea', name: 'Urea', panel: 'biochemistry', unit: 'mg/dL', digits: 1, aliases: ['urea', 'uremia'] },
  { code: 'crea', name: 'Creatinina', panel: 'biochemistry', unit: 'mg/dL', digits: 2, units: ['mg/dL', 'µmol/L'], aliases: ['creatinina', 'crea', 'creat'] },
  { code: 'sdma', name: 'SDMA', panel: 'biochemistry', unit: 'µg/dL', digits: 0, aliases: ['sdma', 'dimetilarginina simetrica'] },
  { code: 'alt', name: 'ALT (GPT)', panel: 'biochemistry', unit: 'U/L', digits: 0, aliases: ['alanina aminotransferasa', 'transaminasa gpt', 'alt', 'gpt'] },
  { code: 'ast', name: 'AST (GOT)', panel: 'biochemistry', unit: 'U/L', digits: 0, aliases: ['aspartato aminotransferasa', 'transaminasa got', 'ast', 'got'] },
  { code: 'alp', name: 'Fosfatasa alcalina', panel: 'biochemistry', unit: 'U/L', digits: 0, aliases: ['fosfatasa alcalina', 'falc', 'alp', 'fa', 'fas'] },
  { code: 'ggt', name: 'GGT', panel: 'biochemistry', unit: 'U/L', digits: 0, aliases: ['gamma glutamil transferasa', 'gamma gt', 'ggt'] },
  { code: 'tbil', name: 'Bilirrubina total', panel: 'biochemistry', unit: 'mg/dL', digits: 2, aliases: ['bilirrubina total', 'bilirrubina', 'bt'] },
  { code: 'tp', name: 'Proteínas totales', panel: 'biochemistry', unit: 'g/dL', digits: 1, aliases: ['proteinas totales', 'proteinas', 'pt'] },
  { code: 'alb', name: 'Albúmina', panel: 'biochemistry', unit: 'g/dL', digits: 1, aliases: ['albumina', 'alb'] },
  { code: 'glob', name: 'Globulinas', panel: 'biochemistry', unit: 'g/dL', digits: 1, aliases: ['globulinas', 'glob'] },
  { code: 'chol', name: 'Colesterol', panel: 'biochemistry', unit: 'mg/dL', digits: 0, aliases: ['colesterol total', 'colesterol', 'col'] },
  { code: 'trig', name: 'Triglicéridos', panel: 'biochemistry', unit: 'mg/dL', digits: 0, aliases: ['trigliceridos', 'tg'] },
  { code: 'ca', name: 'Calcio', panel: 'biochemistry', unit: 'mg/dL', digits: 1, aliases: ['calcio total', 'calcio', 'ca'] },
  { code: 'phos', name: 'Fósforo', panel: 'biochemistry', unit: 'mg/dL', digits: 1, aliases: ['fosforo', 'fosfato'] },
  { code: 'amyl', name: 'Amilasa', panel: 'biochemistry', unit: 'U/L', digits: 0, aliases: ['amilasa'] },
  { code: 'lip', name: 'Lipasa', panel: 'biochemistry', unit: 'U/L', digits: 0, aliases: ['lipasa'] },
  { code: 'spl', name: 'Lipasa pancreática específica', panel: 'biochemistry', unit: 'µg/L', digits: 0, aliases: ['lipasa pancreatica especifica', 'lipasa pancreatica', 'spec cpl', 'spec fpl', 'cpl', 'fpl'] },
  { code: 'ck', name: 'CK', panel: 'biochemistry', unit: 'U/L', digits: 0, aliases: ['creatina quinasa', 'creatin quinasa', 'creatinfosfoquinasa', 'cpk', 'ck'] },
  { code: 'fruct', name: 'Fructosamina', panel: 'biochemistry', unit: 'µmol/L', digits: 0, aliases: ['fructosamina'] },
  // Electrolitos
  { code: 'na', name: 'Sodio', panel: 'electrolytes', unit: 'mEq/L', units: ['mEq/L', 'mmol/L'], digits: 0, aliases: ['sodio', 'na'] },
  { code: 'k', name: 'Potasio', panel: 'electrolytes', unit: 'mEq/L', units: ['mEq/L', 'mmol/L'], digits: 1, aliases: ['potasio', 'k'] },
  { code: 'cl', name: 'Cloro', panel: 'electrolytes', unit: 'mEq/L', units: ['mEq/L', 'mmol/L'], digits: 0, aliases: ['cloro', 'cloruro', 'cl'] },
  { code: 'lac', name: 'Lactato', panel: 'electrolytes', unit: 'mmol/L', digits: 1, aliases: ['lactato'] },
  // Orina
  { code: 'usg', name: 'Densidad urinaria', panel: 'urine', unit: '', digits: 3, aliases: ['densidad urinaria', 'densidad', 'gravedad especifica', 'usg'] },
  { code: 'uph', name: 'pH urinario', panel: 'urine', unit: '', digits: 1, aliases: ['ph urinario', 'ph'] },
  { code: 'upc', name: 'Relación proteína/creatinina (UPC)', panel: 'urine', unit: '', digits: 2, aliases: ['relacion proteina creatinina', 'proteina creatinina', 'upc'] },
  { code: 'uprot', name: 'Proteínas en orina (tira)', panel: 'urine', unit: '', digits: 0, qualitative: true, aliases: ['proteinas en orina', 'proteinuria'] },
  { code: 'uglu', name: 'Glucosa en orina (tira)', panel: 'urine', unit: '', digits: 0, qualitative: true, aliases: ['glucosa en orina', 'glucosuria'] },
  { code: 'ublood', name: 'Sangre en orina (tira)', panel: 'urine', unit: '', digits: 0, qualitative: true, aliases: ['sangre en orina', 'hematuria'] },
  { code: 'uket', name: 'Cuerpos cetónicos (tira)', panel: 'urine', unit: '', digits: 0, qualitative: true, aliases: ['cuerpos cetonicos', 'cetonas', 'cetonuria'] },
  // Endocrino
  { code: 't4', name: 'T4 total', panel: 'endocrine', unit: 'µg/dL', units: ['µg/dL', 'nmol/L'], digits: 2, aliases: ['t4 total', 'tiroxina', 't4'] },
  { code: 'cort', name: 'Cortisol', panel: 'endocrine', unit: 'µg/dL', units: ['µg/dL', 'nmol/L'], digits: 2, aliases: ['cortisol basal', 'cortisol'] },
];

export const QUALITATIVE_OPTIONS = ['Negativo', 'Trazas', '+', '++', '+++', '++++'];

const BY_CODE = new Map(ANALYTES.map((a) => [a.code, a]));

export function analyteDef(code: string): AnalyteDef | undefined {
  return BY_CODE.get(code);
}

/** Código de un valor fuera del catálogo: se agrupa por su nombre. */
export function customCode(name: string): string {
  return `custom:${fold(name).trim().replace(/\s+/g, ' ')}`;
}

export function panelOf(code: string): PanelKey | 'other' {
  return analyteDef(code)?.panel ?? 'other';
}

/** Panel sugerido según el tipo de examen. */
export function panelForExamType(type: Exam['type']): PanelKey | undefined {
  return type === 'hemogram' ? 'hemogram' : type === 'biochemistry' ? 'biochemistry' : type === 'urinalysis' ? 'urine' : undefined;
}

/** Busca en el catálogo por nombre o sigla (sin tildes). */
export function searchAnalytes(q: string): AnalyteDef[] {
  const f = fold(q).trim();
  if (!f) return ANALYTES;
  return ANALYTES.filter((a) => fold(a.name).includes(f) || a.aliases.some((x) => x.startsWith(f) || x.includes(` ${f}`)));
}

/** Factores entre unidades de recuento equivalentes (para comparar informes de distintos laboratorios). */
const COUNT_FACTOR: Record<string, number> = { '/µL': 1, '×10³/µL': 1e3, '×10⁶/µL': 1e6, '×10⁹/L': 1e3, '×10¹²/L': 1e6 };

/** Convierte un valor entre unidades equivalentes; null si no son comparables. */
export function convertUnit(value: number, from: string | undefined, to: string | undefined): number | null {
  const a = (from ?? '').trim();
  const b = (to ?? '').trim();
  if (a === b) return value;
  const fa = COUNT_FACTOR[a];
  const fb = COUNT_FACTOR[b];
  if (fa && fb) return (value * fa) / fb;
  return null;
}

/** Dirección respecto del rango de referencia informado (sin rango no se juzga). */
export function flagOf(value: number | undefined, low: number | undefined, high: number | undefined): 'low' | 'high' | 'normal' | undefined {
  if (value === undefined || (low === undefined && high === undefined)) return undefined;
  if (low !== undefined && value < low) return 'low';
  if (high !== undefined && value > high) return 'high';
  return 'normal';
}
