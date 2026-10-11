import { useState, type ReactNode } from 'react';
import { Download, ExternalLink, FileText, Share2 } from 'lucide-react';
import { Button, type ButtonProps } from './Button';
import { Sheet, toast } from './overlay';
import { friendlyError } from '@/data/errors';
import { downloadFile, openFile, shareFile } from '@/lib/share';
import { canShareFiles } from '@/lib/platform';

/**
 * Genera un PDF y ofrece compartirlo (hoja nativa de iOS), abrirlo o descargarlo.
 * Se genera primero y luego se comparte con un segundo toque: Safari exige que compartir sea una acción directa.
 */
export function PdfButton({
  make,
  fileName,
  label = 'Generar PDF',
  variant = 'secondary',
  size = 'md',
  block,
  icon,
  note,
  onGenerated,
}: {
  make: () => Promise<Blob>;
  fileName: string;
  label?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  block?: boolean;
  icon?: ReactNode;
  note?: ReactNode;
  onGenerated?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const generate = async () => {
    setBusy(true);
    try {
      const b = await make();
      setBlob(b);
      onGenerated?.();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    if (!blob) return;
    try {
      const r = await shareFile(blob, fileName);
      if (r === 'unsupported') downloadFile(blob, fileName);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  return (
    <>
      <Button variant={variant} size={size} block={block} loading={busy} onClick={generate} icon={icon ?? <FileText className="size-4" />}>
        {label}
      </Button>
      {blob && (
        <Sheet open onClose={() => setBlob(null)} title="Documento listo">
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-[15px] text-ink-700">
              <FileText className="size-5 text-brand-700" /> {fileName}
            </p>
            {note && <div className="text-sm text-ink-600">{note}</div>}
            <div className="grid gap-2">
              {canShareFiles() && (
                <Button block size="lg" icon={<Share2 className="size-5" />} onClick={share}>
                  Compartir o guardar en Archivos
                </Button>
              )}
              <Button block variant="secondary" icon={<ExternalLink className="size-5" />} onClick={() => openFile(blob)}>
                Abrir / imprimir
              </Button>
              <Button block variant="secondary" icon={<Download className="size-5" />} onClick={() => downloadFile(blob, fileName)}>
                Descargar
              </Button>
            </div>
            <p className="text-xs text-ink-500">El PDF se genera en el teléfono. Compártelo solo con quien corresponda: contiene datos personales.</p>
          </div>
        </Sheet>
      )}
    </>
  );
}
