import { Share, SquarePlus, Smartphone } from 'lucide-react';
import { Notice } from '@/components/Card';
import { DEFAULT_APP_NAME } from '@/lib/platform';

export function InstallGuide() {
  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Smartphone className="size-5 text-brand-700" />
        <h2 className="text-[17px] font-semibold">Instálala en tu pantalla de inicio</h2>
      </div>
      <ol className="space-y-3 text-[15px] leading-relaxed text-ink-700">
        <li className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">1</span>
          <span>
            En Safari, toca el botón <strong>Compartir</strong> <Share className="inline size-4 align-text-bottom" aria-label="Compartir" /> (si no lo
            ves, toca el menú <strong>···</strong> y luego Compartir).
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">2</span>
          <span>
            Elige <strong>Agregar a inicio</strong> <SquarePlus className="inline size-4 align-text-bottom" aria-hidden /> y luego <strong>Agregar</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">3</span>
          <span>
            Abre <strong>{DEFAULT_APP_NAME}</strong> desde el ícono nuevo de tu pantalla de inicio y crea tu cuenta <strong>desde allí</strong>.
          </span>
        </li>
      </ol>
      <Notice tone="info">
        En iPhone, la app instalada y Safari pueden guardar sus datos por separado. Usa siempre el ícono de la pantalla de inicio para trabajar.
      </Notice>
    </div>
  );
}
