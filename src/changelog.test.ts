import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CHANGELOG, compareVersions, releasesSince } from './changelog';
import { deviceInfo, feedbackMessage, mailHref, whatsappShareHref } from './features/more/feedback';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

describe('novedades por versión', () => {
  it('cada versión publicada tiene su entrada de novedades', () => {
    expect(CHANGELOG[0].version).toBe(pkg.version);
    const sorted = [...CHANGELOG].sort((a, b) => compareVersions(b.version, a.version));
    expect(CHANGELOG.map((r) => r.version)).toEqual(sorted.map((r) => r.version));
    expect(CHANGELOG.every((r) => r.items.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.date))).toBe(true);
  });

  it('compara versiones numéricamente', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBeGreaterThan(0);
    expect(compareVersions('1.1', '1.1.0')).toBe(0);
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
  });

  it('muestra solo lo publicado después de la versión vista', () => {
    const list = [
      { version: '1.2.0', date: '2026-11-01', items: ['c'] },
      { version: '1.1.0', date: '2026-10-11', items: ['b'] },
      { version: '1.0.0', date: '2026-10-11', items: ['a'] },
    ];
    expect(releasesSince('1.0.0', '1.2.0', list).map((r) => r.version)).toEqual(['1.2.0', '1.1.0']);
    expect(releasesSince('1.1.0', '1.1.0', list)).toEqual([]);
    expect(releasesSince('1.0.0', '1.1.0', list).map((r) => r.version)).toEqual(['1.1.0']);
    expect(releasesSince('dev', '1.1.0', list)).toEqual([]);
  });
});

describe('sugerencias', () => {
  it('arma un mensaje con el texto, la versión y el equipo, sin otros datos', () => {
    const msg = feedbackMessage('problem', '  La receta no se comparte  ', 'iPhone · app instalada');
    expect(msg).toMatch(/^\[.+\] Problema\n\nLa receta no se comparte\n\n— Versión /);
    expect(msg).toContain('iPhone · app instalada');
    expect(whatsappShareHref(msg)).toBe(`https://wa.me/?text=${encodeURIComponent(msg)}`);
    expect(mailHref('Asunto', 'a&b')).toBe('mailto:?subject=Asunto&body=a%26b');
  });

  it('describe el equipo sin datos personales', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
    expect(deviceInfo(ua, true)).toBe('iPhone · app instalada');
    expect(deviceInfo('Mozilla/5.0 (X11; Linux x86_64)', false)).toBe('computador · navegador');
  });
});
