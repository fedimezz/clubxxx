"use client";

// Small dependency-free SVG charts for the owner dashboard.
// Accessibility: each chart is role="img" with a text summary, is keyboard-navigable
// (←/→ moves the highlighted point), exposes the exact values in a visually hidden table, and
// never relies on colour alone (value labels + tooltip). Animations are CSS-only and disabled for
// prefers-reduced-motion.
import { useId, useMemo, useRef, useState } from "react";

export interface ChartPoint {
  label: string;
  fullLabel: string;
  value: number;
}

interface BaseProps {
  points: ChartPoint[];
  /** Formats a value for the tooltip / table (e.g. "12 480 TND"). */
  format?: (n: number) => string;
  /** Short unit name used in the aria summary, e.g. "membres". */
  unit: string;
  color?: string;
  height?: number;
}

const W = 640;
const PAD = { top: 14, right: 14, bottom: 26, left: 40 };

/** Rounds the axis maximum to a "nice" number so ticks read well. */
export function niceMax(max: number): number {
  if (max <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function useChartGeometry(points: ChartPoint[], height: number) {
  return useMemo(() => {
    const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
    const iw = W - PAD.left - PAD.right;
    const ih = height - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const y = (v: number) => PAD.top + ih - (v / max) * ih;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: Math.round(max * t * 100) / 100, y: y(max * t) }));
    return { max, iw, ih, x, y, ticks };
  }, [points, height]);
}

function labelStep(n: number): number {
  return n <= 8 ? 1 : n <= 14 ? 2 : n <= 31 ? 5 : Math.ceil(n / 6);
}

function Summary({ points, unit, format }: { points: ChartPoint[]; unit: string; format: (n: number) => string }) {
  return (
    <table className="sr-only">
      <caption>Valeurs ({unit})</caption>
      <tbody>
        {points.map((p) => (
          <tr key={p.fullLabel}><th scope="row">{p.fullLabel}</th><td>{format(p.value)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function useActive(count: number) {
  const [active, setActive] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const fromPointer = (clientX: number, x: (i: number) => number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || count === 0) return;
    const scale = W / rect.width;
    const px = (clientX - rect.left) * scale;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < count; i++) {
      const d = Math.abs(x(i) - px);
      if (d < bestD) { bestD = d; best = i; }
    }
    setActive(best);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setActive((a) => Math.min(count - 1, (a ?? -1) + 1)); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); setActive((a) => Math.max(0, (a ?? count) - 1)); }
    else if (e.key === "Escape") setActive(null);
  };
  return { active, setActive, ref, fromPointer, onKey };
}

function Tooltip({ point, left, top, format, unit }: { point: ChartPoint; left: number; top: number; format: (n: number) => string; unit: string }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--border-light)] bg-card px-3 py-1.5 text-xs shadow-lg"
      style={{ left: `${left}%`, top: `${top}%` }}
      role="status"
    >
      <p className="font-semibold text-primary">{point.fullLabel}</p>
      <p className="text-muted">{format(point.value)} {unit}</p>
    </div>
  );
}

export function LineAreaChart({ points, format = (n) => n.toLocaleString("fr-FR"), unit, color = "var(--primary)", height = 240, showLast = false }: BaseProps & { showLast?: boolean }) {
  const id = useId().replace(/:/g, "");
  const g = useChartGeometry(points, height);
  const { active, setActive, ref, fromPointer, onKey } = useActive(points.length);
  const step = labelStep(points.length);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${g.x(i).toFixed(1)},${g.y(p.value).toFixed(1)}`).join(" ");
  const area = points.length ? `${line} L${g.x(points.length - 1).toFixed(1)},${g.y(0).toFixed(1)} L${g.x(0).toFixed(1)},${g.y(0).toFixed(1)} Z` : "";
  const last = points[points.length - 1];
  const first = points[0];
  const summary = points.length
    ? `Courbe : de ${format(first.value)} (${first.fullLabel}) à ${format(last.value)} (${last.fullLabel}) ${unit}.`
    : `Aucune donnée ${unit}.`;
  const a = active !== null ? points[active] : null;

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50 rounded-lg"
        role="img"
        aria-label={summary}
        tabIndex={0}
        onPointerMove={(e) => fromPointer(e.clientX, g.x)}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        <defs>
          <linearGradient id={`grad-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {g.ticks.map((t) => (
          <g key={t.y}>
            <line x1={PAD.left} x2={W - PAD.right} y1={t.y} y2={t.y} stroke="currentColor" strokeOpacity="0.1" />
            <text x={PAD.left - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="currentColor" opacity="0.55">{Number.isInteger(t.v) ? t.v.toLocaleString("fr-FR") : t.v}</text>
          </g>
        ))}
        {points.map((p, i) =>
          i % step === 0 || i === points.length - 1 ? (
            <text key={p.fullLabel} x={g.x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.55">{p.label}</text>
          ) : null
        )}
        {points.length > 0 && (
          <>
            <path d={area} fill={`url(#grad-${id})`} />
            <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="chart-draw" style={{ filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--primary) 55%, transparent))" }} />
            {points.length <= 31 && points.map((p, i) => <circle key={p.fullLabel} cx={g.x(i)} cy={g.y(p.value)} r={active === i ? 5 : 3} fill={color} stroke="var(--bg-card, #fff)" strokeWidth="1.5" />)}
            {showLast && last && active === null && (() => {
              const label = `${format(last.value)} ${unit}`;
              const w = Math.round(label.length * 6.4 + 22);
              const px = g.x(points.length - 1);
              const py = g.y(last.value);
              const x0 = Math.min(px - w / 2, W - PAD.right - w + 4);
              const y0 = Math.max(2, py - 36);
              return (
                <g aria-hidden>
                  <rect x={x0} y={y0} width={w} height={24} rx={12} fill="var(--bg-card, #fff)" stroke={color} strokeWidth="1.2" />
                  <text x={x0 + w / 2} y={y0 + 16} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="currentColor">{label}</text>
                </g>
              );
            })()}
            {a && <line x1={g.x(active as number)} x2={g.x(active as number)} y1={PAD.top} y2={g.y(0)} stroke={color} strokeOpacity="0.35" strokeDasharray="4 4" />}
          </>
        )}
      </svg>
      {a && active !== null && <Tooltip point={a} left={(g.x(active) / W) * 100} top={(g.y(a.value) / height) * 100 - 2} format={format} unit={unit} />}
      <Summary points={points} unit={unit} format={format} />
    </div>
  );
}

export function BarChart({ points, format = (n) => n.toLocaleString("fr-FR"), unit, color = "var(--primary)", height = 240, secondary }: BaseProps & { secondary?: { points: ChartPoint[]; color: string; name: string } }) {
  const merged = useMemo(() => [...points, ...(secondary?.points ?? [])], [points, secondary]);
  const g = useChartGeometry(merged.length ? merged : points, height);
  const { active, setActive, ref, fromPointer, onKey } = useActive(points.length);
  const step = labelStep(points.length);
  const slot = points.length ? g.iw / points.length : g.iw;
  const bw = Math.max(3, Math.min(28, slot * (secondary ? 0.36 : 0.62)));
  const cx = (i: number) => PAD.left + slot * i + slot / 2;
  const a = active !== null ? points[active] : null;
  const total = points.reduce((s, p) => s + p.value, 0);
  const summary = `Histogramme : ${format(total)} ${unit} au total sur ${points.length} périodes.`;

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full touch-pan-y select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/50"
        role="img"
        aria-label={summary}
        tabIndex={0}
        onPointerMove={(e) => fromPointer(e.clientX, cx)}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        {g.ticks.map((t) => (
          <g key={t.y}>
            <line x1={PAD.left} x2={W - PAD.right} y1={t.y} y2={t.y} stroke="currentColor" strokeOpacity="0.1" />
            <text x={PAD.left - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="currentColor" opacity="0.55">{Number.isInteger(t.v) ? t.v.toLocaleString("fr-FR") : t.v}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const h1 = g.y(0) - g.y(p.value);
          const s = secondary?.points[i];
          const h2 = s ? g.y(0) - g.y(s.value) : 0;
          return (
            <g key={p.fullLabel} opacity={active === null || active === i ? 1 : 0.5}>
              <rect x={secondary ? cx(i) - bw - 1 : cx(i) - bw / 2} y={g.y(p.value)} width={bw} height={Math.max(0, h1)} rx="2" fill={color} className="chart-grow" />
              {s && <rect x={cx(i) + 1} y={g.y(s.value)} width={bw} height={Math.max(0, h2)} rx="2" fill={secondary.color} className="chart-grow" />}
              {(i % step === 0 || i === points.length - 1) && <text x={cx(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.55">{p.label}</text>}
            </g>
          );
        })}
      </svg>
      {a && active !== null && (
        <Tooltip
          point={secondary?.points[active] ? { ...a, fullLabel: a.fullLabel, value: a.value } : a}
          left={(cx(active) / W) * 100}
          top={(g.y(a.value) / height) * 100 - 2}
          format={format}
          unit={secondary?.points[active] ? `${unit} · ${format(secondary.points[active].value)} ${secondary.name}` : unit}
        />
      )}
      <Summary points={points} unit={unit} format={format} />
    </div>
  );
}

/** Tiny inline trend line for stat cards (optional soft area under the line). */
export function Sparkline({ values, color = "currentColor", className = "", area = false }: { values: number[]; color?: string; className?: string; area?: boolean }) {
  const gid = useId().replace(/:/g, "");
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = max - min || 1;
  const w = 100;
  const h = 28;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)] as const);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden>
      {area && (
        <>
          <defs>
            <linearGradient id={`sp-${gid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.35" /><stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#sp-${gid})`} />
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
