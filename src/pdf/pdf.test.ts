import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { insert, update } from '@/data/repo';
import { freshAccount, makePatient, makeTutor } from '@/test/helpers';
import { extractPdfText } from '@/test/pdfText';
import { todayISO } from '@/lib/dates';
import { prescriptionPdf, receiptPdf, vaccineCertificatePdf } from './builders';
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
