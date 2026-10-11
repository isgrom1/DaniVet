import type { Tables } from '@/data/store';
import type { Tutor } from '@/data/schema';
import { normalizePhone } from '@/lib/phone';
import { cleanRut } from '@/lib/rut';
import { normalizeText, similarity } from '@/lib/text';

export interface DuplicateCandidate {
  tutor: Tutor;
  score: number;
  reasons: string[];
}

/**
 * Busca tutores que podrían ser la misma persona. Nunca fusiona automáticamente:
 * solo sugiere coincidencias para que la profesional las revise.
 */
export function findTutorDuplicates(
  t: Tables,
  input: { fullName?: string; phone?: string; phoneAlt?: string; email?: string; rut?: string },
  excludeId?: string,
): DuplicateCandidate[] {
  const phones = [normalizePhone(input.phone), normalizePhone(input.phoneAlt)].filter(Boolean) as string[];
  const email = input.email?.trim().toLowerCase();
  const rut = input.rut ? cleanRut(input.rut) : '';
  const name = normalizeText(input.fullName);
  const out: DuplicateCandidate[] = [];
  for (const tutor of t.tutors.values()) {
    if (tutor.id === excludeId || tutor.mergedIntoId || tutor.anonymizedAt) continue;
    const reasons: string[] = [];
    let score = 0;
    const tPhones = [tutor.phone, tutor.phoneAlt].filter(Boolean) as string[];
    if (phones.length && phones.some((p) => tPhones.includes(p))) {
      reasons.push('Mismo teléfono');
      score += 0.6;
    }
    if (email && tutor.email && tutor.email.toLowerCase() === email) {
      reasons.push('Mismo correo');
      score += 0.5;
    }
    if (rut.length > 3 && tutor.rut && cleanRut(tutor.rut) === rut) {
      reasons.push('Mismo RUT');
      score += 0.8;
    }
    if (name.length >= 3) {
      const sim = similarity(name, tutor.fullName);
      if (sim >= 0.88) {
        reasons.push('Nombre muy similar');
        score += 0.45;
      } else if (sim >= 0.72) {
        reasons.push('Nombre parecido');
        score += 0.2;
      }
    }
    if (score >= 0.4) out.push({ tutor, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
