import { History } from 'lucide-react';
import { formatDateTime } from '@/lib/dates';
import { Button } from './Button';

export function DraftBanner({ at, onRestore, onDiscard }: { at: string; onRestore: () => void; onDiscard: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
      <div className="flex gap-2">
        <History className="mt-0.5 size-5 shrink-0" />
        <p>
          Hay cambios sin guardar de este formulario ({formatDateTime(at)}). ¿Quieres recuperarlos?
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onDiscard}>
          Descartar
        </Button>
        <Button size="sm" onClick={onRestore}>
          Recuperar cambios
        </Button>
      </div>
    </div>
  );
}
