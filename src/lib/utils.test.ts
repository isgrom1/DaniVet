import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone, whatsappHref } from './phone';
import { formatRut, isValidRut } from './rut';
import { formatCLP, parseCLP, parseDecimal } from './numbers';
import { addDays, ageText, birthDateFromAge, diffDays, fromLocalDateTime, isISODate, localDateOf, localTimeOf } from './dates';
import { matchesQuery, normalizeText, similarity } from './text';
import { toCSV } from './csv';
import { normalizeRecoveryKey, isPlausibleRecoveryKey, generateRecoveryKey, passphraseStrength } from './crypto';

describe('teléfonos chilenos', () => {
  it('normaliza móviles y fijos a E.164', () => {
    expect(normalizePhone('9 1234 5678')).toBe('+56912345678');
    expect(normalizePhone('+56 9 1234 5678')).toBe('+56912345678');
    expect(normalizePhone('56912345678')).toBe('+56912345678');
    expect(normalizePhone('(2) 2345 6789')).toBe('+56223456789');
    expect(normalizePhone('12345678')).toBe('+56912345678');
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('+56 9 123')).toBeNull();
    expect(formatPhone('+56912345678')).toBe('+56 9 1234 5678');
    expect(whatsappHref('+56912345678', 'Hola')).toBe('https://wa.me/56912345678?text=Hola');
  });
});

describe('RUT', () => {
  it('valida el dígito verificador (incluida K) y formatea', () => {
    expect(isValidRut('11.111.111-1')).toBe(true);
    expect(isValidRut('11111111-2')).toBe(false);
    expect(isValidRut('10.000.013-K')).toBe(true);
    expect(formatRut('111111111')).toBe('11.111.111-1');
  });
});

describe('números en formato chileno', () => {
  it('acepta coma o punto decimal y montos con puntos de miles', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('12.5')).toBe(12.5);
    expect(parseDecimal('1.234,5')).toBe(1234.5);
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(parseCLP('25.000')).toBe(25000);
    expect(parseCLP('$25000')).toBe(25000);
    expect(parseCLP('25,5')).toBeNull();
    expect(formatCLP(1234567)).toBe('$1.234.567');
  });
});

describe('fechas locales', () => {
  it('opera sobre fechas sin hora sin desfases de zona horaria', () => {
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-02-28')).toBe(true);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-10-01', '2026-10-11')).toBe(10);
    const iso = fromLocalDateTime('2026-10-11', '09:30')!;
    expect(localDateOf(iso)).toBe('2026-10-11');
    expect(localTimeOf(iso)).toBe('09:30');
  });
  it('calcula edades legibles', () => {
    expect(ageText('2022-08-11', '2026-10-11')).toBe('4 años 2 meses');
    expect(ageText('2026-09-01', '2026-10-11')).toBe('1 mes');
    expect(ageText('2026-10-01', '2026-10-11')).toBe('1 semana');
    expect(ageText(birthDateFromAge(3, 0, '2026-10-11'), '2026-10-11', true)).toBe('≈ 3 años');
  });
});

describe('búsqueda', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalizeText('  Ñuñoa  ÁRBOL ')).toBe('nunoa arbol');
    expect(matchesQuery('nunoa perez', 'Ana Pérez', 'Ñuñoa')).toBe(true);
    expect(matchesQuery('maipu', 'Ana Pérez', 'Ñuñoa')).toBe(false);
    expect(similarity('María González', 'Maria Gonzalez')).toBe(1);
    expect(similarity('María González', 'Marta Gómez')).toBeLessThan(0.7);
  });
});

describe('CSV', () => {
  it('escapa separadores y neutraliza fórmulas', () => {
    const csv = toCSV(['a', 'b'], [['=SUMA(1)', 'x;y'], ['normal', 'con "comillas"']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain("'=SUMA(1)");
    expect(csv).toContain('"x;y"');
    expect(csv).toContain('"con ""comillas"""');
  });
});

describe('clave de recuperación y contraseñas', () => {
  it('tolera espacios, minúsculas y confusiones de caracteres', () => {
    const k = generateRecoveryKey();
    expect(isPlausibleRecoveryKey(k)).toBe(true);
    expect(normalizeRecoveryKey(k.toLowerCase().replace(/-/g, ' '))).toBe(k);
    expect(isPlausibleRecoveryKey('ABC')).toBe(false);
  });
  it('exige contraseñas razonables', () => {
    expect(passphraseStrength('1234').ok).toBe(false);
    expect(passphraseStrength('password123').ok).toBe(false);
    expect(passphraseStrength('gato verde salta tres veces').ok).toBe(true);
    expect(passphraseStrength('Vet2026!Casa').ok).toBe(true);
  });
});
