import { UserError } from '@/data/errors';
import { useEffect, useState } from 'react';
import { openBytes, sealBytes } from '@/lib/crypto';
import { deleteBlob, getBlob, putBlob } from '@/lib/idb';
import { newId } from '@/lib/ids';
import { getDek, onLock } from '@/data/vaultKey';
import { batch, insert, referencesTo } from '@/data/repo';
import type { Attachment, NewEntity } from '@/data/schema';
import { getRecord } from '@/data/store';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const blobAad = (id: string) => `vetcasa:blob:${id}`;

/**
 * Reduce y recodifica una imagen a JPEG. Al redibujarla en un lienzo se eliminan los metadatos EXIF
 * (incluida la ubicación GPS de la foto).
 */
export async function processImage(file: Blob, maxDim = 1600, quality = 0.82): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new UserError('No se pudo leer la imagen. Prueba con otra foto o con formato JPG, PNG o HEIC.');
    }
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new UserError('No se pudo procesar la imagen.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', quality),
    );
    return { blob, width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function storeBlob(data: Blob): Promise<string> {
  const id = newId();
  const sealed = await sealBytes(getDek(), blobAad(id), new Uint8Array(await data.arrayBuffer()));
  await putBlob({ id, iv: sealed.iv, ct: sealed.ct, size: data.size });
  return id;
}

export interface SaveAttachmentInput {
  file: File | Blob;
  fileName?: string;
  ownerKind: Attachment['ownerKind'];
  kind: Attachment['kind'];
  patientId?: string;
  consultationId?: string;
  examId?: string;
  documentId?: string;
  caption?: string;
  takenAt?: string;
}

/** Guarda un archivo cifrado y crea su registro. Si algo falla, no deja archivos huérfanos. */
export async function saveAttachment(input: SaveAttachmentInput, opts?: { maxDim?: number }): Promise<Attachment> {
  const { file } = input;
  const name = input.fileName ?? (file instanceof File ? file.name : 'archivo');
  const isImage = file.type.startsWith('image/');
  if (!isImage && file.size > MAX_FILE_BYTES) {
    throw new UserError(`El archivo supera el máximo de ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`);
  }
  if (!isImage && file.type !== 'application/pdf' && !file.type.startsWith('text/')) {
    throw new UserError('Formato no admitido. Usa imágenes (JPG, PNG, HEIC) o PDF.');
  }
  const created: string[] = [];
  try {
    let main: Blob = file;
    let width: number | undefined;
    let height: number | undefined;
    let thumbId: string | undefined;
    if (isImage) {
      const processed = await processImage(file, opts?.maxDim ?? 1600);
      main = processed.blob;
      width = processed.width;
      height = processed.height;
      const thumb = await processImage(file, 360, 0.75);
      thumbId = await storeBlob(thumb.blob);
      created.push(thumbId);
    }
    const blobId = await storeBlob(main);
    created.push(blobId);
    const data: NewEntity<'attachments'> = {
      ownerKind: input.ownerKind,
      kind: input.kind,
      patientId: input.patientId,
      consultationId: input.consultationId,
      examId: input.examId,
      documentId: input.documentId,
      fileName: isImage ? name.replace(/\.(heic|heif|png|webp|gif|jpeg)$/i, '.jpg') : name,
      mimeType: isImage ? 'image/jpeg' : file.type,
      size: main.size,
      width,
      height,
      caption: input.caption,
      takenAt: input.takenAt,
      blobId,
      thumbBlobId: thumbId,
    };
    return await insert('attachments', data);
  } catch (e) {
    for (const id of created) await deleteBlob(id).catch(() => undefined);
    throw e;
  }
}

const urlCache = new Map<string, string>();
onLock(() => {
  for (const u of urlCache.values()) URL.revokeObjectURL(u);
  urlCache.clear();
});

export async function readBlob(blobId: string, mime: string): Promise<Blob> {
  const b = await getBlob(blobId);
  if (!b) throw new UserError('El archivo no se encuentra en este dispositivo (puede provenir de un respaldo sin adjuntos).');
  const data = await openBytes(getDek(), blobAad(blobId), { iv: b.iv, ct: b.ct });
  return new Blob([data], { type: mime });
}

export async function blobUrl(blobId: string, mime: string): Promise<string> {
  const cached = urlCache.get(blobId);
  if (cached) return cached;
  const url = URL.createObjectURL(await readBlob(blobId, mime));
  urlCache.set(blobId, url);
  return url;
}

/** URL temporal (en memoria) para mostrar una imagen descifrada. */
export function useBlobUrl(blobId: string | undefined, mime = 'image/jpeg'): { url?: string; error?: string } {
  const [state, setState] = useState<{ url?: string; error?: string }>(() => (blobId && urlCache.has(blobId) ? { url: urlCache.get(blobId) } : {}));
  useEffect(() => {
    let alive = true;
    if (!blobId) {
      setState({});
      return;
    }
    blobUrl(blobId, mime)
      .then((url) => alive && setState({ url }))
      .catch((e: Error) => alive && setState({ error: e.message }));
    return () => {
      alive = false;
    };
  }, [blobId, mime]);
  return state;
}

/** Elimina un adjunto (registro y archivos cifrados), si nada lo referencia. */
export async function deleteAttachment(id: string): Promise<void> {
  const att = getRecord('attachments', id);
  if (!att) return;
  const refs = referencesTo('attachments', id);
  const b = batch();
  // Si es la foto del paciente o la firma/logo del perfil, se quita la referencia en el mismo lote.
  for (const r of refs) {
    if (r.table === 'patients') b.update('patients', r.id, { photoAttachmentId: undefined });
    else if (r.table === 'profile') {
      const p = getRecord('profile', 'profile');
      b.update('profile', 'profile', {
        logoAttachmentId: p?.logoAttachmentId === id ? undefined : p?.logoAttachmentId,
        signatureAttachmentId: p?.signatureAttachmentId === id ? undefined : p?.signatureAttachmentId,
      });
    } else if (r.table === 'documents') {
      const d = getRecord('documents', r.id);
      if (d?.scanAttachmentId === id) b.update('documents', r.id, { scanAttachmentId: undefined });
      if (d?.signature?.attachmentId === id) b.update('documents', r.id, (cur) => ({ ...cur, signature: cur.signature ? { ...cur.signature, attachmentId: undefined } : undefined }));
    }
  }
  b.remove('attachments', id);
  await b.commit();
  await deleteBlob(att.blobId).catch(() => undefined);
  if (att.thumbBlobId) await deleteBlob(att.thumbBlobId).catch(() => undefined);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
