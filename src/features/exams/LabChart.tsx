import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatDate, parseLocalDate } from '@/lib/dates';
import { formatDecimal } from '@/lib/numbers';

/**
 * Evolución de un valor de laboratorio en el tiempo: una línea (un solo valor, sin leyenda de series), la banda
 * del rango de referencia que informó el laboratorio en cada examen y los valores fuera de rango marcados con
 * forma (▲ alto, ▼ bajo) además del color. Tocar o recorrer con las flechas muestra el detalle de cada punto.
 * Colores validados (contraste y daltonismo): serie #00876c, fuera de rango #b45309, sobre fondo blanco.
 */

export interface ChartPoint {
  date: string;
  value: number;
  low?: number;
  high?: number;
  flag?: 'low' | 'high' | 'normal';
  lab?: string;
}

const SERIES = '#00876c';
const OUT = '#b45309';
const GRID = '#efe9e0';
const AXIS_TEXT = '#69736f';
const INK = '#1f2a28';
const W = 340;
const H = 210;
const M = { left: 44, right: 18, top: 16, bottom: 30 };

function niceTicks(min: number, max: number, count = 4) {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + (step / mag === 2.5 ? 1 : 0));
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(decimals + 2)));
  return { ticks, min: start, max: end, decimals };
}

export function LabChart({ points, unit, digits, label }: { points: ChartPoint[]; unit: string; digits: number; label: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const descId = useId();
  if (points.length < 2) return null;
  const times = points.map((p) => parseLocalDate(p.date).getTime());
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const bounds = points.flatMap((p) => [p.value, p.low, p.high]).filter((v): v is number => v !== undefined);
  const lo = Math.min(...bounds);
  const hi = Math.max(...bounds);
  const pad = (hi - lo) * 0.08;
  const y = niceTicks(lo - pad, hi + pad);
  const px = (t: number) => M.left + ((t - t0) / (t1 - t0)) * (W - M.left - M.right);
  const py = (v: number) => M.top + (1 - (v - y.min) / (y.max - y.min)) * (H - M.top - M.bottom);
  // Escala de tiempo real; si todos los exámenes son del mismo día, se reparten en orden.
  const xs = t1 === t0 ? points.map((_, i) => M.left + (i / (points.length - 1)) * (W - M.left - M.right)) : times.map(px);
  // Banda escalonada: cada examen con su propio rango, de punto medio a punto medio.
  const band = points.map((p, i) => {
    if (p.low === undefined && p.high === undefined) return null;
    const x0 = i === 0 ? xs[i] : (xs[i - 1] + xs[i]) / 2;
    const x1 = i === points.length - 1 ? xs[i] : (xs[i] + xs[i + 1]) / 2;
    const top = py(Math.min(p.high ?? y.max, y.max));
    const bottom = py(Math.max(p.low ?? y.min, y.min));
    return { x0, x1, top, bottom };
  });
  const hasBand = band.some(Boolean);
  const hasOut = points.some((p) => p.flag === 'low' || p.flag === 'high');
  const last = points.length - 1;
  const fmt = (v: number) => formatDecimal(v, digits);
  const nearest = (clientX: number, rect: DOMRect) => {
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    xs.forEach((cx, i) => {
      if (Math.abs(cx - x) < Math.abs(xs[best] - x)) best = i;
    });
    return best;
  };
  const onPointer = (e: PointerEvent<SVGRectElement>) => setSel(nearest(e.clientX, (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') setSel((s) => Math.min(last, (s ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setSel((s) => Math.max(0, (s ?? points.length) - 1));
    else if (e.key === 'Escape') setSel(null);
    else return;
    e.preventDefault();
  };
  const p = sel !== null ? points[sel] : null;
  const status = (q: ChartPoint) => (q.flag === 'high' ? 'Alto' : q.flag === 'low' ? 'Bajo' : q.flag === 'normal' ? 'Dentro del rango' : 'Sin rango informado');
  const lastP = points[last];
  const summary = `${label}: ${points.length} valores entre el ${formatDate(points[0].date)} y el ${formatDate(lastP.date)}. Último: ${fmt(lastP.value)} ${unit} (${status(lastP).toLowerCase()}).`;
  return (
    <figure className="m-0 space-y-2">
      <div
        className="relative rounded-xl bg-white outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
        tabIndex={0}
        role="group"
        aria-label={`Gráfico de ${label}. Usa las flechas para recorrer los valores.`}
        aria-describedby={descId}
        onKeyDown={onKey}
        onBlur={() => setSel(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full select-none" role="img" aria-label={summary}>
          {y.ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={py(t)} y2={py(t)} stroke={GRID} strokeWidth={1} />
              <text x={M.left - 6} y={py(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatDecimal(t, y.decimals)}
              </text>
            </g>
          ))}
          {band.map((b, i) => (b ? <rect key={i} x={b.x0} width={Math.max(b.x1 - b.x0, 2)} y={b.top} height={Math.max(b.bottom - b.top, 0)} fill={SERIES} fillOpacity={0.1} /> : null))}
          <text x={M.left} y={H - 8} fontSize={11} fill={AXIS_TEXT}>
            {formatDate(points[0].date)}
          </text>
          <text x={W - M.right} y={H - 8} fontSize={11} fill={AXIS_TEXT} textAnchor="end">
            {formatDate(lastP.date)}
          </text>
          {p && sel !== null && <line x1={xs[sel]} x2={xs[sel]} y1={M.top} y2={H - M.bottom} stroke="#8b9390" strokeWidth={1} />}
          <polyline points={points.map((q, i) => `${xs[i]},${py(q.value)}`).join(' ')} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((q, i) => {
            const cx = xs[i];
            const cy = py(q.value);
            const out = q.flag === 'high' || q.flag === 'low';
            const r = sel === i ? 6 : 4.5;
            if (!out) return <circle key={i} cx={cx} cy={cy} r={r} fill={SERIES} stroke="#fff" strokeWidth={2} />;
            const s = r + 1.5;
            const d = q.flag === 'high' ? `M${cx},${cy - s} L${cx + s},${cy + s * 0.8} L${cx - s},${cy + s * 0.8} Z` : `M${cx},${cy + s} L${cx + s},${cy - s * 0.8} L${cx - s},${cy - s * 0.8} Z`;
            return <path key={i} d={d} fill={OUT} stroke="#fff" strokeWidth={2} strokeLinejoin="round" />;
          })}
          {sel === null && (
            <text x={xs[last]} y={py(lastP.value)} dy={py(lastP.value) < M.top + 18 ? 20 : -12} textAnchor="end" fontSize={12} fontWeight={600} fill={INK}>
              {fmt(lastP.value)}
            </text>
          )}
          <rect
            x={M.left - 12}
            y={0}
            width={W - M.left - M.right + 24}
            height={H}
            fill="transparent"
            onPointerDown={onPointer}
            onPointerMove={(e) => e.pointerType !== 'touch' || e.buttons ? onPointer(e) : undefined}
            onPointerLeave={(e) => (e.pointerType === 'mouse' ? setSel(null) : undefined)}
            style={{ touchAction: 'pan-y' }}
          />
        </svg>
        {p && sel !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-44 rounded-lg bg-ink-900/95 px-2.5 py-1.5 text-white shadow-lg"
            style={{ left: `clamp(0px, calc(${(xs[sel] / W) * 100}% - 5.5rem), calc(100% - 11rem))` }}
          >
            <p className="text-[15px] font-bold tabular-nums">
              {fmt(p.value)} <span className="text-[12px] font-medium text-white/80">{unit}</span>
            </p>
            <p className="text-[12px] text-white/85">{formatDate(p.date)}</p>
            <p className="text-[12px] text-white/85">
              {p.flag === 'high' ? '▲ ' : p.flag === 'low' ? '▼ ' : ''}
              {status(p)}
              {p.low !== undefined || p.high !== undefined ? ` (${p.low !== undefined ? fmt(p.low) : '…'}–${p.high !== undefined ? fmt(p.high) : '…'})` : ''}
            </p>
            {p.lab && <p className="truncate text-[12px] text-white/70">{p.lab}</p>}
          </div>
        )}
        <p id={descId} className="sr-only" aria-live="polite">
          {p ? `${formatDate(p.date)}: ${fmt(p.value)} ${unit}, ${status(p)}` : ''}
        </p>
      </div>
      {(hasBand || hasOut) && (
        <figcaption className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12px] text-ink-600">
          {hasBand && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-4 rounded-sm" style={{ background: `${SERIES}1a`, boxShadow: `inset 0 0 0 1px ${SERIES}33` }} aria-hidden />
              Rango de referencia del informe
            </span>
          )}
          {hasOut && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden>
                <path d="M5,1 L10,10 L0,10 Z" fill={OUT} />
                <path d="M17,11 L22,2 L12,2 Z" fill={OUT} />
              </svg>
              Fuera del rango (alto / bajo)
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
