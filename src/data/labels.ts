import type {
  AppointmentStatus,
  ChargeCategory,
  ConsultationKind,
  DocumentKind,
  ExamStatus,
  ExamSystem,
  ExpenseCategory,
  FindingStatus,
  MovementType,
  VisitType,
} from './schema';

export const SEX: Record<'male' | 'female' | 'unknown', string> = { male: 'Macho', female: 'Hembra', unknown: 'Sin registrar' };
export const REPRO: Record<'intact' | 'neutered' | 'unknown', string> = {
  intact: 'Entero/a',
  neutered: 'Esterilizado/a o castrado/a',
  unknown: 'Sin registrar',
};
export const PATIENT_STATUS = { active: 'Activo', inactive: 'Inactivo', deceased: 'Fallecido' } as const;

export const CONTACT_PREF = { call: 'Llamada', whatsapp: 'WhatsApp', email: 'Correo', sms: 'SMS' } as const;

export const APPT_STATUS: Record<AppointmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  en_route: 'En camino',
  in_progress: 'En atención',
  completed: 'Completada',
  cancelled: 'Cancelada',
};
export const APPT_STATUS_TONE: Record<AppointmentStatus, 'neutral' | 'brand' | 'info' | 'warning' | 'success' | 'danger'> = {
  pending: 'neutral',
  confirmed: 'brand',
  en_route: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
};

export const VISIT_TYPE: Record<VisitType, string> = {
  consultation: 'Consulta',
  control: 'Control',
  vaccination: 'Vacunación',
  deworming: 'Desparasitación',
  sampling: 'Toma de muestras',
  procedure: 'Procedimiento',
  emergency: 'Urgencia',
  other: 'Otro',
};

export const CONSULT_KIND: Record<ConsultationKind, string> = {
  consultation: 'Consulta',
  control: 'Control / seguimiento',
  emergency: 'Urgencia',
  procedure: 'Procedimiento',
  vaccination: 'Vacunación',
};

export const CONSULT_STATUS = { draft: 'Borrador', final: 'Finalizada', voided: 'Anulada' } as const;

export const FINDING: Record<FindingStatus, string> = { not_evaluated: 'No evaluado', normal: 'Normal', abnormal: 'Alterado' };

export const EXAM_SYSTEM: Record<ExamSystem, string> = {
  cardiovascular: 'Cardiovascular',
  respiratory: 'Respiratorio',
  digestive: 'Digestivo y abdominal',
  dermatological: 'Piel y anexos',
  ocular: 'Ojos',
  otic: 'Oídos',
  musculoskeletal: 'Musculoesquelético',
  neurological: 'Neurológico',
  lymphNodes: 'Linfonodos',
  urogenital: 'Urogenital',
  oral: 'Cavidad oral',
};

export const MUCOUS_COLORS = ['Rosadas', 'Pálidas', 'Congestivas', 'Cianóticas', 'Ictéricas', 'Otra'];

export const DX_KIND = { differential: 'Diferencial', presumptive: 'Presuntivo', confirmed: 'Confirmado' } as const;
export const DX_STATUS = { active: 'Activo', chronic: 'Crónico', resolved: 'Resuelto' } as const;
export const TREAT_KIND = { medication: 'Medicamento', procedure: 'Procedimiento', other: 'Otro' } as const;
export const TREAT_STATUS = { active: 'En curso', completed: 'Finalizado', suspended: 'Suspendido' } as const;
export const ADHERENCE = { good: 'Buena', partial: 'Parcial', poor: 'Baja', unknown: 'No informada' } as const;

export const SEVERITY = { mild: 'Leve', moderate: 'Moderada', severe: 'Grave', unknown: 'Sin registrar' } as const;
export const CONDITION_STATUS = { active: 'Activa', controlled: 'Controlada', resolved: 'Resuelta' } as const;
export const SOURCE = {
  professional: 'Registrado por la profesional',
  owner: 'Informado por el tutor',
  document: 'De un documento',
  calculated: 'Calculado por la app',
  copied: 'Copiado de otra consulta',
  template: 'De plantilla',
} as const;

export const VACCINE_ROUTE = { SC: 'Subcutánea (SC)', IM: 'Intramuscular (IM)', IN: 'Intranasal (IN)', oral: 'Oral', other: 'Otra' } as const;
export const DEWORM_KIND = { internal: 'Interna', external: 'Externa', both: 'Interna y externa' } as const;
export const DEWORM_ROUTE = { oral: 'Oral', topical: 'Tópica (spot-on, collar, spray)', SC: 'Subcutánea', other: 'Otra' } as const;
export const WEIGHT_SOURCE = {
  measured_today: 'Pesado en esta atención',
  last_record: 'Último peso registrado',
  owner_reported: 'Informado por el tutor',
} as const;

export const EXAM_TYPE = {
  hemogram: 'Hemograma',
  biochemistry: 'Perfil bioquímico',
  urinalysis: 'Urianálisis',
  coproparasitology: 'Coproparasitario',
  cytology: 'Citología',
  culture: 'Cultivo / antibiograma',
  radiography: 'Radiografía',
  ultrasound: 'Ecografía',
  rapid_test: 'Test rápido',
  histopathology: 'Histopatología',
  other: 'Otro',
} as const;

export const EXAM_STATUS: Record<ExamStatus, string> = {
  requested: 'Solicitado',
  sampled: 'Muestra tomada',
  sent: 'Enviado al laboratorio',
  received: 'Resultado recibido',
  reviewed: 'Revisado',
  cancelled: 'Anulado',
};
export const EXAM_STATUS_TONE: Record<ExamStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'brand'> = {
  requested: 'neutral',
  sampled: 'info',
  sent: 'info',
  received: 'warning',
  reviewed: 'success',
  cancelled: 'danger',
};

export const DOC_KIND: Record<DocumentKind, string> = {
  clinical_report: 'Informe clínico',
  indications: 'Indicaciones posteriores a la atención',
  vaccine_certificate: 'Certificado de vacunación',
  exam_order: 'Orden de exámenes',
  referral: 'Informe de derivación',
  consent: 'Consentimiento informado',
  refusal: 'Rechazo de procedimiento',
};

export const CHARGE_CATEGORY: Record<ChargeCategory, string> = {
  fee: 'Honorarios',
  medication: 'Medicamentos',
  supply: 'Insumos',
  travel: 'Traslado',
  other: 'Otros',
};

export const EXPENSE_CATEGORY: Record<ExpenseCategory, string> = {
  travel: 'Traslado',
  fuel: 'Combustible',
  tolls_parking: 'Peajes y estacionamiento',
  medication: 'Medicamentos',
  supply: 'Insumos',
  lab: 'Laboratorio',
  equipment: 'Equipamiento',
  other: 'Otros',
};

export const BUDGET_STATUS = { draft: 'Borrador', sent: 'Enviado', accepted: 'Aceptado', rejected: 'Rechazado', expired: 'Vencido' } as const;

export const INVENTORY_CATEGORY = {
  medication: 'Medicamento',
  vaccine: 'Vacuna',
  antiparasitic: 'Antiparasitario',
  supply: 'Insumo',
  other: 'Otro',
} as const;

export const MOVEMENT_TYPE: Record<MovementType, string> = {
  in: 'Entrada',
  out: 'Salida',
  use: 'Uso en atención',
  adjust: 'Ajuste de inventario',
  expired: 'Baja por vencimiento',
  loss: 'Pérdida / daño',
};

export const TASK_TYPE = {
  review_results: 'Revisar resultados',
  contact_owner: 'Contactar al tutor',
  schedule_control: 'Agendar control',
  complete_docs: 'Completar documentación',
  other: 'Otra',
} as const;
export const TASK_STATUS = { pending: 'Pendiente', in_progress: 'En curso', done: 'Hecha', dismissed: 'Descartada' } as const;

export const PAYMENT_STATUS = { pending: 'Pendiente', partial: 'Pago parcial', paid: 'Pagado', voided: 'Anulado' } as const;
export const PAYMENT_STATUS_TONE = { pending: 'warning', partial: 'info', paid: 'success', voided: 'danger' } as const;

export const AUDIT_ACTION = {
  create: 'Creación',
  update: 'Modificación',
  finalize: 'Finalización',
  amend: 'Enmienda',
  void: 'Anulación',
  delete: 'Eliminación',
  merge: 'Fusión',
  anonymize: 'Anonimización',
  export: 'Exportación',
  import: 'Importación',
  restore: 'Restauración',
} as const;

export const TABLE_LABEL: Record<string, string> = {
  profile: 'Perfil profesional',
  tutors: 'Tutor',
  patients: 'Paciente',
  weights: 'Peso',
  appointments: 'Cita',
  consultations: 'Consulta',
  diagnoses: 'Diagnóstico',
  treatments: 'Tratamiento',
  prescriptions: 'Receta',
  vaccinations: 'Vacunación',
  dewormings: 'Desparasitación',
  exams: 'Examen',
  attachments: 'Adjunto',
  documents: 'Documento',
  charges: 'Cobro',
  payments: 'Pago',
  expenses: 'Gasto',
  budgets: 'Presupuesto',
  inventoryMovements: 'Movimiento de inventario',
  export: 'Exportación',
};
