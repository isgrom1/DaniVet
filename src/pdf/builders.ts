import { getRecord, getTable } from '@/data/store';
import type { Attachment, Patient, Profile, Tutor } from '@/data/schema';
import { CHARGE_CATEGORY, DEWORM_KIND, DOC_KIND, EXAM_STATUS, EXAM_TYPE, PAYMENT_STATUS, REPRO, SEX, TREAT_STATUS, VACCINE_ROUTE, BUDGET_STATUS } from '@/data/labels';
import { UserError } from '@/data/errors';
import { ageText, formatDate, formatDateTime } from '@/lib/dates';
import { formatCLP, formatDecimal } from '@/lib/numbers';
import { formatPhone } from '@/lib/phone';
import { addressText } from '@/lib/maps';
import { readBlob } from '@/features/attachments/attachments';
import { consultationSummary } from '@/features/consultations/summary';
import { patientAlerts, primaryTutor, speciesName, latestWeight } from '@/features/patients/selectors';
import { chargeBalance, chargeState, docTotal, itemsSubtotal, lineTotal, paidFor } from '@/features/finance/calc';
import { useDataStore } from '@/data/store';
import { PdfWriter } from './engine';

const SIGNATURE_CAPTION = 'Firma digitalizada (imagen). No constituye firma electrónica avanzada.';
const GENERATED = 'Documento generado con VetCasa a partir de los registros de la profesional.';

async function imageBytes(att?: Attachment): Promise<Uint8Array | undefined> {
  if (!att || !att.mimeType.startsWith('image/')) return undefined;
  try {
    return new Uint8Array(await (await readBlob(att.blobId, att.mimeType)).arrayBuffer());
  } catch {
    return undefined;
  }
}

async function profileAssets(): Promise<{ profile?: Profile; logo?: Uint8Array; signature?: Uint8Array }> {
  const profile = getRecord('profile', 'profile');
  const logo = await imageBytes(getRecord('attachments', profile?.logoAttachmentId));
  const signature = await imageBytes(getRecord('attachments', profile?.signatureAttachmentId));
  return { profile, logo, signature };
}

function professionalLines(p?: Profile): string[] {
  if (!p) return [];
  return [p.title, p.rut ? `RUT ${p.rut}` : '', p.licenseNumber ? `Registro/colegiatura: ${p.licenseNumber}` : ''].filter(Boolean);
}

function patientRows(p: Patient, tutor?: Tutor): Array<[string, string | undefined]> {
  const t = useDataStore.getState().tables;
  const lw = latestWeight(t, p.id);
  return [
    ['Paciente', p.name],
    ['Especie / raza', [speciesName(t, p.speciesId), p.breed].filter(Boolean).join(' / ')],
    ['Sexo', `${SEX[p.sex]}${p.reproductiveStatus !== 'unknown' ? ` · ${REPRO[p.reproductiveStatus]}` : ''}`],
    ['Edad', p.birthDate ? `${ageText(p.birthDate, undefined, p.birthDateEstimated)} (${p.birthDateEstimated ? 'estimada' : `nac. ${formatDate(p.birthDate)}`})` : undefined],
    ['Peso', lw ? `${formatDecimal(lw.weightKg)} kg (${formatDate(lw.date)})` : undefined],
    ['Microchip', p.microchip],
    ['Tutor/a', tutor?.fullName],
    ['RUT tutor/a', tutor?.rut],
    ['Teléfono', tutor?.phone ? formatPhone(tutor.phone) : undefined],
  ];
}

function footer(p?: Profile, extra?: string): string {
  return [extra, p?.documentFooter, GENERATED].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Receta
// ---------------------------------------------------------------------------
export async function prescriptionPdf(id: string): Promise<Blob> {
  const r = getRecord('prescriptions', id);
  if (!r) throw new UserError('Receta no encontrada.');
  if (!r.items.length) throw new UserError('La receta no tiene medicamentos.');
  const { profile, logo, signature } = await profileAssets();
  const w = await PdfWriter.create({
    paper: profile?.paperSize ?? 'letter',
    title: 'Receta médico veterinaria',
    docTitle: 'Receta médico veterinaria',
    docSubtitle: `Fecha de emisión: ${formatDate(r.date, 'long')} · N.º ${r.id.slice(0, 8).toUpperCase()}`,
    profile: { ...(profile as Profile), ...r.professional, fullName: r.professional.fullName || profile?.fullName || '' } as Profile,
    logo,
    watermark: r.status === 'draft' ? 'BORRADOR' : r.status === 'voided' ? 'ANULADA' : undefined,
    footerNote: footer(profile, 'Verifique que este formato cumple los requisitos aplicables al medicamento prescrito.'),
  });
  w.heading('Paciente y tutor/a');
  w.keyValues([
    ['Paciente', r.patientSnap.name],
    ['Especie / raza', [r.patientSnap.species, r.patientSnap.breed].filter(Boolean).join(' / ')],
    ['Sexo', r.patientSnap.sex],
    ['Edad', r.patientSnap.age],
    ['Peso', r.patientSnap.weightKg !== undefined ? `${formatDecimal(r.patientSnap.weightKg)} kg${r.patientSnap.weightDate ? ` (${r.patientSnap.weightDate})` : ''}` : undefined],
    ['Microchip', r.patientSnap.microchip],
    ['Tutor/a', r.tutorSnap.fullName],
    ['RUT', r.tutorSnap.rut],
    ['Domicilio', r.tutorSnap.address],
  ]);
  w.heading('Indicaciones (Rp.)');
  r.items.forEach((it, idx) => {
    w.ensure(70);
    w.text(`${idx + 1}. ${it.medicationName}${it.concentration ? ` ${it.concentration}` : ''}`, { size: 11.5, font: w.bold });
    w.keyValues(
      [
        ['Principio activo', it.activeIngredient],
        ['Presentación', it.presentation],
        ['Dosis', it.dose],
        ['Vía', it.route],
        ['Frecuencia', it.frequency],
        ['Duración', it.duration],
        ['Cantidad total', it.totalQuantity],
        ['Instrucciones', it.instructions],
        ['Advertencias', it.warnings],
      ],
      120,
    );
    if (it.calc) {
      const c = it.calc;
      w.text(
        `Cálculo revisado por la profesional el ${formatDateTime(c.reviewedAt)}: ${c.weightKg ? `peso ${formatDecimal(c.weightKg, 2)} kg (${c.weightSource ?? 'registrado'}), ` : ''}dosis ${formatDecimal(c.doseValue, 3)} ${c.doseUnit}${c.concentrationValue ? `, concentración ${formatDecimal(c.concentrationValue, 3)} ${c.concentrationUnit}` : ''} → ${formatDecimal(c.amountPerAdmin, 3)} ${c.amountUnit} por administración.`,
        { size: 8, font: w.italic, color: undefined },
      );
    }
    if (it.antimicrobial) {
      w.box(
        `Antimicrobiano. La normativa del SAG exige emitir las recetas de antimicrobianos de uso veterinario en su Sistema de Prescripción Electrónica. ${it.sagNumber ? `N.º de receta electrónica SAG: ${it.sagNumber}.` : 'Este documento no reemplaza esa receta electrónica.'}`,
        'warning',
        8.5,
      );
    }
    if (it.controlled) {
      w.box('Producto sujeto a control especial: requiere receta retenida en el formato exigido por la normativa vigente. Este documento no la reemplaza.', 'danger', 8.5);
    }
    w.spacer(4);
  });
  if (r.generalInstructions) {
    w.heading('Indicaciones generales');
    w.text(r.generalInstructions);
  }
  if (r.notes) {
    w.heading('Observaciones');
    w.text(r.notes);
  }
  if (r.status === 'voided') w.box(`Receta anulada${r.voidReason ? `: ${r.voidReason}` : ''}.`, 'danger');
  await w.signature({ image: signature, name: r.professional.fullName, lines: professionalLines({ ...(profile as Profile), ...r.professional } as Profile), caption: signature ? SIGNATURE_CAPTION : undefined });
  return w.finish();
}

// ---------------------------------------------------------------------------
// Informe clínico de una consulta
// ---------------------------------------------------------------------------
export async function consultationPdf(id: string): Promise<Blob> {
  const c = getRecord('consultations', id);
  if (!c) throw new UserError('Consulta no encontrada.');
  const t = useDataStore.getState().tables;
  const patient = getRecord('patients', c.patientId);
  if (!patient) throw new UserError('Paciente no encontrado.');
  const tutor = getRecord('tutors', c.tutorId);
  const { profile, logo, signature } = await profileAssets();
  const w = await PdfWriter.create({
    paper: profile?.paperSize ?? 'letter',
    title: 'Informe clínico veterinario',
    docTitle: 'Informe clínico',
    docSubtitle: `Atención del ${formatDateTime(c.startedAt)}${c.version > 1 ? ` · Versión ${c.version} (enmendada)` : ''}`,
    profile,
    logo,
    watermark: c.status === 'draft' ? 'BORRADOR' : c.status === 'voided' ? 'ANULADA' : undefined,
    footerNote: footer(profile, 'Informe confidencial: contiene datos personales y clínicos.'),
  });
  w.heading('Identificación');
  w.keyValues(patientRows(patient, tutor));
  const alerts = patientAlerts(patient).filter((a) => a.level === 'critical');
  if (alerts.length) w.box(`Alertas: ${alerts.map((a) => `${a.label}: ${a.text}${a.pending ? ' (por confirmar)' : ''}`).join(' · ')}`, 'danger');
  for (const s of consultationSummary(t, c)) {
    if (s.title === 'Atención') continue;
    w.heading(s.title);
    w.keyValues(s.rows.map((r) => [r.label, r.value]), 150);
  }
  if (c.status === 'voided') w.box(`Consulta anulada${c.voidReason ? `: ${c.voidReason}` : ''}.`, 'danger');
  await w.signature({ image: signature, name: c.professionalName || profile?.fullName, lines: professionalLines(profile), caption: signature ? SIGNATURE_CAPTION : undefined });
  return w.finish();
}

/** Indicaciones para el tutor: solo el plan y los cuidados (sin el detalle clínico completo). */
export async function ownerInstructionsPdf(id: string): Promise<Blob> {
  const c = getRecord('consultations', id);
  if (!c) throw new UserError('Consulta no encontrada.');
  const patient = getRecord('patients', c.patientId);
  if (!patient) throw new UserError('Paciente no encontrado.');
  const tutor = getRecord('tutors', c.tutorId);
  const treatments = [...getTable('treatments').values()].filter((x) => x.consultationId === c.id);
  const dx = [...getTable('diagnoses').values()].filter((d) => d.consultationId === c.id && d.kind !== 'differential');
  const tpl = [...getTable('templates').values()].find((x) => x.kind === 'indications' && x.active);
  const { profile, logo, signature } = await profileAssets();
  const w = await PdfWriter.create({
    paper: profile?.paperSize ?? 'letter',
    title: 'Indicaciones posteriores a la atención',
    docTitle: 'Indicaciones posteriores a la atención',
    docSubtitle: `${patient.name} · ${formatDate(c.startedAt, 'long')}`,
    profile,
    logo,
    footerNote: footer(profile),
  });
  w.keyValues([
    ['Paciente', patient.name],
    ['Tutor/a', tutor?.fullName],
    ['Motivo', c.reason.main],
    ['Diagnóstico', dx.map((d) => d.name).join(', ')],
  ]);
  if (treatments.length) {
    w.heading('Tratamiento indicado');
    treatments.forEach((x, i) => {
      w.text(`${i + 1}. ${x.name}`, { font: w.bold });
      w.keyValues(
        [
          ['Dosis', x.dose],
          ['Vía', x.route],
          ['Frecuencia', x.frequency],
          ['Duración', x.durationDays ? `${x.durationDays} días${x.startDate ? ` (desde ${formatDate(x.startDate)})` : ''}` : undefined],
          ['Instrucciones', x.instructions],
          ['Estado', x.status !== 'active' ? TREAT_STATUS[x.status] : undefined],
        ],
        110,
      );
    });
  }
  if (c.plan.homeCare) {
    w.heading('Cuidados en casa');
    w.text(c.plan.homeCare);
  }
  if (c.plan.ownerRecommendations) {
    w.heading('Recomendaciones');
    w.text(c.plan.ownerRecommendations);
  }
  if (c.plan.pendingTests) {
    w.heading('Exámenes pendientes');
    w.text(c.plan.pendingTests);
  }
  if (c.plan.controlDate) {
    w.heading('Próximo control');
    w.text(formatDate(c.plan.controlDate, 'long'));
  }
  if (tpl?.fields.body) w.box(tpl.fields.body, 'info');
  w.box(`Contacto: ${[profile?.fullName, profile?.phone, profile?.email].filter(Boolean).join(' · ')}`, 'info');
  await w.signature({ image: signature, name: profile?.fullName, lines: professionalLines(profile), caption: signature ? SIGNATURE_CAPTION : undefined });
  return w.finish();
}

// ---------------------------------------------------------------------------
// Certificado de vacunación
// ---------------------------------------------------------------------------
export async function vaccineCertificatePdf(patientId: string): Promise<Blob> {
  const patient = getRecord('patients', patientId);
  if (!patient) throw new UserError('Paciente no encontrado.');
  const t = useDataStore.getState().tables;
  const vacs = [...t.vaccinations.values()].filter((v) => v.patientId === patientId && v.status === 'applied').sort((a, b) => a.date.localeCompare(b.date));
  if (!vacs.length) throw new UserError('No hay vacunas aplicadas registradas.');
  const tutor = primaryTutor(t, patient);
  const { profile, logo, signature } = await profileAssets();
  const w = await PdfWriter.create({
    paper: profile?.paperSize ?? 'letter',
    title: 'Certificado de vacunación',
    docTitle: 'Certificado de vacunación',
    docSubtitle: `Emitido el ${formatDate(new Date().toISOString(), 'long')}`,
    profile,
    logo,
    footerNote: footer(profile),
  });
  w.heading('Identificación del paciente');
  w.keyValues([...patientRows(patient, tutor).filter(([k]) => !['Teléfono', 'RUT tutor/a', 'Peso'].includes(k)), ['Color / señas', [patient.color, patient.markings].filter(Boolean).join(' · ')]]);
  w.heading('Vacunas registradas');
  w.table(
    [
      { title: 'Fecha', width: 1.1 },
      { title: 'Vacuna', width: 2 },
      { title: 'Laboratorio', width: 1.3 },
      { title: 'Lote', width: 1 },
      { title: 'Venc. producto', width: 1.1 },
      { title: 'Próxima dosis', width: 1.1 },
    ],
    vacs.map((v) => [
      formatDate(v.date),
      [v.vaccineName, v.vaccineType, v.route ? VACCINE_ROUTE[v.route] : ''].filter(Boolean).join(' · '),
      v.manufacturer ?? '',
      v.lotNumber ?? '',
      v.productExpiry ? formatDate(v.productExpiry) : '',
      v.nextDueDate ? formatDate(v.nextDueDate) : '',
    ]),
  );
  w.text('“Venc. producto” corresponde a la fecha de vencimiento del envase de la vacuna; “Próxima dosis” es la fecha indicada para el paciente.', { size: 8, font: w.italic });
  w.spacer(6);
  w.text(`Certifico que, según mis registros, el paciente individualizado recibió las vacunas indicadas en las fechas señaladas.`, { size: 10 });
  await w.signature({ image: signature, name: profile?.fullName, lines: professionalLines(profile), caption: signature ? SIGNATURE_CAPTION : undefined });
  return w.finish();
}

// ---------------------------------------------------------------------------
// Documentos (consentimiento, rechazo, derivación, orden de exámenes, indicaciones, informe)
// ---------------------------------------------------------------------------
export function fillTemplate(text: string, vars: Record<string, string | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (_m, k: string) => (vars[k] !== undefined && vars[k] !== '' ? (vars[k] as string) : '______'));
}

export async function documentPdf(id: string): Promise<Blob> {
  const d = getRecord('documents', id);
  if (!d) throw new UserError('Documento no encontrado.');
  const t = useDataStore.getState().tables;
  const patient = d.patientId ? getRecord('patients', d.patientId) : undefined;
  const tutor = d.tutorId ? getRecord('tutors', d.tutorId) : patient ? primaryTutor(t, patient) : undefined;
  const { profile, logo, signature } = await profileAssets();
  const w = await PdfWriter.create({
    paper: profile?.paperSize ?? 'letter',
    title: DOC_KIND[d.kind],
    docTitle: d.title || DOC_KIND[d.kind],
    docSubtitle: `Fecha: ${formatDate(d.date, 'long')}`,
    profile,
    logo,
    watermark: d.status === 'draft' ? 'BORRADOR' : d.status === 'voided' ? 'ANULADO' : undefined,
    footerNote: footer(profile),
  });
  if (patient) {
    w.heading('Identificación');
    w.keyValues(patientRows(patient, tutor));
  }
  const f = d.fields;
  const vars = {
    tutor: d.signature?.signerName || tutor?.fullName,
    rut_tutor: d.signature?.signerRut || tutor?.rut,
    paciente: patient?.name,
    especie: patient ? speciesName(t, patient.speciesId).toLowerCase() : undefined,
    profesional: profile?.fullName,
    procedimiento: f.procedure,
    fecha: formatDate(d.date, 'long'),
  };
  const sectionsByKind: Record<string, Array<[string, string]>> = {
    consent: [
      ['Procedimiento', 'procedure'],
      ['Riesgos y posibles complicaciones informados', 'risks'],
      ['Alternativas', 'alternatives'],
      ['Costo estimado', 'cost'],
      ['Observaciones', 'notes'],
    ],
    refusal: [
      ['Procedimiento rechazado', 'procedure'],
      ['Consecuencias informadas', 'consequences'],
      ['Observaciones', 'notes'],
    ],
    referral: [
      ['Derivado a', 'to'],
      ['Motivo de la derivación', 'reason'],
      ['Resumen clínico', 'summary'],
      ['Tratamientos realizados', 'treatments'],
      ['Exámenes disponibles', 'tests'],
    ],
    exam_order: [
      ['Exámenes solicitados', 'exams'],
      ['Tipo de muestra', 'sample'],
      ['Laboratorio', 'lab'],
      ['Sospecha clínica / antecedentes', 'clinical'],
    ],
    indications: [
      ['Indicaciones', 'instructions'],
      ['Signos de alarma', 'alarms'],
      ['Próximo control', 'control'],
    ],
    clinical_report: [['Informe', 'report']],
    vaccine_certificate: [['Detalle', 'notes']],
  };
  for (const [label, key] of sectionsByKind[d.kind] ?? []) {
    if (!f[key]?.trim()) continue;
    w.heading(label);
    w.text(f[key]);
  }
  if (f.body?.trim()) {
    w.spacer(6);
    w.text(fillTemplate(f.body, vars), { size: 10.5 });
  }
  if (d.status === 'voided') w.box(`Documento anulado${d.voidReason ? `: ${d.voidReason}` : ''}.`, 'danger');
  const needsOwner = d.kind === 'consent' || d.kind === 'refusal';
  if (needsOwner) {
    const drawn = d.signature?.method === 'drawn_on_screen' ? await imageBytes(getRecord('attachments', d.signature.attachmentId)) : undefined;
    await w.signature({
      x: w.margin,
      image: drawn,
      name: vars.tutor ?? 'Nombre del tutor/a',
      lines: [vars.rut_tutor ? `RUT ${vars.rut_tutor}` : 'RUT: ____________', 'Tutor/a responsable'],
      caption: drawn ? `Trazo capturado en pantalla el ${formatDateTime(d.signature?.signedAt)}. No equivale a firma electrónica avanzada.` : undefined,
    });
    await w.signature({ image: signature, name: profile?.fullName, lines: professionalLines(profile), caption: signature ? SIGNATURE_CAPTION : undefined });
  } else {
    await w.signature({ image: signature, name: profile?.fullName, lines: professionalLines(profile), caption: signature ? SIGNATURE_CAPTION : undefined });
  }
  return w.finish();
}

// ---------------------------------------------------------------------------
// Presupuesto y comprobante interno
// ---------------------------------------------------------------------------
function itemRows(items: Array<{ description: string; category: keyof typeof CHARGE_CATEGORY; qty: number; unitPriceCLP: number; discountCLP: number }>) {
  return items.map((li) => [li.description, CHARGE_CATEGORY[li.category], formatDecimal(li.qty), formatCLP(li.unitPriceCLP), li.discountCLP ? `-${formatCLP(li.discountCLP)}` : '', formatCLP(lineTotal(li))]);
}
const ITEM_COLS = [
  { title: 'Descripción', width: 3 },
  { title: 'Tipo', width: 1.3 },
  { title: 'Cant.', width: 0.7, align: 'right' as const },
  { title: 'Precio', width: 1.1, align: 'right' as const },
  { title: 'Desc.', width: 1, align: 'right' as const },
  { title: 'Total', width: 1.2, align: 'right' as const },
];

export async function budgetPdf(id: string): Promise<Blob> {
  const b = getRecord('budgets', id);
  if (!b) throw new UserError('Presupuesto no encontrado.');
  const tutor = getRecord('tutors', b.tutorId);
  const patient = b.patientId ? getRecord('patients', b.patientId) : undefined;
  const { profile, logo } = await profileAssets();
  const w = await PdfWriter.create({
    paper: profile?.paperSize ?? 'letter',
    title: 'Presupuesto',
    docTitle: 'Presupuesto',
    docSubtitle: `Fecha: ${formatDate(b.date)}${b.validUntil ? ` · Válido hasta: ${formatDate(b.validUntil)}` : ''} · ${BUDGET_STATUS[b.status]}`,
    profile,
    logo,
    footerNote: footer(profile, 'Documento informativo: no constituye boleta ni factura.'),
  });
  w.keyValues([
    ['Tutor/a', tutor?.fullName],
    ['Paciente', patient?.name],
  ]);
  w.table(ITEM_COLS, itemRows(b.items));
  w.keyValues(
    [
      ['Subtotal', formatCLP(itemsSubtotal(b.items))],
      ['Descuento', b.discountCLP ? `-${formatCLP(b.discountCLP)}` : undefined],
      ['Total', formatCLP(docTotal(b))],
    ],
    380,
  );
  if (b.notes) {
    w.heading('Observaciones');
    w.text(b.notes);
  }
  w.box('Valores en pesos chilenos. Presupuesto referencial: el monto final puede variar según la evolución del paciente, lo que será informado previamente.', 'info');
  return w.finish();
}

export async function receiptPdf(chargeId: string): Promise<Blob> {
  const c = getRecord('charges', chargeId);
  if (!c) throw new UserError('Cobro no encontrado.');
  const t = useDataStore.getState().tables;
  const tutor = getRecord('tutors', c.tutorId);
  const patient = c.patientId ? getRecord('patients', c.patientId) : undefined;
  const payments = [...t.payments.values()].filter((p) => p.chargeId === c.id && !p.voided).sort((a, b) => a.date.localeCompare(b.date));
  const { profile, logo } = await profileAssets();
  const w = await PdfWriter.create({
    paper: profile?.paperSize ?? 'letter',
    title: 'Comprobante interno',
    docTitle: 'Comprobante interno de atención',
    docSubtitle: `Fecha: ${formatDate(c.date)} · N.º ${c.id.slice(0, 8).toUpperCase()} · ${PAYMENT_STATUS[chargeState(t, c)]}`,
    profile,
    logo,
    watermark: c.voided ? 'ANULADO' : undefined,
    footerNote: footer(profile, 'COMPROBANTE INTERNO. No es boleta ni factura y no tiene validez tributaria.'),
  });
  w.box('COMPROBANTE INTERNO — NO VÁLIDO COMO BOLETA NI FACTURA (documento no tributario).', 'warning', 9.5);
  w.keyValues([
    ['Tutor/a', tutor?.fullName],
    ['Paciente', patient?.name],
  ]);
  w.table(ITEM_COLS, itemRows(c.items));
  w.keyValues(
    [
      ['Subtotal', formatCLP(itemsSubtotal(c.items))],
      ['Descuento', c.discountCLP ? `-${formatCLP(c.discountCLP)}` : undefined],
      ['Total', formatCLP(docTotal(c))],
      ['Pagado', formatCLP(paidFor(t, c.id))],
      ['Saldo pendiente', formatCLP(chargeBalance(t, c))],
    ],
    380,
  );
  if (payments.length) {
    w.heading('Pagos registrados');
    w.table(
      [
        { title: 'Fecha', width: 1 },
        { title: 'Medio', width: 1.5 },
        { title: 'Referencia', width: 1.5 },
        { title: 'Monto', width: 1, align: 'right' },
      ],
      payments.map((p) => [formatDate(p.date), p.methodName, p.reference ?? '', formatCLP(p.amountCLP)]),
    );
  }
  return w.finish();
}

// ---------------------------------------------------------------------------
// Ficha clínica completa del paciente
// ---------------------------------------------------------------------------
export async function patientHistoryPdf(patientId: string): Promise<Blob> {
  const patient = getRecord('patients', patientId);
  if (!patient) throw new UserError('Paciente no encontrado.');
  const t = useDataStore.getState().tables;
  const tutor = primaryTutor(t, patient);
  const { profile, logo } = await profileAssets();
  const w = await PdfWriter.create({
    paper: profile?.paperSize ?? 'letter',
    title: 'Ficha clínica',
    docTitle: `Ficha clínica: ${patient.name}`,
    docSubtitle: `Generada el ${formatDateTime(new Date().toISOString())}`,
    profile,
    logo,
    footerNote: footer(profile, 'Documento confidencial con datos personales y clínicos.'),
  });
  w.heading('Identificación');
  w.keyValues(patientRows(patient, tutor));
  if (tutor) w.keyValues([['Dirección', addressText(tutor.addresses.find((a) => a.primary) ?? tutor.addresses[0])]]);
  const alerts = patientAlerts(patient, t);
  if (alerts.length) {
    w.heading('Alertas clínicas');
    for (const a of alerts) w.text(`• ${a.label}: ${a.text}${a.pending ? ' (por confirmar)' : ''}`, { size: 10 });
  }
  const bg = patient.background;
  w.heading('Antecedentes');
  w.keyValues([
    ['Enfermedades previas', bg.previousDiseases],
    ['Cirugías', bg.surgeries],
    ['Vacunación (antecedentes)', bg.vaccinationHistory],
    ['Desparasitación interna', bg.dewormingInternal],
    ['Desparasitación externa', bg.dewormingExternal],
    ['Alimentación', bg.diet],
    ['Hábitat', bg.habitat],
    ['Estilo de vida', bg.lifestyle],
    ['Conducta', bg.behavior],
    ['Familiares / epidemiológicos', bg.familyEpidemiological],
    ['Otros', bg.other],
  ]);
  const consults = [...t.consultations.values()].filter((c) => c.patientId === patientId && c.status !== 'voided').sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const c of consults) {
    w.ensure(80);
    w.spacer(6);
    w.rule();
    w.text(`Consulta del ${formatDateTime(c.startedAt)}${c.status === 'draft' ? ' (BORRADOR)' : ''}${c.version > 1 ? ` · v${c.version}` : ''}`, { size: 11.5, font: w.bold });
    for (const s of consultationSummary(t, c)) {
      if (s.title === 'Atención') continue;
      w.text(s.title, { size: 9.5, font: w.bold });
      w.keyValues(s.rows.map((r) => [r.label, r.value]), 150, 9.5);
    }
  }
  const vacs = [...t.vaccinations.values()].filter((v) => v.patientId === patientId && v.status === 'applied').sort((a, b) => a.date.localeCompare(b.date));
  if (vacs.length) {
    w.heading('Vacunas');
    w.table(
      [
        { title: 'Fecha', width: 1 },
        { title: 'Vacuna', width: 2 },
        { title: 'Lote', width: 1 },
        { title: 'Próxima', width: 1 },
      ],
      vacs.map((v) => [formatDate(v.date), v.vaccineName, v.lotNumber ?? '', v.nextDueDate ? formatDate(v.nextDueDate) : '']),
    );
  }
  const dews = [...t.dewormings.values()].filter((d) => d.patientId === patientId && d.status === 'applied').sort((a, b) => a.date.localeCompare(b.date));
  if (dews.length) {
    w.heading('Desparasitaciones');
    w.table(
      [
        { title: 'Fecha', width: 1 },
        { title: 'Tipo', width: 1 },
        { title: 'Producto', width: 2 },
        { title: 'Peso', width: 0.8 },
        { title: 'Próxima', width: 1 },
      ],
      dews.map((d) => [formatDate(d.date), DEWORM_KIND[d.kind], d.product, d.weightKgUsed ? `${formatDecimal(d.weightKgUsed)} kg` : '', d.nextDueDate ? formatDate(d.nextDueDate) : '']),
    );
  }
  const exams = [...t.exams.values()].filter((e) => e.patientId === patientId).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  if (exams.length) {
    w.heading('Exámenes');
    for (const e of exams) {
      w.text(`${formatDate(e.requestedAt)} · ${e.name || EXAM_TYPE[e.type]} · ${EXAM_STATUS[e.status]}`, { size: 10, font: w.bold });
      w.keyValues(
        [
          ['Laboratorio', e.lab],
          ['Resultados', e.results],
          ['Interpretación', e.interpretation],
          ['Conducta', e.followUpAction],
        ],
        120,
        9.5,
      );
    }
  }
  return w.finish();
}
