import { useRef, useState } from 'react';
import { Camera, Cat, Dog, FileText, ImagePlus, PawPrint, Share2, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/Button';
import { Sheet, confirmDialog, toast } from '@/components/overlay';
import { Spinner } from '@/components/Card';
import { useTables } from '@/data/hooks';
import type { Attachment, Patient } from '@/data/schema';
import { friendlyError } from '@/data/errors';
import { formatDate } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { downloadFile, openFile, shareFile } from '@/lib/share';
import { deleteAttachment, formatBytes, readBlob, saveAttachment, useBlobUrl, type SaveAttachmentInput } from './attachments';

export function PatientAvatar({ patient, size = 44 }: { patient: Patient; size?: number }) {
  const tables = useTables();
  const att = patient.photoAttachmentId ? tables.attachments.get(patient.photoAttachmentId) : undefined;
  const { url } = useBlobUrl(att?.thumbBlobId ?? att?.blobId);
  const builtin = tables.species.get(patient.speciesId)?.builtin;
  const Icon = builtin === 'dog' ? Dog : builtin === 'cat' ? Cat : PawPrint;
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100')}
      style={{ width: size, height: size }}
    >
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <Icon style={{ width: size * 0.5, height: size * 0.5 }} aria-hidden />}
    </span>
  );
}

/** Botones para tomar una foto o elegir archivos (cámara, fototeca o Archivos de iOS). */
export function AttachmentPicker({
  base,
  onSaved,
  accept = 'image/*,application/pdf',
  label = 'Adjuntar',
  photoOnly,
  kind,
}: {
  base: Omit<SaveAttachmentInput, 'file' | 'kind'>;
  onSaved?: (a: Attachment) => void;
  accept?: string;
  label?: string;
  photoOnly?: boolean;
  kind?: Attachment['kind'];
}) {
  const cam = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        const k = kind ?? (file.type.startsWith('image/') ? 'photo' : 'document');
        const a = await saveAttachment({ ...base, file, kind: k });
        onSaved?.(a);
      }
      toast.success(list.length > 1 ? `${list.length} archivos guardados` : 'Archivo guardado');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
      if (cam.current) cam.current.value = '';
      if (files.current) files.current.value = '';
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handle(e.target.files)} />
      <input ref={files} type="file" accept={photoOnly ? 'image/*' : accept} multiple={!photoOnly} className="hidden" onChange={(e) => void handle(e.target.files)} data-testid="attachment-input" />
      <Button variant="secondary" size="sm" icon={<Camera className="size-4" />} onClick={() => cam.current?.click()} disabled={busy}>
        Tomar foto
      </Button>
      <Button variant="secondary" size="sm" icon={busy ? <Spinner className="size-4" /> : <ImagePlus className="size-4" />} onClick={() => files.current?.click()} disabled={busy}>
        {photoOnly ? 'Elegir foto' : label}
      </Button>
    </div>
  );
}

function Thumb({ a, onOpen }: { a: Attachment; onOpen: () => void }) {
  const isImage = a.mimeType.startsWith('image/');
  const { url } = useBlobUrl(isImage ? (a.thumbBlobId ?? a.blobId) : undefined);
  return (
    <button type="button" onClick={onOpen} className="group relative aspect-square overflow-hidden rounded-xl border border-sand-200 bg-sand-50 text-left">
      {isImage ? (
        url ? (
          <img src={url} alt={a.caption ?? a.fileName} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center">
            <Spinner />
          </span>
        )
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-ink-600">
          <FileText className="size-7 text-brand-700" />
          <span className="line-clamp-2 text-[11px] font-medium">{a.fileName}</span>
        </span>
      )}
      {(a.caption || a.takenAt) && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-ink-900/60 px-1.5 py-0.5 text-[10px] text-white">{a.caption || formatDate(a.takenAt)}</span>
      )}
    </button>
  );
}

export function AttachmentGrid({ items, emptyText = 'Sin archivos adjuntos.' }: { items: Attachment[]; emptyText?: string }) {
  const [open, setOpen] = useState<Attachment | null>(null);
  if (!items.length) return <p className="px-1 text-sm text-ink-500">{emptyText}</p>;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((a) => (
            <Thumb key={a.id} a={a} onOpen={() => setOpen(a)} />
          ))}
      </div>
      {open && <AttachmentViewer a={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function AttachmentViewer({ a, onClose }: { a: Attachment; onClose: () => void }) {
  const isImage = a.mimeType.startsWith('image/');
  const { url, error } = useBlobUrl(isImage ? a.blobId : undefined);
  const share = async () => {
    try {
      const blob = await readBlob(a.blobId, a.mimeType);
      const res = await shareFile(blob, a.fileName);
      if (res === 'unsupported' && !openFile(blob)) downloadFile(blob, a.fileName);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  const open = async () => {
    try {
      const blob = await readBlob(a.blobId, a.mimeType);
      if (!openFile(blob)) downloadFile(blob, a.fileName);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  const del = async () => {
    const ok = await confirmDialog({ title: 'Eliminar archivo', message: 'El archivo se eliminará de este dispositivo. Esta acción no se puede deshacer.', confirmLabel: 'Eliminar', tone: 'danger' });
    if (!ok) return;
    try {
      await deleteAttachment(a.id);
      toast.success('Archivo eliminado');
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={a.caption || a.fileName}
      size="full"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Trash2 className="size-4 text-red-700" />} onClick={del} aria-label="Eliminar archivo" />
          <Button variant="secondary" block icon={<ExternalLink className="size-4" />} onClick={open}>
            Abrir
          </Button>
          <Button block icon={<Share2 className="size-4" />} onClick={share}>
            Compartir
          </Button>
        </div>
      }
    >
      {isImage ? (
        url ? (
          <img src={url} alt={a.caption ?? a.fileName} className="mx-auto max-h-[65dvh] rounded-xl object-contain" />
        ) : error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )
      ) : (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-ink-600">
          <FileText className="size-12 text-brand-700" />
          <p className="font-medium">{a.fileName}</p>
          <p className="text-sm">Toca “Abrir” para verlo o “Compartir” para guardarlo en Archivos o enviarlo.</p>
        </div>
      )}
      <p className="mt-3 text-center text-xs text-ink-500">
        {formatBytes(a.size)} · agregado el {formatDate(a.createdAt)}
      </p>
    </Sheet>
  );
}
