// Ícono original de VetCasa: casa con huella. Diseño propio (no deriva de marcas de terceros).
export const BRAND = '#1f5f57';
export const CREAM = '#f7f4ef';
export const ACCENT = '#d9825b';

/** Dibujo base en un lienzo de 512×512. `scale` reduce el dibujo hacia el centro (íconos "maskable"). */
export function iconSvg({ rounded = false, scale = 1 } = {}) {
  const t = (1 - scale) * 256;
  const bg = rounded
    ? `<rect width="512" height="512" rx="112" fill="${BRAND}"/>`
    : `<rect width="512" height="512" fill="${BRAND}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${bg}
  <g transform="translate(${t} ${t}) scale(${scale})">
    <rect x="330" y="128" width="30" height="62" rx="6" fill="${ACCENT}"/>
    <path d="M256 104 L420 238 L384 238 L384 394 Q384 416 362 416 L150 416 Q128 416 128 394 L128 238 L92 238 Z" fill="${CREAM}"/>
    <g fill="${BRAND}">
      <ellipse cx="256" cy="356" rx="50" ry="40"/>
      <ellipse cx="190" cy="300" rx="20" ry="27" transform="rotate(-22 190 300)"/>
      <ellipse cx="230" cy="266" rx="20" ry="28" transform="rotate(-8 230 266)"/>
      <ellipse cx="282" cy="266" rx="20" ry="28" transform="rotate(8 282 266)"/>
      <ellipse cx="322" cy="300" rx="20" ry="27" transform="rotate(22 322 300)"/>
    </g>
  </g>
</svg>`;
}
