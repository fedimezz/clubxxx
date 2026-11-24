"use client";
// ThemePicker — the 10 website themes (lib/website-themes.ts). Each card is a
// mini mock-up of THAT theme's real hero layout, typography and motion mood —
// not just a color swatch — so owners see how different the sites really are.
// Purely a controlled input: the parent owns the selected id and decides what
// to stage (theme id, default colors, default 3D model).
import { useEffect, useMemo, useState } from "react";
import { Check, Eye, Monitor, Search, Smartphone, X, Loader2 } from "lucide-react";
import { SELECTABLE_THEME_PRESETS, THEME_CATEGORIES, resolveThemeId, type ThemePreset } from "@/lib/website-themes";

interface ThemePickerProps {
  selectedId: string;
  onSelect: (theme: ThemePreset) => void;
  disabled?: boolean;
  clubName?: string;
  logoUrl?: string | null;
  heroModel?: string | null;
  customHeroUrl?: string | null;
  /** Live brand colors to show in the previews (defaults to each theme's own). */
  primaryColor?: string;
  secondaryColor?: string;
  /** Theme currently SAVED for the club (shows the "Actif" badge). Defaults to `selectedId`. */
  activeId?: string;
  /**
   * "Appliquer le thème" in the full preview. When omitted the button just selects the theme
   * (the parent's own save bar persists it).
   */
  onApply?: (theme: ThemePreset) => void;
  applying?: boolean;
  /** Full-site preview needs an existing club site (not available during onboarding). Default true. */
  previewable?: boolean;
}

function MiniPreview({ theme, clubName, primary, secondary }: { theme: ThemePreset; clubName: string; primary: string; secondary: string }) {
  const font = `"${theme.headingFont}", Impact, serif`;
  const fg = theme.previewText;
  const base: React.CSSProperties = { backgroundColor: theme.previewBg, color: fg };

  if (theme.layout === "forge") {
    return (
      <div className="relative h-36 overflow-hidden rounded-lg p-3" style={{ ...base, backgroundImage: "repeating-linear-gradient(115deg, rgba(255,255,255,.04) 0 2px, transparent 2px 7px)" }}>
        <div className="mb-1.5 h-1 w-10" style={{ background: primary }} />
        <p className="truncate text-2xl uppercase leading-none" style={{ fontFamily: font, letterSpacing: ".02em" }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[9px] font-bold uppercase tracking-[.12em]" style={{ background: primary, color: "#111", borderRadius: 2 }}>Rejoindre</span>
        <div className="absolute -right-2 top-4 h-16 w-16 rounded-full" style={{ background: `radial-gradient(circle at 35% 35%, ${secondary}, #222 70%)` }} />
        <div className="absolute inset-x-0 bottom-0 h-5 text-[10px] uppercase tracking-[.2em]" style={{ background: primary, color: "#111", clipPath: "polygon(0 0,100% 0,100% 70%,0 100%)", fontFamily: font }}>
          <span className="pl-3 pt-1 inline-block">{clubName} ◆ {clubName} ◆</span>
        </div>
      </div>
    );
  }
  if (theme.layout === "arena") {
    return (
      <div className="relative h-36 overflow-hidden rounded-lg p-3" style={{ ...base, backgroundImage: `linear-gradient(135deg, transparent 0 62%, ${primary} 62% 70%, transparent 70% 74%, ${secondary} 74% 78%, transparent 78%)` }}>
        <p className="text-sm tabular-nums" style={{ fontFamily: font, color: primary }}>12:34</p>
        <p className="truncate text-3xl font-extrabold uppercase italic leading-none" style={{ fontFamily: font }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[9px] font-bold uppercase tracking-[.08em]" style={{ background: primary, color: "#fff", borderRadius: 4 }}>Rejoindre</span>
        <div className="absolute inset-x-0 bottom-0 h-2" style={{ backgroundImage: `repeating-linear-gradient(-45deg, ${primary} 0 8px, #0b0b0c 8px 16px)` }} />
      </div>
    );
  }
  if (theme.layout === "ring") {
    return (
      <div className="relative h-36 overflow-hidden rounded-lg p-3 text-center" style={{ ...base, backgroundImage: "radial-gradient(ellipse 60% 70% at 50% 0%, rgba(255,244,214,.25), transparent 65%)" }}>
        <p className="text-[9px] tracking-[.5em]" style={{ color: primary }}>★ ★ ★</p>
        <p className="truncate text-3xl uppercase leading-none" style={{ fontFamily: font, letterSpacing: ".06em" }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[9px] font-bold uppercase tracking-[.16em]" style={{ background: primary, color: "#fff", borderRadius: 3 }}>Rejoindre</span>
        <div className="absolute inset-x-3 bottom-2 space-y-1">
          {[primary, "#fafafa", primary].map((c, i) => <div key={i} className="h-[3px] rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />)}
        </div>
      </div>
    );
  }
  if (theme.layout === "studio") {
    return (
      <div className="relative grid h-36 grid-cols-[1.2fr_.8fr] items-center gap-2 overflow-hidden rounded-lg p-3" style={{ ...base, backgroundImage: `radial-gradient(60% 60% at 15% 20%, ${primary}33, transparent 70%), radial-gradient(50% 55% at 90% 80%, ${secondary}44, transparent 70%)` }}>
        <div>
          <div className="mb-2 h-px w-8" style={{ background: primary }} />
          <p className="truncate text-2xl leading-none" style={{ fontFamily: font, fontWeight: 500 }}>{clubName}</p>
          <span className="mt-2 inline-block rounded-full px-3 py-1 text-[9px] font-semibold" style={{ background: primary, color: "#fff" }}>Rejoindre</span>
        </div>
        <div className="mx-auto h-full w-14" style={{ borderRadius: "999px 999px 14px 14px", background: `linear-gradient(180deg, ${primary}33, ${secondary}44)`, boxShadow: `inset 0 0 0 1px ${primary}44` }} />
      </div>
    );
  }
  if (theme.layout === "private") {
    return (
      <div className="relative grid h-36 grid-cols-[1.1fr_.9fr] items-center gap-2 overflow-hidden rounded-lg p-3 pl-6" style={{ ...base, backgroundImage: `radial-gradient(ellipse 50% 70% at 80% 40%, ${primary}30, transparent 70%)` }}>
        <div className="absolute inset-y-2 left-3 w-px" style={{ background: `linear-gradient(180deg, transparent, ${primary}, transparent)` }} />
        <div>
          <p className="text-[7px] uppercase tracking-[.4em]" style={{ color: primary }}>Club privé</p>
          <p className="mt-1 truncate text-xl leading-none" style={{ fontFamily: font, color: primary }}>{clubName}</p>
          <div className="my-1.5 h-px w-14" style={{ background: `linear-gradient(90deg, ${primary}, transparent)` }} />
          <span className="inline-block px-3 py-1 text-[8px] font-semibold uppercase tracking-[.24em]" style={{ border: `1px solid ${primary}`, color: primary }}>Rejoindre</span>
        </div>
        <p className="text-right text-7xl leading-none" style={{ fontFamily: font, color: "transparent", WebkitTextStroke: `1px ${primary}55` }}>{clubName.charAt(0).toUpperCase()}</p>
      </div>
    );
  }
  if (theme.layout === "salon") {
    return (
      <div className="relative flex h-36 flex-col items-center justify-center overflow-hidden rounded-lg p-3 text-center" style={{ ...base, backgroundImage: `radial-gradient(ellipse 60% 60% at 50% 40%, ${primary}33, transparent 70%)` }}>
        <div className="absolute inset-2" style={{ border: `1px solid ${primary}77` }} />
        <p className="text-[8px] uppercase tracking-[.4em]" style={{ color: primary }}>{clubName}</p>
        <div className="my-1.5 h-px w-16" style={{ background: `linear-gradient(90deg, transparent, ${primary}, transparent)` }} />
        <p className="truncate text-2xl leading-none" style={{ fontFamily: font, color: primary }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[8px] font-semibold uppercase tracking-[.24em]" style={{ border: `1px solid ${primary}`, color: primary }}>Rejoindre</span>
      </div>
    );
  }
  if (theme.layout === "grid") {
    return (
      <div className="relative h-36 overflow-hidden rounded-lg p-3" style={{ ...base, backgroundImage: `radial-gradient(ellipse 60% 50% at 75% 30%, ${primary}33, transparent 70%)` }}>
        <span className="inline-block rounded px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[.3em]" style={{ border: `1px solid ${primary}`, color: primary, boxShadow: `0 0 8px ${primary}66` }}>Performance</span>
        <p className="mt-1.5 truncate text-lg font-extrabold uppercase leading-none" style={{ fontFamily: font, letterSpacing: ".05em", textShadow: `0 0 12px ${primary}88` }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[8px] font-bold uppercase tracking-[.14em]" style={{ background: primary, color: "#031", borderRadius: 3, boxShadow: `0 0 12px ${primary}88` }}>Rejoindre</span>
        <div className="absolute inset-x-0 bottom-0 h-12" style={{ backgroundImage: `repeating-linear-gradient(90deg, ${primary}55 0 1px, transparent 1px 14px), repeating-linear-gradient(0deg, ${primary}55 0 1px, transparent 1px 10px)`, maskImage: "linear-gradient(to top, #000, transparent)", WebkitMaskImage: "linear-gradient(to top, #000, transparent)" }} />
      </div>
    );
  }
  if (theme.layout === "platform") {
    return (
      <div className="relative h-36 overflow-hidden p-3" style={{ ...base, borderRadius: 0, backgroundImage: `linear-gradient(180deg, transparent 70%, ${primary}55)` }}>
        <p className="absolute -right-1 top-3 text-6xl font-bold leading-none" style={{ fontFamily: font, color: "transparent", WebkitTextStroke: `1px ${primary}88` }}>500</p>
        <div className="mb-1.5 h-1.5 w-12" style={{ background: secondary }} />
        <p className="truncate text-2xl font-bold uppercase leading-none" style={{ fontFamily: font, letterSpacing: ".04em" }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[8px] font-bold uppercase tracking-[.18em]" style={{ background: primary, color: "#fff", boxShadow: "3px 3px 0 #000" }}>Rejoindre</span>
        <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: `linear-gradient(90deg, ${secondary}, #d4d4d8 30%, ${secondary})` }} />
      </div>
    );
  }
  if (theme.layout === "street") {
    return (
      <div className="relative h-36 overflow-hidden rounded-sm p-3" style={{ ...base, backgroundImage: "radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.4px)", backgroundSize: "7px 7px" }}>
        <span className="inline-block px-1.5 py-0.5 text-[8px] uppercase tracking-[.18em]" style={{ border: `2px solid ${primary}`, color: primary, transform: "rotate(-3deg)", fontFamily: font }}>{clubName}</span>
        <p className="mt-2 truncate text-3xl uppercase leading-none" style={{ fontFamily: font }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[8px] font-bold uppercase tracking-[.1em]" style={{ background: primary, color: "#111", borderRadius: 2 }}>Rejoindre</span>
        <div className="absolute inset-x-0 bottom-0 h-2.5" style={{ backgroundImage: `repeating-linear-gradient(-45deg, ${primary} 0 8px, #151517 8px 16px)` }} />
      </div>
    );
  }
  if (theme.layout === "editorial") {
    return (
      <div className="relative grid h-36 grid-cols-[1.2fr_.8fr] items-center gap-3 overflow-hidden p-3" style={{ ...base, borderRadius: 0 }}>
        <div>
          <p className="text-[7px] uppercase tracking-[.3em] opacity-60">{clubName} — 01</p>
          <div className="my-1.5 h-px w-full opacity-20" style={{ background: "currentColor" }} />
          <p className="truncate text-2xl font-semibold leading-none" style={{ fontFamily: font, letterSpacing: "-.04em" }}>{clubName}</p>
          <span className="mt-2 inline-block px-3 py-1 text-[8px] font-semibold uppercase tracking-[.2em]" style={{ background: secondary, color: theme.previewBg }}>Rejoindre</span>
        </div>
        <div className="h-full" style={{ border: "1px solid rgba(47,43,40,.2)", background: `linear-gradient(160deg, ${primary}33, transparent)` }} />
      </div>
    );
  }
  return (
    <div className="grid h-36 grid-cols-12 grid-rows-2 gap-1.5 rounded-lg p-2" style={{ ...base, backgroundImage: `radial-gradient(60% 50% at 10% 0%, ${primary}33, transparent 70%)` }}>
      <div className="col-span-7 row-span-1 rounded-xl p-2" style={{ background: "rgba(255,255,255,.7)", border: "1px solid rgba(15,23,42,.08)" }}>
        <p className="truncate text-base font-bold leading-none" style={{ fontFamily: font, letterSpacing: "-.03em" }}>{clubName}</p>
        <span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[8px] font-semibold text-white" style={{ background: primary }}>Rejoindre</span>
      </div>
      <div className="col-span-5 row-span-2 rounded-xl" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
      <div className="col-span-7 rounded-xl" style={{ background: "rgba(255,255,255,.7)", border: "1px solid rgba(15,23,42,.08)" }} />
    </div>
  );
}


type Filter = "all" | (typeof THEME_CATEGORIES)[number]["id"] | "others";

/** Full-site preview: the REAL public site in an iframe, switched to the previewed theme (see ClubSettingsContext). */
function PreviewModal({
  theme, primary, secondary, logoUrl, heroModel, customHeroUrl, active, disabled, applying, onClose, onApply,
}: {
  theme: ThemePreset; primary: string; secondary: string; logoUrl?: string | null; heroModel?: string | null; customHeroUrl?: string | null; active: boolean; disabled?: boolean; applying?: boolean;
  onClose: () => void; onApply: () => void;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [loaded, setLoaded] = useState(false);
  const previewParams = new URLSearchParams({
    previewTheme: theme.id,
    pc: primary,
    sc: secondary,
  });
  if (logoUrl) previewParams.set("logo", logoUrl);
  if (heroModel) previewParams.set("hm", heroModel);
  if (heroModel === "custom" && customHeroUrl) previewParams.set("hu", customHeroUrl);
  const src = `/?${previewParams.toString()}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  useEffect(() => setLoaded(false), [theme.id, device]);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Aperçu du thème ${theme.name}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{theme.name} {active && <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">Actif</span>}</p>
          <p className="truncate text-xs text-white/60">{theme.mood}</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1" role="group" aria-label="Taille de l'aperçu">
          {([["desktop", Monitor, "Ordinateur"], ["mobile", Smartphone, "Mobile"]] as const).map(([id, Icon, label]) => (
            <button key={id} type="button" aria-pressed={device === id} onClick={() => setDevice(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${device === id ? "bg-white text-slate-900" : "text-white/70 hover:text-white"}`}>
              <Icon size={14} aria-hidden /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={disabled || applying || active} onClick={onApply}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand,#10b981)] px-4 py-2 text-sm font-bold text-[var(--brand-contrast,#fff)] disabled:opacity-50">
            {applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {active ? "Thème actif" : "Appliquer le thème"}
          </button>
          <button type="button" onClick={onClose} aria-label="Fermer l'aperçu" className="rounded-xl p-2 text-white/70 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </div>
      </div>
      <div className="relative flex flex-1 items-start justify-center overflow-auto p-3 sm:p-6">
        <div className={`relative overflow-hidden bg-white shadow-2xl transition-all duration-500 ease-out ${device === "mobile" ? "h-[760px] max-h-full w-[390px] rounded-[2.2rem] border-[10px] border-slate-900" : "h-full w-full max-w-[1400px] rounded-xl"}`}>
          {!loaded && <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950 text-white/70"><Loader2 className="animate-spin" /></div>}
          <iframe key={`${theme.id}-${device}`} title={`Aperçu ${theme.name}`} src={src} onLoad={() => setLoaded(true)}
            className={`h-full w-full border-0 transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`} />
        </div>
      </div>
    </div>
  );
}

export default function ThemePicker({ selectedId, onSelect, disabled, clubName, logoUrl, heroModel, customHeroUrl, primaryColor, secondaryColor, activeId, onApply, applying, previewable = true }: ThemePickerProps) {
  const current = resolveThemeId(selectedId);
  const active = resolveThemeId(activeId ?? selectedId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [previewing, setPreviewing] = useState<ThemePreset | null>(null);

  // A club that still uses a retired theme keeps seeing it until it picks another one.
  const presets = useMemo(() => SELECTABLE_THEME_PRESETS, []);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return presets.filter((t) => {
      if (filter === "others" ? t.flagship : filter !== "all" && t.category !== filter) return false;
      if (!q) return true;
      return [t.name, t.description, t.mood, ...t.keywords].join(" ").toLowerCase().includes(q);
    }).sort((a, b) => Number(b.flagship) - Number(a.flagship));
  }, [presets, query, filter]);

  const chips: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "Tous" },
    ...THEME_CATEGORIES.map((c) => ({ id: c.id as Filter, label: c.label })),
    { id: "others", label: "Autres thèmes" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un thème (boxe, yoga, luxe…)" aria-label="Rechercher un thème"
            className="w-full rounded-xl border border-border bg-muted/20 py-2.5 pl-9 pr-3 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Catégories">
          {chips.map((c) => (
            <button key={c.id} type="button" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${filter === c.id ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-border text-muted hover:border-[var(--primary)]/50 hover:text-primary"}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">Aucun thème ne correspond à « {query} ». Essayez un autre mot-clé.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Thème du site">
          {list.map((theme) => {
            const selected = theme.id === current;
            const isActive = theme.id === active;
            const p = primaryColor || theme.primaryColor;
            const sec = secondaryColor || theme.secondaryColor;
            return (
              <div key={theme.id} className={`group overflow-hidden rounded-2xl border-2 bg-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${selected ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30" : "border-border hover:border-[var(--primary)]/40"}`}>
                <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={() => onSelect(theme)} className="block w-full text-left disabled:cursor-not-allowed disabled:opacity-60">
                  <div className="relative bg-muted/30 p-2.5">
                    <MiniPreview theme={theme} clubName={clubName || "Votre club"} primary={p} secondary={sec} />
                    {isActive && <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow"><Check size={10} /> Actif</span>}
                  </div>
                  <div className="space-y-1.5 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-primary">{theme.name}</p>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-[var(--primary)] bg-[var(--primary)]" : "border-border"}`}>{selected && <Check size={11} className="text-white" />}</span>
                    </div>
                    <p className="text-xs text-muted">{theme.description}</p>
                    <div className="flex items-center gap-2 pt-1 text-[11px] text-muted">
                      <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: p }} />
                      <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: sec }} />
                      <span className="truncate">{theme.mood}</span>
                    </div>
                    <p className="text-[11px] text-muted">Police : {theme.headingFont}</p>
                  </div>
                </button>
                <div className="flex gap-2 border-t border-border bg-muted/10 p-3">
                  {previewable && <button type="button" onClick={() => setPreviewing(theme)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-muted/30">
                    <Eye size={14} aria-hidden /> Aperçu complet
                  </button>}
                  <button type="button" disabled={disabled || isActive} onClick={() => (onApply ? onApply(theme) : onSelect(theme))}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {isActive ? "Thème actif" : "Appliquer"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {previewing && (
        <PreviewModal
          theme={previewing}
          primary={primaryColor || previewing.primaryColor}
          secondary={secondaryColor || previewing.secondaryColor}
          logoUrl={logoUrl}
          heroModel={heroModel}
          customHeroUrl={customHeroUrl}
          active={previewing.id === active}
          disabled={disabled}
          applying={applying}
          onClose={() => setPreviewing(null)}
          onApply={() => { const t = previewing; setPreviewing(null); if (onApply) onApply(t); else onSelect(t); }}
        />
      )}
    </div>
  );
}
