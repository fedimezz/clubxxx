// Decorative barbell for the dashboard banner. Inline SVG only: no network request, no external asset.
// aria-hidden — it carries no information.
export default function HeroArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 220" className={className} aria-hidden="true" focusable="false" preserveAspectRatio="xMaxYMid slice">
      <defs>
        <linearGradient id="hx-plate" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#2a3441" /><stop offset="0.5" stopColor="#0f1620" /><stop offset="1" stopColor="#05080d" />
        </linearGradient>
        <linearGradient id="hx-bar" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9aa7b8" /><stop offset="0.45" stopColor="#4b5666" /><stop offset="1" stopColor="#1a212c" />
        </linearGradient>
        <radialGradient id="hx-glow" cx="0.6" cy="0.5" r="0.6">
          <stop offset="0" style={{ stopColor: "rgb(var(--glow))" }} stopOpacity="0.55" /><stop offset="1" style={{ stopColor: "rgb(var(--glow))" }} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="330" cy="110" rx="230" ry="120" fill="url(#hx-glow)" />
      {/* light streaks */}
      <g style={{ stroke: "rgb(var(--glow))" }} strokeLinecap="round" opacity="0.55">
        <path d="M250 24 L380 -10" strokeWidth="2" /><path d="M300 210 L450 160" strokeWidth="3" /><path d="M420 40 L520 20" strokeWidth="1.5" />
      </g>
      <g transform="rotate(-14 330 112)">
        {/* bar */}
        <rect x="60" y="104" width="420" height="14" rx="7" fill="url(#hx-bar)" />
        {/* left plates */}
        <rect x="116" y="36" width="34" height="150" rx="10" fill="url(#hx-plate)" style={{ stroke: "rgb(var(--glow))" }} strokeOpacity="0.35" />
        <rect x="152" y="52" width="26" height="118" rx="9" fill="url(#hx-plate)" style={{ stroke: "rgb(var(--glow))" }} strokeOpacity="0.25" />
        <rect x="180" y="70" width="18" height="82" rx="7" fill="url(#hx-plate)" style={{ stroke: "rgb(var(--glow))" }} strokeOpacity="0.2" />
        {/* right plates */}
        <rect x="372" y="36" width="34" height="150" rx="10" fill="url(#hx-plate)" style={{ stroke: "rgb(var(--glow))" }} strokeOpacity="0.35" />
        <rect x="342" y="52" width="26" height="118" rx="9" fill="url(#hx-plate)" style={{ stroke: "rgb(var(--glow))" }} strokeOpacity="0.25" />
        <rect x="322" y="70" width="18" height="82" rx="7" fill="url(#hx-plate)" style={{ stroke: "rgb(var(--glow))" }} strokeOpacity="0.2" />
        {/* plate highlights */}
        <g fill="#fff" opacity="0.10">
          <rect x="120" y="42" width="6" height="138" rx="3" /><rect x="376" y="42" width="6" height="138" rx="3" />
        </g>
        {/* grip knurling */}
        <g stroke="#0b0f16" strokeWidth="1.5" opacity="0.8">
          {Array.from({ length: 14 }, (_, i) => <line key={i} x1={226 + i * 6} y1="104" x2={226 + i * 6} y2="118" />)}
        </g>
      </g>
    </svg>
  );
}
