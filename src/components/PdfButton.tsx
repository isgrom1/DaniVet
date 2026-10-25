import { useState, type ReactNode } from 'react';
import { Download, ExternalLink, FileText, Share2 } from 'lucide-react';
import { Button, type ButtonProps } from './Button';
import { Sheet, toast } from './overlay';
import { friendlyError } from '@/data/errors';
import { downloadFile, openFile, shareFile } from '@/lib/share';
import { canShareFiles, isIOS, isStandalone } from '@/lib/platform';

/**
 * Genera un PDF y ofrece compartirlo (hoja nativa de iOS), abrirlo o descargarlo.
 * Se genera primero y luego se comparte con un segundo toque: Safari exige que compartir sea una acción directa.
 * `ask`: hoja previa con opciones del documento (por ejemplo, qué pacientes incluir) antes de generarlo.
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
  ask,
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
  ask?: { title: string; body: ReactNode; confirmLabel: string };
}) {
  const [busy, setBusy] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [asking, setAsking] = useState(false);
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
  const open = () => {
    if (blob && !openFile(blob)) toast.info('No se pudo abrir una pestaña nueva. Usa “Descargar” o “Compartir”.');
  };
  // En la app instalada en iPhone, abrir una pestaña saca a la usuaria de la app: se usa la hoja de compartir (incluye Imprimir).
  const shareable = canShareFiles();
  const showOpen = !(shareable && isIOS() && isStandalone());
  return (
    <>
      <Button variant={variant} size={size} block={block} loading={busy} onClick={ask ? () => setAsking(true) : generate} icon={icon ?? <FileText className="size-4" />}>
        {label}
      </Button>
      {ask && asking && (
        <Sheet
          open
          onClose={() => setAsking(false)}
          title={ask.title}
          footer={
            <Button
              block
              size="lg"
              icon={<FileText className="size-5" />}
              onClick={() => {
                setAsking(false);
                void generate();
              }}
            >
              {ask.confirmLabel}
            </Button>
          }
        >
          {ask.body}
        </Sheet>
      )}
      {blob && (
        <Sheet open onClose={() => setBlob(null)} title="Documento listo">
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-[15px] text-ink-700">
              <FileText className="size-5 text-brand-700" /> {fileName}
            </p>
            {note && <div className="text-sm text-ink-600">{note}</div>}
            <div className="grid gap-2">
              {shareable && (
                <Button block size="lg" icon={<Share2 className="size-5" />} onClick={share}>
                  Compartir o guardar en Archivos
                </Button>
              )}
              {showOpen && (
                <Button block variant="secondary" icon={<ExternalLink className="size-5" />} onClick={open}>
                  Abrir / imprimir
                </Button>
              )}
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
