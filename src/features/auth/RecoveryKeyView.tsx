import { useState } from 'react';
import { Copy, Download, KeyRound } from 'lucide-react';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/form';
import { Notice } from '@/components/Card';
import { toast } from '@/components/overlay';
import { downloadFile, shareFile } from '@/lib/share';

export function RecoveryKeyView({ recoveryKey, onDone, doneLabel = 'Continuar' }: { recoveryKey: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const fileText = `Clave de recuperación de VetCasa\n\n${recoveryKey}\n\nGuárdala en un lugar seguro y separado de tu teléfono (papel en un lugar seguro o un gestor de contraseñas).\nPermite recuperar el acceso si olvidas tu contraseña y abrir tus respaldos.\nNo la compartas con nadie.\n`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      toast.success('Clave copiada. Pégala en tu gestor de contraseñas.');
    } catch {
      toast.error('No se pudo copiar. Anótala manualmente.');
    }
  };
  const save = async () => {
    const blob = new Blob([fileText], { type: 'text/plain' });
    const res = await shareFile(blob, 'clave-recuperacion-vetcasa.txt', 'Clave de recuperación VetCasa').catch(() => 'unsupported' as const);
    if (res === 'unsupported') downloadFile(blob, 'clave-recuperacion-vetcasa.txt');
  };

  return (
    <div className="space-y-4">
      <Notice tone="warning" icon={<KeyRound className="size-5" />} title="Esta clave se muestra una sola vez">
        Si olvidas tu contraseña, esta clave es la única forma de recuperar tus datos. Sin contraseña ni clave de recuperación, la información
        cifrada no puede recuperarse (nadie más tiene acceso, ni siquiera quien desarrolló la app).
      </Notice>
      <div className="card p-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Clave de recuperación</p>
        <p data-testid="recovery-key" className="mt-2 select-all break-all font-mono text-[19px] font-semibold leading-relaxed tracking-wider text-ink-900">
          {recoveryKey}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<Copy className="size-4" />} onClick={copy}>
          Copiar
        </Button>
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={save}>
          Guardar archivo
        </Button>
      </div>
      <Checkbox checked={saved} onChange={setSaved} label="Guardé la clave de recuperación en un lugar seguro, fuera de este teléfono." />
      <Button block size="lg" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
