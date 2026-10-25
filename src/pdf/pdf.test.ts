import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { insert, update } from '@/data/repo';
import { IntegrityError } from '@/data/errors';
import { allOf } from '@/data/store';
import { freshAccount, makePatient, makeTutor } from '@/test/helpers';
import { extractPdfText } from '@/test/pdfText';
import { todayISO } from '@/lib/dates';
import { newConsultation } from '@/features/consultations/model';
import { consultationPdf, documentPdf, joinNames, ownerInstructionsPdf, prescriptionPdf, receiptPdf, vaccineCertificatePdf } from './builders';
import { sanitize } from './engine';

async function text(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const doc = await PDFDocument.load(bytes);
  // Las líneas largas se dividen en el PDF: se compara el texto con espacios normalizados.
  return { pages: doc.getPageCount(), title: doc.getTitle(), text: extractPdfText(bytes).replace(/\s+/g, ' ') };
}

describe('documentos PDF', () => {
  it('genera una receta legible con datos del profesional, paciente, indicaciones y avisos', async () => {
    await freshAccount();
    await update('profile', 'profile', { rut: '11.111.111-1', phone: '+56 9 1234 5678' });
    const t = await makeTutor('Carolina Díaz');
    const p = await makePatient(t.id, 'Ñandú');
    const r = await insert('prescriptions', {
      patientId: p.id,
      tutorId: t.id,
      date: todayISO(),
      status: 'issued',
      issuedAt: new Date().toISOString(),
      professional: { fullName: 'Dra. Prueba', title: 'Médica Veterinaria', rut: '11.111.111-1' },
      patientSnap: { name: 'Ñandú', species: 'Perro', weightKg: 12.4, weightDate: '01-10-2026' },
      tutorSnap: { fullName: 'Carolina Díaz' },
      items: [
        {
          id: 'i1',
          medicationName: 'Medicamento A',
          concentration: '50 mg/mL',
          dose: '1,24 mL por administración',
          frequency: 'Cada 12 horas',
          duration: '7 días',
          totalQuantity: '17,36 mL',
          antimicrobial: true,
          controlled: false,
          calc: {
            weightKg: 12.4,
            weightSource: 'Último peso registrado',
            doseValue: 5,
            doseUnit: 'mg/kg',
            concentrationValue: 50,
            concentrationUnit: 'mg/mL',
            amountPerAdmin: 1.24,
            amountUnit: 'mL',
            steps: ['paso'],
            reviewedAt: new Date().toISOString(),
          },
        },
      ],
    });
    const pdf = await text(await prescriptionPdf(r.id));
    expect(pdf.pages).toBe(1);
    expect(pdf.title).toBe('Receta médico veterinaria');
    for (const s of ['Receta médico veterinaria', 'Dra. Prueba', 'RUT 11.111.111-1', 'Ñandú', 'Carolina Díaz', 'Medicamento A 50 mg/mL', '1,24 mL por administración', 'Cada 12 horas', 'Antimicrobiano', 'Sistema de Prescripción Electrónica', 'Página 1 de 1']) {
      expect(pdf.text).toContain(s);
    }
    expect(pdf.text).toMatch(/Cálculo revisado por la profesional/);
  });

  it('certificado de vacunación y comprobante interno no tributario', async () => {
    await freshAccount();
    const t = await makeTutor('Rodrigo Paz');
    const p = await makePatient(t.id, 'Kira');
    await insert('vaccinations', { patientId: p.id, date: todayISO(), vaccineName: 'Antirrábica', lotNumber: 'L-123', productExpiry: '2027-05-01', professionalName: 'Dra. Prueba', status: 'applied', nextDueDate: '2027-10-01' });
    const cert = await text(await vaccineCertificatePdf(p.id));
    expect(cert.text).toContain('Certificado de vacunación');
    expect(cert.text).toContain('Antirrábica');
    expect(cert.text).toContain('L-123');
    const c = await insert('charges', { tutorId: t.id, date: todayISO(), items: [{ id: 'x', description: 'Consulta a domicilio', category: 'fee', qty: 1, unitPriceCLP: 30000, discountCLP: 0 }], discountCLP: 0, voided: false });
    const rec = await text(await receiptPdf(c.id));
    expect(rec.text).toContain('NO VÁLIDO COMO BOLETA NI FACTURA');
    expect(rec.text).toContain('$30.000');
  });

  it('reemplaza caracteres que la fuente estándar no admite', () => {
    expect(sanitize('≥ 5 → ok ✓ á ñ ü ° µ')).toBe('>= 5 -> ok v á ñ ü ° µ');
    expect(sanitize('emoji 🐶')).toBe('emoji ?');
  });
});

const CUIDADOS = [
  '## 1. Tratamiento de diarrea líquida',
  '• Cambio de alimento a **Royal Canin Gastrointestinal Kitten**. Mantener la dieta durante **21 días**.',
  '• Realizar la transición de alimento en 4 días:',
  'Día | Alimento antiguo | Alimento nuevo',
  'Día 1 | 3/4 | 1/4',
  'Día 2 | 1/2 | 1/2',
  'Día 3 | 1/4 | 3/4',
  'Día 4 | — | 100%',
  '• Ofrecer **AL DÍA 50 gramos** de pellet.',
].join('\n');

async function kittens(homeCare = CUIDADOS) {
  await freshAccount();
  const cat = allOf('species').find((s) => s.builtin === 'cat')!.id;
  const t = await makeTutor('Tutora de prueba');
  const [pipu, larry, mora] = [await makePatient(t.id, 'Pipu'), await makePatient(t.id, 'Larry'), await makePatient(t.id, 'Mora')];
  for (const p of [pipu, larry, mora]) await update('patients', p.id, { speciesId: cat });
  // Larry tiene un peso de otro día; Mora no tiene peso registrado.
  await insert('weights', { patientId: larry.id, date: '2026-10-20', weightKg: 1.58, source: 'manual' });
  const base = newConsultation({ patientId: pipu.id, tutorId: t.id, professionalName: 'Dra. Prueba', startedAt: '2026-10-25T14:00:00.000Z' });
  const c = await insert('consultations', {
    ...base,
    status: 'final',
    finalizedAt: base.startedAt,
    reason: { main: 'Diarrea líquida' },
    exam: { ...base.exam, weightKg: 1.21 },
    plan: { homeCare, ownerRecommendations: '**Opciones de productos:**\n- Interna: Mebermic, Drontal.' },
  });
  return { t, pipu, larry, mora, c };
}

describe('indicaciones al tutor', () => {
  it('muestra el peso del paciente y dibuja subtítulos, negritas, viñetas y tablas sin marcas', async () => {
    const { c } = await kittens();
    const pdf = await text(await ownerInstructionsPdf(c.id));
    for (const s of ['Indicaciones posteriores a la atención', 'Pipu ·', 'Peso 1,21 kg', 'Motivo Diarrea líquida', '1. Tratamiento de diarrea líquida', 'Royal Canin Gastrointestinal Kitten', 'Día Alimento antiguo Alimento nuevo', 'Día 1 3/4 1/4', 'Día 4 — 100%', 'AL DÍA 50 gramos', 'Opciones de productos:', 'Interna: Mebermic, Drontal.']) {
      expect(pdf.text).toContain(s);
    }
    expect(pdf.text).not.toMatch(/\*\*|##|\|/);
    // El informe clínico muestra el mismo texto sin marcas de formato.
    const report = await text(await consultationPdf(c.id));
    expect(report.text).toContain('Royal Canin Gastrointestinal Kitten');
    expect(report.text).not.toMatch(/\*\*|##/);
  });

  it('incluye a otros pacientes del mismo tutor en un solo PDF, con su peso', async () => {
    const { c, larry, mora } = await kittens();
    const pdf = await text(await ownerInstructionsPdf(c.id, [larry.id, mora.id, c.patientId]));
    for (const s of ['Pipu, Larry y Mora ·', 'Paciente Peso', 'Pipu 1,21 kg', 'Larry 1,58 kg (20-10-2026)', 'Mora Sin registro', 'Tutor/a Tutora de prueba']) {
      expect(pdf.text).toContain(s);
    }
  });

  it('el documento de indicaciones puede incluir a otros pacientes del mismo tutor', async () => {
    const { t, pipu, larry } = await kittens();
    const d = await insert('documents', {
      kind: 'indications',
      patientId: pipu.id,
      otherPatientIds: [larry.id],
      tutorId: t.id,
      title: 'Indicaciones posteriores a la atención',
      date: '2026-10-25',
      status: 'issued',
      fields: { instructions: CUIDADOS, body: 'Indicaciones para {paciente}.' },
    });
    const pdf = await text(await documentPdf(d.id));
    for (const s of ['Paciente Especie / raza Peso', 'Pipu Gato', 'Larry Gato 1,58 kg (20-10-2026)', 'Día 2 1/2 1/2', 'Indicaciones para Pipu y Larry.']) {
      expect(pdf.text).toContain(s);
    }
    expect(pdf.text).not.toMatch(/\*\*|##|\|/);
    await expect(insert('documents', { kind: 'indications', patientId: pipu.id, otherPatientIds: ['no-existe'], title: 'X', date: '2026-10-25', status: 'draft', fields: {} })).rejects.toBeInstanceOf(IntegrityError);
  });

  it('una tabla ancha reparte el espacio sin cortar palabras', async () => {
    const wide = [
      'Producto | Tipo | Frecuencia | Observaciones',
      `Revolution Plus | Desparasitación interna y externa | Cada 15 días, por 4 dosis | ${'Elegir la presentación según el peso del paciente y repetir. '.repeat(3)}`,
      'Bravecto | Externa | Cada 3 meses | —',
    ].join('\n');
    const { c } = await kittens(wide);
    const pdf = await text(await ownerInstructionsPdf(c.id));
    for (const s of ['Producto Tipo Frecuencia Observaciones', 'Desparasitación', 'Revolution Plus', 'Bravecto Externa Cada 3 meses']) expect(pdf.text).toContain(s);
  });

  it('une los nombres como en español', () => {
    expect(joinNames(['Pipu'])).toBe('Pipu');
    expect(joinNames(['Pipu', 'Larry'])).toBe('Pipu y Larry');
    expect(joinNames(['Pipu', 'Larry', 'Isis'])).toBe('Pipu, Larry e Isis');
    expect(joinNames(['Pipu', 'Hilda'])).toBe('Pipu e Hilda');
    expect(joinNames(['Pipu', 'Hielo'])).toBe('Pipu y Hielo');
    expect(joinNames(['Pipu', 'Ian'])).toBe('Pipu y Ian');
  });
});
