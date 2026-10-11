/**
 * Teléfonos: se guardan en formato E.164 (+56912345678).
 * Reglas para Chile: 9 dígitos que empiezan con 9 = móvil; 9 dígitos con otro inicio = fijo con código de área.
 */
export function normalizePhone(input: string | undefined | null): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (hasPlus) {
    if (digits.length < 8 || digits.length > 15) return null;
    if (digits.startsWith('56') && digits.length !== 11) return null;
    return `+${digits}`;
  }
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('56') && digits.length === 11) return `+${digits}`;
  if (digits.length === 9) return `+56${digits}`;
  if (digits.length === 8) return `+569${digits}`; // formato antiguo de móviles sin el 9 inicial
  return null;
}

export function isValidPhone(input: string | undefined | null): boolean {
  return normalizePhone(input) !== null;
}

export function formatPhone(e164: string | undefined | null): string {
  if (!e164) return '';
  if (/^\+569\d{8}$/.test(e164)) return `+56 9 ${e164.slice(4, 8)} ${e164.slice(8)}`;
  if (/^\+562\d{8}$/.test(e164)) return `+56 2 ${e164.slice(4, 8)} ${e164.slice(8)}`;
  if (/^\+56\d{9}$/.test(e164)) return `+56 ${e164.slice(3, 5)} ${e164.slice(5, 8)} ${e164.slice(8)}`;
  return e164;
}

export function telHref(e164: string): string {
  return `tel:${e164}`;
}

/** Enlace explícito a WhatsApp (abre la app; el envío lo realiza la usuaria). */
export function whatsappHref(e164: string, text?: string): string {
  const n = e164.replace(/\D/g, '');
  return text ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : `https://wa.me/${n}`;
}

export function phoneDigits(e164: string | undefined | null): string {
  return (e164 ?? '').replace(/\D/g, '');
}
