import { z } from 'zod';

/**
 * Modelo de datos de la app.
 *
 * Convenciones:
 * - `id`: UUID v4 estable. Las referencias entre entidades se guardan como `<entidad>Id`.
 * - Fechas sin hora: 'AAAA-MM-DD' (hora local). Instantes: ISO 8601 UTC.
 * - Unidades explícitas en el nombre del campo: `weightKg` (kg), `temperatureC` (°C), `heartRateBpm` (lpm),
 *   `respRateRpm` (rpm), `crtSec` (segundos), `*CLP` (pesos chilenos, enteros), `durationMin` (minutos).
 * - Los campos clínicos no registrados quedan vacíos o como 'not_evaluated'; nunca se completan con valores normales.
 */

z.config(z.locales.es());

export const isoDate = z.iso.date({ error: 'Fecha inválida' });
export const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { error: 'Fecha y hora inválida' });
const text = z.string().max(20000).optional();
const short = z.string().max(500).optional();
const ref = z.string().min(1);
const optRef = z.string().min(1).optional();
const clp = z.number().int({ error: 'El monto debe ser un número entero de pesos' }).min(0);
const positive = z.number().positive();

const base = {
  id: z.string().min(1),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  rev: z.number().int().min(1),
  /** Datos de demostración claramente identificados y eliminables. */
  demo: z.boolean().optional(),
};

/** Origen de un dato: distingue lo registrado por la profesional, lo informado por el tutor, lo calculado, etc. */
export const provenance = z.enum(['professional', 'owner', 'document', 'calculated', 'copied', 'template', 'dictated']);
export type Provenance = z.infer<typeof provenance>;

export const findingStatus = z.enum(['not_evaluated', 'normal', 'abnormal']);
export type FindingStatus = z.infer<typeof findingStatus>;

const finding = z.object({ status: findingStatus, notes: short });
export type Finding = z.infer<typeof finding>;

// ---------------------------------------------------------------------------
// Perfil profesional y configuración
// ---------------------------------------------------------------------------
export const profileSchema = z.object({
  ...base,
  fullName: z.string().max(200),
  title: z.string().max(200),
  rut: short,
  licenseNumber: short,
  phone: short,
  email: short,
  address: short,
  comuna: short,
  city: short,
  serviceArea: short,
  logoAttachmentId: optRef,
  signatureAttachmentId: optRef,
  documentFooter: text,
  appName: z.string().min(1).max(60),
  paperSize: z.enum(['letter', 'a4']),
});
export type Profile = z.infer<typeof profileSchema>;

const namedOption = z.object({ id: ref, name: z.string().min(1).max(120), active: z.boolean() });
export type NamedOption = z.infer<typeof namedOption>;

export const settingsSchema = z.object({
  ...base,
  dashboard: z.object({ order: z.array(z.string()), hidden: z.array(z.string()) }),
  agenda: z.object({
    defaultDurationMin: z.number().int().min(5).max(600),
    defaultTravelMin: z.number().int().min(0).max(300),
    dayStart: z.string().regex(/^\d{2}:\d{2}$/),
    dayEnd: z.string().regex(/^\d{2}:\d{2}$/),
    weekStartsOn: z.number().int().min(0).max(6),
  }),
  reminders: z.object({
    vaccineDaysAhead: z.number().int().min(0).max(365),
    dewormingDaysAhead: z.number().int().min(0).max(365),
    controlDaysAhead: z.number().int().min(0).max(365),
    overdueWindowDays: z.number().int().min(0).max(3650),
  }),
  security: z.object({ autoLockMinutes: z.number().int().min(1).max(720) }),
  paymentMethods: z.array(namedOption),
  kmRateCLP: z.number().int().min(0).optional(),
  calendar: z.object({ includePatientName: z.boolean(), includeAddress: z.boolean() }),
  backup: z.object({ reminderDays: z.number().int().min(1).max(90) }),
  /**
   * Rangos de referencia de exámenes que la profesional copió de un informe y pidió recordar,
   * por especie, laboratorio y analito (clave "especie|laboratorio|analito"). La app no trae rangos propios.
   */
  labRanges: z
    .record(z.string().max(300), z.object({ low: z.number().optional(), high: z.number().optional(), unit: z.string().max(40).optional() }))
    .optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const speciesSchema = z.object({
  ...base,
  name: z.string().min(1).max(80),
  active: z.boolean(),
  /** Campos adicionales propios de la especie (p. ej. talla en perros, acceso al exterior en gatos). */
  extraFields: z.array(
    z.object({
      key: z.string().min(1).max(40),
      label: z.string().min(1).max(80),
      type: z.enum(['text', 'select', 'boolean']),
      options: z.array(z.string().max(60)).optional(),
    }),
  ),
  /** Rangos de referencia configurados por la profesional. Vacíos por defecto: la app no inventa valores. */
  refRanges: z.object({
    temperatureC: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
    heartRateBpm: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
    respRateRpm: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  }),
  bcsScale: z.union([z.literal(5), z.literal(9)]),
  notes: text,
  builtin: z.enum(['dog', 'cat']).optional(),
});
export type Species = z.infer<typeof speciesSchema>;

export const chargeCategory = z.enum(['fee', 'medication', 'supply', 'travel', 'other']);
export type ChargeCategory = z.infer<typeof chargeCategory>;

export const serviceSchema = z.object({
  ...base,
  name: z.string().min(1).max(150),
  category: chargeCategory,
  priceCLP: clp,
  durationMin: z.number().int().min(0).max(1440).optional(),
  description: text,
  active: z.boolean(),
});
export type Service = z.infer<typeof serviceSchema>;

export const doseUnits = ['mg', 'µg', 'g', 'mL', 'UI', 'comprimido', 'cápsula', 'gota', 'pipeta', 'dosis', 'unidad'] as const;
export const concentrationUnits = ['mg/mL', 'µg/mL', 'g/mL', 'UI/mL', 'mg/comprimido', 'µg/comprimido', 'mg/cápsula', '%'] as const;

export const medicationRefSchema = z.object({
  ...base,
  name: z.string().min(1).max(150),
  activeIngredient: short,
  concentrationValue: positive.optional(),
  concentrationUnit: z.enum(concentrationUnits).optional(),
  presentation: short,
  route: short,
  notes: text,
  antimicrobial: z.boolean(),
  controlled: z.boolean(),
  active: z.boolean(),
});
export type MedicationRef = z.infer<typeof medicationRefSchema>;

export const protocolSchema = z.object({
  ...base,
  kind: z.enum(['vaccine', 'deworming_internal', 'deworming_external']),
  name: z.string().min(1).max(150),
  speciesId: optRef,
  /** Intervalo definido por la profesional para sugerir la próxima fecha (editable en cada registro). */
  intervalDays: z.number().int().min(1).max(3650).optional(),
  notes: text,
  active: z.boolean(),
});
export type Protocol = z.infer<typeof protocolSchema>;

export const templateKind = z.enum(['consultation', 'phrase', 'consent', 'refusal', 'indications', 'referral', 'exam_order']);
export type TemplateKind = z.infer<typeof templateKind>;

export const templateSchema = z.object({
  ...base,
  kind: templateKind,
  name: z.string().min(1).max(150),
  /** Para 'consultation': textos por campo permitido. Para el resto: `body`. */
  fields: z.record(z.string(), z.string().max(20000)),
  active: z.boolean(),
});
export type Template = z.infer<typeof templateSchema>;

// ---------------------------------------------------------------------------
// Tutores y pacientes
// ---------------------------------------------------------------------------
export const addressSchema = z.object({
  id: ref,
  label: short,
  street: z.string().max(300),
  comuna: short,
  city: short,
  region: short,
  directions: text,
  primary: z.boolean(),
});
export type Address = z.infer<typeof addressSchema>;

const contactPerson = z.object({ name: short, phone: short, relation: short });

export const tutorSchema = z.object({
  ...base,
  fullName: z.string().trim().min(2, { error: 'Ingresa el nombre del tutor' }).max(200),
  rut: short,
  phone: short,
  phoneAlt: short,
  email: short,
  contactPreference: z.enum(['call', 'whatsapp', 'email', 'sms']).optional(),
  addresses: z.array(addressSchema),
  altContact: contactPerson.optional(),
  decisionMaker: contactPerson.optional(),
  notes: text,
  mergedIntoId: optRef,
  anonymizedAt: isoDateTime.optional(),
});
export type Tutor = z.infer<typeof tutorSchema>;

const sourced = {
  source: provenance,
  confirmed: z.boolean(),
};

export const allergySchema = z.object({
  id: ref,
  substance: z.string().min(1).max(200),
  reaction: short,
  severity: z.enum(['mild', 'moderate', 'severe', 'unknown']),
  notedAt: isoDate.optional(),
  ...sourced,
});
export type Allergy = z.infer<typeof allergySchema>;

export const conditionSchema = z.object({
  id: ref,
  name: z.string().min(1).max(200),
  chronic: z.boolean(),
  status: z.enum(['active', 'controlled', 'resolved']),
  since: short,
  notes: short,
  ...sourced,
});
export type Condition = z.infer<typeof conditionSchema>;

export const currentMedSchema = z.object({
  id: ref,
  name: z.string().min(1).max(200),
  dose: short,
  frequency: short,
  since: short,
  notes: short,
  ...sourced,
});
export type CurrentMed = z.infer<typeof currentMedSchema>;

export const alertSchema = z.object({
  id: ref,
  text: z.string().min(1).max(500),
  level: z.enum(['critical', 'warning', 'info']),
  pendingConfirmation: z.boolean(),
  createdAt: isoDateTime,
});
export type PatientAlert = z.infer<typeof alertSchema>;

export const patientSchema = z.object({
  ...base,
  name: z.string().trim().min(1, { error: 'Ingresa el nombre del paciente' }).max(120),
  speciesId: ref,
  breed: short,
  sex: z.enum(['male', 'female', 'unknown']),
  birthDate: isoDate.optional(),
  birthDateEstimated: z.boolean(),
  reproductiveStatus: z.enum(['intact', 'neutered', 'unknown']),
  color: short,
  markings: short,
  microchip: short,
  photoAttachmentId: optRef,
  tutors: z
    .array(z.object({ tutorId: ref, role: z.enum(['primary', 'secondary']) }))
    .min(1, { error: 'El paciente debe tener al menos un tutor' }),
  status: z.enum(['active', 'inactive', 'deceased']),
  deceasedDate: isoDate.optional(),
  background: z.object({
    previousDiseases: text,
    surgeries: text,
    vaccinationHistory: text,
    dewormingInternal: text,
    dewormingExternal: text,
    diet: text,
    habitat: text,
    lifestyle: text,
    behavior: text,
    familyEpidemiological: text,
    other: text,
  }),
  allergies: z.array(allergySchema),
  adverseReactions: z.array(allergySchema),
  conditions: z.array(conditionSchema),
  currentMedications: z.array(currentMedSchema),
  alerts: z.array(alertSchema),
  extra: z.record(z.string(), z.union([z.string(), z.boolean()])),
  notes: text,
});
export type Patient = z.infer<typeof patientSchema>;

export const weightSchema = z.object({
  ...base,
  patientId: ref,
  date: isoDate,
  weightKg: z.number().positive({ error: 'El peso debe ser mayor que 0' }).max(2000),
  source: z.enum(['consultation', 'manual', 'owner']),
  consultationId: optRef,
  notes: short,
});
export type Weight = z.infer<typeof weightSchema>;

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------
export const appointmentStatus = z.enum(['pending', 'confirmed', 'en_route', 'in_progress', 'completed', 'cancelled']);
export type AppointmentStatus = z.infer<typeof appointmentStatus>;

export const visitType = z.enum([
  'consultation',
  'control',
  'vaccination',
  'deworming',
  'sampling',
  'procedure',
  'emergency',
  'other',
]);
export type VisitType = z.infer<typeof visitType>;

export const appointmentSchema = z.object({
  ...base,
  tutorId: ref,
  patientIds: z.array(ref).min(1, { error: 'Selecciona al menos un paciente' }),
  start: isoDateTime,
  durationMin: z.number().int().min(5).max(1440),
  travelMin: z.number().int().min(0).max(600).optional(),
  address: z.object({ street: z.string().max(300), comuna: short, city: short, directions: text }),
  addressId: optRef,
  reason: short,
  visitType,
  accessInstructions: text,
  equipment: text,
  precautions: text,
  status: appointmentStatus,
  statusLog: z.array(z.object({ status: appointmentStatus, at: isoDateTime })),
  cancelReason: short,
  notes: text,
  consultationIds: z.array(ref),
  calendarExportedAt: isoDateTime.optional(),
});
export type Appointment = z.infer<typeof appointmentSchema>;

// ---------------------------------------------------------------------------
// Consultas clínicas
// ---------------------------------------------------------------------------
export const EXAM_SYSTEMS = [
  'cardiovascular',
  'respiratory',
  'digestive',
  'dermatological',
  'ocular',
  'otic',
  'musculoskeletal',
  'neurological',
  'lymphNodes',
  'urogenital',
  'oral',
] as const;
export type ExamSystem = (typeof EXAM_SYSTEMS)[number];

export const consultationKind = z.enum(['consultation', 'control', 'emergency', 'procedure', 'vaccination']);
export type ConsultationKind = z.infer<typeof consultationKind>;

const listItem = z.object({ id: ref, text: z.string().max(1000) });

export const consultationSchema = z.object({
  ...base,
  patientId: ref,
  tutorId: ref,
  appointmentId: optRef,
  kind: consultationKind,
  followUpOfId: optRef,
  professionalName: z.string().max(200),
  startedAt: isoDateTime,
  status: z.enum(['draft', 'final', 'voided']),
  finalizedAt: isoDateTime.optional(),
  voidReason: short,
  /** Versión clínica: 1 al finalizar; aumenta con cada enmienda posterior. */
  version: z.number().int().min(1),
  reason: z.object({ main: short, ownerSymptoms: text, onset: short, evolution: text, related: text }),
  anamnesis: z.object({
    current: text,
    medical: text,
    diet: text,
    behaviorElimination: text,
    previousTreatments: text,
    other: text,
    custom: z.array(z.object({ id: ref, label: z.string().max(120), value: z.string().max(5000) })),
  }),
  exam: z.object({
    weightKg: z.number().positive().max(2000).optional(),
    temperatureC: z.number().min(20).max(46).optional(),
    heartRateBpm: z.number().int().min(1).max(500).optional(),
    respRateRpm: z.number().int().min(1).max(300).optional(),
    crtSec: z.number().min(0).max(20).optional(),
    mucous: z.object({ status: findingStatus, color: short, notes: short }),
    hydration: z.object({ status: findingStatus, dehydrationPct: z.number().min(0).max(30).optional(), notes: short }),
    bcs: z.object({ value: z.number().min(1).max(9).optional(), scale: z.union([z.literal(5), z.literal(9)]) }),
    generalState: finding,
    systems: z.partialRecord(z.enum(EXAM_SYSTEMS), finding),
    otherFindings: text,
    notes: text,
  }),
  assessment: z.object({
    problems: z.array(listItem),
    testsRequested: text,
    resultsAvailable: text,
    interpretation: text,
    prognosis: short,
  }),
  plan: z.object({
    homeCare: text,
    ownerRecommendations: text,
    pendingTests: text,
    referralTo: short,
    referralReason: text,
    controlDate: isoDate.optional(),
    finalNotes: text,
  }),
  followUp: z
    .object({
      symptomsEvolution: text,
      adherence: z.enum(['good', 'partial', 'poor', 'unknown']).optional(),
      adherenceNotes: short,
      clinicalResponse: text,
      adverseEffects: text,
      newFindings: text,
      adjustments: text,
      nextReview: isoDate.optional(),
    })
    .optional(),
  /** Campos reutilizados de otra consulta, de una plantilla o dictados por voz, con su estado de revisión. */
  provenance: z.array(
    z.object({ path: z.string(), source: z.enum(['copied', 'template', 'dictated']), fromId: optRef, reviewed: z.boolean() }),
  ),
  /** Transcripciones dictadas (texto tal como se dictó), para trazabilidad. */
  dictations: z.array(z.object({ id: ref, at: isoDateTime, text: z.string().max(20000) })).optional(),
});
export type Consultation = z.infer<typeof consultationSchema>;

export const diagnosisSchema = z.object({
  ...base,
  consultationId: ref,
  patientId: ref,
  kind: z.enum(['differential', 'presumptive', 'confirmed']),
  name: z.string().trim().min(1).max(300),
  status: z.enum(['active', 'chronic', 'resolved']),
  notes: short,
});
export type Diagnosis = z.infer<typeof diagnosisSchema>;

/** Cálculo de dosis revisado por la profesional antes de incorporarlo a una indicación. */
export const doseCalcRecord = z.object({
  weightKg: z.number().positive().optional(),
  weightSource: z.string().max(200).optional(),
  doseValue: z.number().positive(),
  doseUnit: z.string().max(20),
  concentrationValue: z.number().positive().optional(),
  concentrationUnit: z.string().max(30).optional(),
  amountPerAdmin: z.number().positive(),
  amountUnit: z.string().max(20),
  everyHours: z.number().positive().optional(),
  durationDays: z.number().positive().optional(),
  administrations: z.number().int().positive().optional(),
  totalAmount: z.number().positive().optional(),
  steps: z.array(z.string().max(500)),
  reviewedAt: isoDateTime,
});
export type DoseCalcRecord = z.infer<typeof doseCalcRecord>;

export const treatmentSchema = z.object({
  ...base,
  consultationId: ref,
  patientId: ref,
  kind: z.enum(['medication', 'procedure', 'other']),
  name: z.string().trim().min(1).max(300),
  activeIngredient: short,
  dose: short,
  route: short,
  frequency: short,
  durationDays: z.number().int().min(0).max(3650).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  instructions: text,
  status: z.enum(['active', 'completed', 'suspended']),
  prescriptionId: optRef,
  /** Cálculo de dosis revisado, si la dosis se obtuvo con la calculadora. */
  doseCalc: doseCalcRecord.optional(),
});
export type Treatment = z.infer<typeof treatmentSchema>;

export const consultationVersionSchema = z.object({
  ...base,
  consultationId: ref,
  version: z.number().int().min(1),
  reason: z.string().max(2000),
  savedAt: isoDateTime,
  snapshot: z.object({ consultation: z.unknown(), diagnoses: z.array(z.unknown()), treatments: z.array(z.unknown()) }),
});
export type ConsultationVersion = z.infer<typeof consultationVersionSchema>;

// ---------------------------------------------------------------------------
// Recetas
// ---------------------------------------------------------------------------


export const prescriptionItemSchema = z.object({
  id: ref,
  medicationName: z.string().trim().min(1, { error: 'Indica el medicamento' }).max(200),
  activeIngredient: short,
  concentration: short,
  presentation: short,
  dose: z.string().trim().min(1, { error: 'Indica la dosis' }).max(300),
  route: short,
  frequency: short,
  duration: short,
  totalQuantity: short,
  instructions: text,
  warnings: text,
  antimicrobial: z.boolean(),
  controlled: z.boolean(),
  sagNumber: short,
  calc: doseCalcRecord.optional(),
});
export type PrescriptionItem = z.infer<typeof prescriptionItemSchema>;

export const prescriptionSchema = z.object({
  ...base,
  patientId: ref,
  tutorId: ref,
  consultationId: optRef,
  date: isoDate,
  status: z.enum(['draft', 'issued', 'voided']),
  issuedAt: isoDateTime.optional(),
  voidReason: short,
  professional: z.object({
    fullName: z.string().max(200),
    title: z.string().max(200),
    rut: short,
    licenseNumber: short,
    phone: short,
    email: short,
    address: short,
  }),
  patientSnap: z.object({
    name: z.string(),
    species: z.string(),
    breed: short,
    sex: short,
    age: short,
    weightKg: z.number().optional(),
    weightDate: short,
    microchip: short,
  }),
  tutorSnap: z.object({ fullName: z.string(), rut: short, phone: short, address: short }),
  items: z.array(prescriptionItemSchema),
  generalInstructions: text,
  notes: text,
});
export type Prescription = z.infer<typeof prescriptionSchema>;

// ---------------------------------------------------------------------------
// Vacunas y desparasitaciones
// ---------------------------------------------------------------------------
export const vaccinationSchema = z.object({
  ...base,
  patientId: ref,
  consultationId: optRef,
  date: isoDate,
  vaccineName: z.string().trim().min(1, { error: 'Indica la vacuna' }).max(200),
  vaccineType: short,
  manufacturer: short,
  lotNumber: short,
  /** Vencimiento del PRODUCTO (envase). No confundir con la próxima dosis del paciente. */
  productExpiry: isoDate.optional(),
  dose: short,
  route: z.enum(['SC', 'IM', 'IN', 'oral', 'other']).optional(),
  site: short,
  professionalName: z.string().max(200),
  notes: text,
  /** Próxima dosis o refuerzo del PACIENTE. */
  nextDueDate: isoDate.optional(),
  nextDueSource: z.enum(['manual', 'protocol']).optional(),
  protocolId: optRef,
  inventoryItemId: optRef,
  inventoryLotId: optRef,
  status: z.enum(['applied', 'voided']),
  voidReason: short,
});
export type Vaccination = z.infer<typeof vaccinationSchema>;

export const dewormingSchema = z.object({
  ...base,
  patientId: ref,
  consultationId: optRef,
  date: isoDate,
  kind: z.enum(['internal', 'external', 'both']),
  product: z.string().trim().min(1, { error: 'Indica el producto' }).max(200),
  activeIngredient: short,
  weightKgUsed: z.number().positive().max(2000).optional(),
  weightSource: z.enum(['measured_today', 'last_record', 'owner_reported']).optional(),
  dose: short,
  route: z.enum(['oral', 'topical', 'SC', 'other']).optional(),
  protocolApplied: short,
  protocolId: optRef,
  nextDueDate: isoDate.optional(),
  nextDueSource: z.enum(['manual', 'protocol']).optional(),
  lotNumber: short,
  productExpiry: isoDate.optional(),
  professionalName: z.string().max(200),
  notes: text,
  inventoryItemId: optRef,
  inventoryLotId: optRef,
  status: z.enum(['applied', 'voided']),
  voidReason: short,
});
export type Deworming = z.infer<typeof dewormingSchema>;

// ---------------------------------------------------------------------------
// Exámenes, adjuntos y documentos
// ---------------------------------------------------------------------------
export const examType = z.enum([
  'hemogram',
  'biochemistry',
  'urinalysis',
  'coproparasitology',
  'cytology',
  'culture',
  'radiography',
  'ultrasound',
  'rapid_test',
  'histopathology',
  'other',
]);
export const examStatus = z.enum(['requested', 'sampled', 'sent', 'received', 'reviewed', 'cancelled']);
export type ExamStatus = z.infer<typeof examStatus>;

/** Valor de un examen. El rango es el informado por el laboratorio: la app no inventa rangos. */
export const labValueSchema = z.object({
  id: ref,
  /** Código del catálogo (src/features/exams/analytes.ts) o "custom:<nombre>" para valores propios. */
  analyte: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  value: z.number().optional(),
  /** Resultado cualitativo (negativo, trazas, ++…). */
  text: z.string().max(200).optional(),
  unit: z.string().max(40).optional(),
  refLow: z.number().optional(),
  refHigh: z.number().optional(),
  note: z.string().max(500).optional(),
});
export type LabValue = z.infer<typeof labValueSchema>;

export const examSchema = z.object({
  ...base,
  patientId: ref,
  consultationId: optRef,
  type: examType,
  name: short,
  requestedAt: isoDate,
  lab: short,
  sampleDate: isoDate.optional(),
  status: examStatus,
  results: text,
  resultsSource: z.enum(['transcribed', 'attachment', 'professional']).optional(),
  receivedAt: isoDate.optional(),
  interpretation: text,
  followUpAction: text,
  reviewedAt: isoDateTime.optional(),
  /** Valores medidos (para comparar su evolución entre exámenes). */
  values: z.array(labValueSchema).optional(),
});
export type Exam = z.infer<typeof examSchema>;

export const attachmentSchema = z.object({
  ...base,
  ownerKind: z.enum(['patient', 'consultation', 'exam', 'document', 'profile']),
  patientId: optRef,
  consultationId: optRef,
  examId: optRef,
  documentId: optRef,
  kind: z.enum(['photo', 'document', 'lab_result', 'signature', 'logo', 'other']),
  fileName: z.string().max(300),
  mimeType: z.string().max(120),
  size: z.number().int().min(0),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  caption: short,
  takenAt: isoDate.optional(),
  blobId: ref,
  thumbBlobId: optRef,
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const documentKind = z.enum([
  'clinical_report',
  'indications',
  'vaccine_certificate',
  'exam_order',
  'referral',
  'consent',
  'refusal',
]);
export type DocumentKind = z.infer<typeof documentKind>;

export const documentSchema = z.object({
  ...base,
  kind: documentKind,
  patientId: optRef,
  tutorId: optRef,
  consultationId: optRef,
  title: z.string().min(1).max(300),
  date: isoDate,
  status: z.enum(['draft', 'issued', 'voided']),
  issuedAt: isoDateTime.optional(),
  voidReason: short,
  fields: z.record(z.string(), z.string().max(20000)),
  signature: z
    .object({
      method: z.enum(['none', 'paper', 'drawn_on_screen']),
      signerName: short,
      signerRut: short,
      signedAt: isoDateTime.optional(),
      attachmentId: optRef,
    })
    .optional(),
  scanAttachmentId: optRef,
});
export type VetDocument = z.infer<typeof documentSchema>;

// ---------------------------------------------------------------------------
// Economía: cobros, pagos, gastos y presupuestos
// ---------------------------------------------------------------------------
export const lineItemSchema = z.object({
  id: ref,
  serviceId: optRef,
  description: z.string().trim().min(1, { error: 'Describe el ítem' }).max(300),
  category: chargeCategory,
  qty: z.number().positive({ error: 'La cantidad debe ser mayor que 0' }),
  unitPriceCLP: clp,
  discountCLP: clp,
});
export type LineItem = z.infer<typeof lineItemSchema>;

export const chargeSchema = z.object({
  ...base,
  tutorId: ref,
  patientId: optRef,
  consultationId: optRef,
  appointmentId: optRef,
  budgetId: optRef,
  date: isoDate,
  items: z.array(lineItemSchema).min(1, { error: 'Agrega al menos un ítem' }),
  discountCLP: clp,
  notes: text,
  voided: z.boolean(),
  voidReason: short,
});
export type Charge = z.infer<typeof chargeSchema>;

export const paymentSchema = z.object({
  ...base,
  chargeId: ref,
  tutorId: ref,
  date: isoDate,
  amountCLP: z.number().int().positive({ error: 'El monto debe ser mayor que 0' }),
  methodId: ref,
  methodName: z.string().max(120),
  reference: short,
  notes: short,
  voided: z.boolean(),
  voidReason: short,
});
export type Payment = z.infer<typeof paymentSchema>;

export const expenseCategory = z.enum(['travel', 'fuel', 'tolls_parking', 'medication', 'supply', 'lab', 'equipment', 'other']);
export type ExpenseCategory = z.infer<typeof expenseCategory>;

export const expenseSchema = z.object({
  ...base,
  date: isoDate,
  category: expenseCategory,
  description: z.string().trim().min(1, { error: 'Describe el gasto' }).max(300),
  amountCLP: z.number().int().positive({ error: 'El monto debe ser mayor que 0' }),
  km: z.number().min(0).max(100000).optional(),
  consultationId: optRef,
  appointmentId: optRef,
  patientId: optRef,
  notes: short,
});
export type Expense = z.infer<typeof expenseSchema>;

export const budgetSchema = z.object({
  ...base,
  tutorId: ref,
  patientId: optRef,
  date: isoDate,
  validUntil: isoDate.optional(),
  items: z.array(lineItemSchema).min(1, { error: 'Agrega al menos un ítem' }),
  discountCLP: clp,
  notes: text,
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'expired']),
  chargeId: optRef,
});
export type Budget = z.infer<typeof budgetSchema>;

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------
export const inventoryItemSchema = z.object({
  ...base,
  name: z.string().trim().min(1, { error: 'Indica el nombre del producto' }).max(200),
  category: z.enum(['medication', 'vaccine', 'antiparasitic', 'supply', 'other']),
  presentation: short,
  concentration: short,
  unit: z.string().min(1).max(40),
  minStock: z.number().min(0).optional(),
  active: z.boolean(),
  notes: text,
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

export const inventoryLotSchema = z.object({
  ...base,
  itemId: ref,
  lotNumber: short,
  expiryDate: isoDate.optional(),
  notes: short,
});
export type InventoryLot = z.infer<typeof inventoryLotSchema>;

export const movementType = z.enum(['in', 'out', 'use', 'adjust', 'expired', 'loss']);
export type MovementType = z.infer<typeof movementType>;

export const inventoryMovementSchema = z.object({
  ...base,
  itemId: ref,
  lotId: optRef,
  date: isoDate,
  type: movementType,
  /** Cantidad en la unidad del producto. Positiva, salvo en ajustes donde el signo indica el sentido. */
  quantity: z.number().refine((n) => n !== 0 && Number.isFinite(n), { error: 'La cantidad no puede ser 0' }),
  consultationId: optRef,
  patientId: optRef,
  vaccinationId: optRef,
  dewormingId: optRef,
  unitCostCLP: clp.optional(),
  notes: short,
});
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;

// ---------------------------------------------------------------------------
// Tareas, recordatorios, auditoría y borradores
// ---------------------------------------------------------------------------
export const taskSchema = z.object({
  ...base,
  title: z.string().trim().min(1, { error: 'Escribe la tarea' }).max(300),
  type: z.enum(['review_results', 'contact_owner', 'schedule_control', 'complete_docs', 'other']),
  dueDate: isoDate.optional(),
  status: z.enum(['pending', 'in_progress', 'done', 'dismissed']),
  assignee: short,
  patientId: optRef,
  consultationId: optRef,
  examId: optRef,
  notes: text,
  completedAt: isoDateTime.optional(),
});
export type Task = z.infer<typeof taskSchema>;

export const reminderSchema = z.object({
  ...base,
  title: short,
  date: isoDate,
  kind: z.enum(['appointment', 'vaccine', 'deworming', 'control', 'exam', 'followup', 'payment', 'other']),
  patientId: optRef,
  tutorId: optRef,
  /** Para recordatorios derivados (p. ej. 'vaccination:<id>'): guarda solo su estado. */
  sourceKey: short,
  status: z.enum(['pending', 'done', 'dismissed']),
  contactedAt: isoDateTime.optional(),
  notes: short,
  calendarExportedAt: isoDateTime.optional(),
});
export type Reminder = z.infer<typeof reminderSchema>;

export const auditSchema = z.object({
  ...base,
  at: isoDateTime,
  entity: z.string(),
  entityId: z.string(),
  action: z.enum(['create', 'update', 'finalize', 'amend', 'void', 'delete', 'merge', 'anonymize', 'export', 'import', 'restore']),
  summary: z.string().max(1000).optional(),
  changes: z.array(z.object({ field: z.string(), before: z.string().optional(), after: z.string().optional() })).optional(),
  reason: z.string().max(2000).optional(),
});
export type AuditEntry = z.infer<typeof auditSchema>;

export const draftSchema = z.object({
  ...base,
  data: z.unknown(),
});
export type Draft = z.infer<typeof draftSchema>;

// ---------------------------------------------------------------------------
// Registro de tablas
// ---------------------------------------------------------------------------
export const schemas = {
  profile: profileSchema,
  settings: settingsSchema,
  species: speciesSchema,
  services: serviceSchema,
  medicationRefs: medicationRefSchema,
  protocols: protocolSchema,
  templates: templateSchema,
  tutors: tutorSchema,
  patients: patientSchema,
  weights: weightSchema,
  appointments: appointmentSchema,
  consultations: consultationSchema,
  diagnoses: diagnosisSchema,
  treatments: treatmentSchema,
  consultationVersions: consultationVersionSchema,
  prescriptions: prescriptionSchema,
  vaccinations: vaccinationSchema,
  dewormings: dewormingSchema,
  exams: examSchema,
  attachments: attachmentSchema,
  documents: documentSchema,
  charges: chargeSchema,
  payments: paymentSchema,
  expenses: expenseSchema,
  budgets: budgetSchema,
  inventoryItems: inventoryItemSchema,
  inventoryLots: inventoryLotSchema,
  inventoryMovements: inventoryMovementSchema,
  tasks: taskSchema,
  reminders: reminderSchema,
  auditLog: auditSchema,
  drafts: draftSchema,
} as const;

export type Schemas = typeof schemas;
export type TableName = keyof Schemas;
export type EntityOf<T extends TableName> = z.infer<Schemas[T]>;
export type AnyEntity = EntityOf<TableName>;
export const TABLES = Object.keys(schemas) as TableName[];

/** Datos para crear un registro (los campos base se completan automáticamente). */
export type NewEntity<T extends TableName> = Omit<EntityOf<T>, 'id' | 'createdAt' | 'updatedAt' | 'rev'> & {
  id?: string;
};
