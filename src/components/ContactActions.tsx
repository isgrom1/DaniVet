import { Mail, MapPin, MessageCircle, Navigation, Phone } from 'lucide-react';
import { ActionLink } from './Button';
import { telHref, whatsappHref } from '@/lib/phone';
import { appleMapsHref, googleMapsHref, wazeHref, addressText, type AddressLike } from '@/lib/maps';

/** Enlaces explícitos: la llamada o el mensaje los inicia la usuaria; la app no envía nada por sí sola. */
export function ContactActions({ phone, email, whatsappText }: { phone?: string; email?: string; whatsappText?: string }) {
  if (!phone && !email) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {phone && (
        <ActionLink href={telHref(phone)} external={false} icon={<Phone className="size-4" />}>
          Llamar
        </ActionLink>
      )}
      {phone && (
        <ActionLink href={whatsappHref(phone, whatsappText)} icon={<MessageCircle className="size-4" />}>
          WhatsApp
        </ActionLink>
      )}
      {email && (
        <ActionLink href={`mailto:${email}`} external={false} icon={<Mail className="size-4" />}>
          Correo
        </ActionLink>
      )}
    </div>
  );
}

export function MapLinks({ address }: { address: AddressLike }) {
  if (!addressText(address)) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      <ActionLink href={appleMapsHref(address)} icon={<MapPin className="size-4" />}>
        Mapas
      </ActionLink>
      <ActionLink href={googleMapsHref(address)} icon={<MapPin className="size-4" />}>
        Google
      </ActionLink>
      <ActionLink href={wazeHref(address)} icon={<Navigation className="size-4" />}>
        Waze
      </ActionLink>
    </div>
  );
}
