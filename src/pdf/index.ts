/** Generación de PDF bajo demanda: la biblioteca se carga solo al generar un documento. */
const load = () => import('./builders');

export const pdf = {
  prescription: async (id: string) => (await load()).prescriptionPdf(id),
  consultation: async (id: string) => (await load()).consultationPdf(id),
  ownerInstructions: async (id: string, otherPatientIds: string[] = []) => (await load()).ownerInstructionsPdf(id, otherPatientIds),
  vaccineCertificate: async (patientId: string) => (await load()).vaccineCertificatePdf(patientId),
  document: async (id: string) => (await load()).documentPdf(id),
  budget: async (id: string) => (await load()).budgetPdf(id),
  receipt: async (chargeId: string) => (await load()).receiptPdf(chargeId),
  patientHistory: async (patientId: string) => (await load()).patientHistoryPdf(patientId),
};
