import { APP_VERSION, BUILD_DATE, DEFAULT_APP_NAME, isStandalone } from '@/lib/platform';

export type FeedbackKind = 'suggestion' | 'problem';

/** Equipo y modo de uso, sin datos personales (la versión de iOS no se incluye: Safari la informa congelada). */
export function deviceInfo(ua: string = navigator.userAgent, standalone: boolean = isStandalone()): string {
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : 'computador';
  return `${device} · ${standalone ? 'app instalada' : 'navegador'}`;
}

/** Mensaje listo para enviar a quien mantiene la app. Solo incluye lo que escribió la usuaria y la versión. */
export function feedbackMessage(kind: FeedbackKind, text: string, info: string = deviceInfo()): string {
  const title = kind === 'problem' ? 'Problema' : 'Sugerencia';
  const build = BUILD_DATE ? ` del ${BUILD_DATE.slice(0, 10)}` : '';
  return `[${DEFAULT_APP_NAME}] ${title}\n\n${text.trim()}\n\n— Versión ${APP_VERSION}${build} · ${info}`;
}

export const whatsappShareHref = (message: string) => `https://wa.me/?text=${encodeURIComponent(message)}`;

export const mailHref = (subject: string, body: string) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
