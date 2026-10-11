export function Logo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden role="img">
      <rect width="512" height="512" rx="112" fill="#1f5f57" />
      <rect x="330" y="128" width="30" height="62" rx="6" fill="#d9825b" />
      <path d="M256 104 L420 238 L384 238 L384 394 Q384 416 362 416 L150 416 Q128 416 128 394 L128 238 L92 238 Z" fill="#f7f4ef" />
      <g fill="#1f5f57">
        <ellipse cx="256" cy="356" rx="50" ry="40" />
        <ellipse cx="190" cy="300" rx="20" ry="27" transform="rotate(-22 190 300)" />
        <ellipse cx="230" cy="266" rx="20" ry="28" transform="rotate(-8 230 266)" />
        <ellipse cx="282" cy="266" rx="20" ry="28" transform="rotate(8 282 266)" />
        <ellipse cx="322" cy="300" rx="20" ry="27" transform="rotate(22 322 300)" />
      </g>
    </svg>
  );
}
