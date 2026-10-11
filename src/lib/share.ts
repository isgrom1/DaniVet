/**
 * Compartir, abrir o descargar archivos generados (PDF, CSV, respaldos) de forma compatible con Safari en iOS.
 * - Compartir: hoja nativa de iOS (WhatsApp, Mail, Guardar en Archivos, Imprimir...). Requiere un toque de la usuaria.
 * - Abrir: vista previa en una pestaña nueva.
 * - Descargar: enlace de descarga (en iOS se guarda en Archivos > Descargas).
 */
export async function shareFile(blob: Blob, fileName: string, title?: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: title ?? fileName });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  return 'unsupported';
}

export function downloadFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function openFile(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener');
  if (!w) {
    // Si el navegador bloquea la ventana, se navega en la misma pestaña.
    window.location.assign(url);
  }
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}

export function safeFileName(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80) || 'archivo'
  );
}
