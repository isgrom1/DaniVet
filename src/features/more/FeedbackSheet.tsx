import { useState } from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import { Button, ExternalButton } from '@/components/Button';
import { Notice } from '@/components/Card';
import { Field, Segmented, TextArea } from '@/components/form';
import { Sheet } from '@/components/overlay';
import { DEFAULT_APP_NAME } from '@/lib/platform';
import { feedbackMessage, mailHref, whatsappShareHref, type FeedbackKind } from './feedback';

/** Sugerencias y reportes de problemas: se envían por WhatsApp o correo a quien mantiene la app. */
export function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>('suggestion');
  const [text, setText] = useState('');
  const ready = text.trim().length >= 3;
  const message = feedbackMessage(kind, text);
  const subject = `${DEFAULT_APP_NAME}: ${kind === 'problem' ? 'problema' : 'sugerencia'}`;
  return (
    <Sheet
      open
      onClose={onClose}
      title="Sugerir un cambio o reportar un problema"
      footer={
        ready ? (
          <div className="grid gap-2">
            <ExternalButton href={whatsappShareHref(message)} block size="lg" icon={<MessageCircle className="size-5" />} onClick={onClose}>
              Enviar por WhatsApp
            </ExternalButton>
            <ExternalButton href={mailHref(subject, message)} block variant="secondary" icon={<Mail className="size-5" />} onClick={onClose}>
              Enviar por correo
            </ExternalButton>
          </div>
        ) : (
          <Button block size="lg" disabled>
            Escribe tu mensaje para enviarlo
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <Segmented
          name="Tipo de mensaje"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'suggestion', label: 'Sugerencia' },
            { value: 'problem', label: 'Problema' },
          ]}
        />
        <Field label={kind === 'problem' ? '¿Qué pasó y qué esperabas que pasara?' : '¿Qué te gustaría cambiar o agregar?'}>
          <TextArea value={text} onChange={(e) => setText(e.target.value)} minRows={5} placeholder={kind === 'problem' ? 'Ej.: al emitir una receta aparece…' : 'Ej.: que la agenda muestre…'} />
        </Field>
        <Notice tone="warning">No escribas nombres de tutores o pacientes ni datos clínicos: el mensaje sale de la app tal como lo escribas.</Notice>
        <p className="text-xs text-ink-500">Se agrega la versión de la app y el tipo de equipo, para ubicar el problema más rápido. Elige el contacto al enviarlo.</p>
      </div>
    </Sheet>
  );
}
