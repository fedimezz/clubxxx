"use client";

// Small dependency-free SVG charts for the member dashboard. They only draw numbers they are given
// (all real, computed server-side) — an all-zero series is drawn flat, never a decorative curve.
import { useId, useMemo, useState } from "react";

export interface ActivityPoint {
  label: string;
  title: string;
  reservations: number;
  attendances: number;
}

/** Circular progress. `value` is 0-100; `null` renders an empty ring (nothing to measure). */
export function ProgressRing({ value, size = 112, stroke = 9, children }: { value: number | null; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.14} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="mx-ring-arc"
          style={{ ["--ring-full" as string]: c, ["--ring-to" as string]: c * (1 - pct / 100), filter: "drop-shadow(0 0 6px rgb(var(--glow) / 0.7))" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Tiny trend line for KPI cards. Flat when every value is 0. */
export function Sparkline({ values, color = "rgb(var(--tint))", height = 44 }: { values: number[]; color?: string; height?: number }) {
  const gid = useId().replace(/:/g, "");
  const w = 160;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, height - 4 - (v / max) * (height - 10)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Two-series line chart (reservations + check-ins) with an accessible hover/focus tooltip. */
export function ActivityChart({ points }: { points: ActivityPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 720;
  const H = 240;
  const pad = { l: 34, r: 14, t: 16, b: 30 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const { max, ticks } = useMemo(() => {
    const raw = Math.max(...points.flatMap((p) => [p.reservations, p.attendances]), 1);
    const niceMax = raw <= 4 ? 4 : Math.ceil(raw / 4) * 4;
    return { max: niceMax, ticks: [0, 1, 2, 3, 4].map((i) => Math.round((niceMax / 4) * i)) };
  }, [points]);

  const x = (i: number) => pad.l + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const path = (key: "reservations" | "attendances") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const labelEvery = points.length > 16 ? Math.ceil(points.length / 8) : 1;
  const a = active !== null ? points[active] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Activité : réservations et présences sur la période">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={0.1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">{t}</text>
          </g>
        ))}
        {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{p.label}</text>
        ))}
        <path d={path("reservations")} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mx-draw" style={{ filter: "drop-shadow(0 0 5px rgb(var(--glow) / 0.6))" }} />
        <path d={path("attendances")} fill="none" stroke="#60a5fa" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" className="mx-draw" />
        {a && active !== null && <line x1={x(active)} x2={x(active)} y1={pad.t} y2={pad.t + innerH} stroke="var(--primary)" strokeOpacity={0.4} strokeDasharray="3 3" />}
        {points.map((p, i) => (
          <g key={i}>
            {(active === i || points.length <= 14) && (
              <>
                <circle cx={x(i)} cy={y(p.reservations)} r={active === i ? 5 : 3} fill="var(--primary)" />
                <circle cx={x(i)} cy={y(p.attendances)} r={active === i ? 4.5 : 2.5} fill="#60a5fa" />
              </>
            )}
            <rect
              x={x(i) - innerW / Math.max(points.length - 1, 1) / 2}
              y={pad.t}
              width={innerW / Math.max(points.length - 1, 1)}
              height={innerH}
              fill="transparent"
              tabIndex={0}
              role="img"
              aria-label={`${p.title} : ${p.reservations} réservation${p.reservations > 1 ? "s" : ""}, ${p.attendances} présence${p.attendances > 1 ? "s" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            />
          </g>
        ))}
      </svg>
      {a && active !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-xl"
          style={{ left: `${(x(active) / W) * 100}%`, top: 0 }}
        >
          <p className="font-bold text-primary">{a.title}</p>
          <p className="text-muted"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--primary)]" />{a.reservations} réservation{a.reservations > 1 ? "s" : ""}</p>
          <p className="text-muted"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-400" />{a.attendances} présence{a.attendances > 1 ? "s" : ""}</p>
        </div>
      )}
    </div>
  );
}
