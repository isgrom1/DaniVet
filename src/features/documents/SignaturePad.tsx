import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/Button';

/** Captura de un trazo de firma en pantalla. Se guarda como imagen: NO es una firma electrónica avanzada. */
export function SignaturePad({ onSave, busy }: { onSave: (png: Blob) => void; busy?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio;
    c.height = rect.height * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1b2524';
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current!.getContext('2d')!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext('2d')!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setEmpty(false);
  };
  const up = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const rect = c.getBoundingClientRect();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setEmpty(true);
  };
  const save = () => {
    canvas.current!.toBlob((b) => b && onSave(b), 'image/png');
  };
  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        className="h-44 w-full touch-none rounded-xl border-2 border-dashed border-sand-400 bg-white"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Área para firmar"
      />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" icon={<Eraser className="size-4" />} onClick={clear}>
          Limpiar
        </Button>
        <Button size="sm" disabled={empty} loading={busy} onClick={save}>
          Guardar trazo
        </Button>
      </div>
    </div>
  );
}
