/**
 * Enlaces explícitos a aplicaciones de mapas. No se usa geolocalización ni servicios de mapas de pago:
 * la dirección se abre en la app que la usuaria elija.
 */
export interface AddressLike {
  street?: string;
  comuna?: string;
  city?: string;
}

export function addressText(a: AddressLike | undefined | null): string {
  if (!a) return '';
  return [a.street, a.comuna, a.city].map((s) => s?.trim()).filter(Boolean).join(', ');
}

export function appleMapsHref(a: AddressLike): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(addressText(a) + ', Chile')}`;
}

export function googleMapsHref(a: AddressLike): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText(a) + ', Chile')}`;
}

export function wazeHref(a: AddressLike): string {
  return `https://waze.com/ul?q=${encodeURIComponent(addressText(a) + ', Chile')}&navigate=yes`;
}
