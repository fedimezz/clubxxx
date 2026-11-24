"use client";

// Theme-specific presentation of the club's formulas. The data (plans, prices, links) is identical
// for every theme — only the layout language changes (see app/themes-identity.css, `pv-*`):
//   plates → Musculation · scoreboard → CrossFit · fight-card → Boxing & MMA · soft-cards → Yoga
//   bento-tiles → Fitness Moderne · engraved → Luxury Club · hud-cards → Neon · stickers → Urban
//   typographic → Minimal Elite
// "default" (and any unknown value) falls back to the shared horizontal PlanRowCard list.
import Link from "next/link";
import { Check } from "lucide-react";
import PlanRowCard, { PlanRowList } from "@/components/pricing/PlanRowCard";

export interface VariantPlan {
  id: string;
  name: string;
  description: string | null;
  /** Already formatted, e.g. "49 TND". */
  price: string;
  /** e.g. "/mois". */
  period: string;
  features: string[];
}

interface Props {
  variant: string;
  plans: VariantPlan[];
  href: string;
  ctaLabel: string;
  /** Index of the highlighted plan (-1 for none). */
  popularIndex: number;
}

function Features({ items, className = "" }: { items: string[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={`space-y-1.5 text-sm opacity-90 ${className}`}>
      {items.slice(0, 6).map((f) => (
        <li key={f} className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" aria-hidden />
          <span>{f}</span>
        </li>
      ))}
    </ul>
  );
}

function Cta({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  return (
    <Link href={href} className={`theme-btn inline-flex items-center justify-center px-6 py-3 text-sm font-bold ${className}`}>
      {label}
    </Link>
  );
}

export default function PricingVariants({ variant, plans, href, ctaLabel, popularIndex }: Props) {
  switch (variant) {
    case "plates":
      return (
        <div className="pv-plates space-y-3">
          {plans.map((p, i) => (
            <div key={p.id} className="pv-row">
              <div className="pv-disc" aria-hidden>{String(i + 1).padStart(2, "0")}</div>
              <div>
                <h3 className="theme-heading text-2xl text-[var(--text-primary)]">{p.name}</h3>
                {p.description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{p.description}</p>}
                <Features items={p.features} className="mt-3 grid gap-x-6 sm:grid-cols-2" />
              </div>
              <div className="text-right">
                <p className="theme-heading text-4xl text-[var(--brand)]">{p.price}</p>
                <p className="mb-3 text-xs uppercase tracking-widest text-[var(--text-secondary)]">{p.period}</p>
                <Cta href={href} label={ctaLabel} />
              </div>
            </div>
          ))}
        </div>
      );

    case "scoreboard":
      return (
        <div className="pv-scoreboard grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p, i) => (
            <div key={p.id} className={`pv-card ${i === popularIndex ? "pv-star" : ""}`}>
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.3em] text-[var(--text-secondary)]">WOD · {p.period}</p>
              <p className="pv-clock mt-2">{p.price}</p>
              <h3 className="theme-heading mt-3 text-2xl text-[var(--text-primary)]">{p.name}</h3>
              <Features items={p.features} className="mt-4" />
              <Cta href={href} label={ctaLabel} className="mt-6 w-full" />
            </div>
          ))}
        </div>
      );

    case "fight-card":
      return (
        <div className="pv-fight mx-auto max-w-3xl space-y-5">
          {plans.map((p, i) => {
            const main = i === popularIndex || plans.length === 1;
            return (
              <div key={p.id} className={`${main ? "pv-main p-8 text-center" : "rounded border border-white/15 bg-white/5 p-5"} `}>
                {main && <p className="pv-vs text-xs">★ MAIN EVENT ★</p>}
                <h3 className={`theme-heading text-[var(--text-primary)] ${main ? "mt-2 text-5xl" : "text-2xl"}`}>{p.name}</h3>
                <p className="mt-2 text-[var(--brand)]"><span className={`theme-heading ${main ? "text-4xl" : "text-2xl"}`}>{p.price}</span> <span className="text-xs uppercase tracking-widest">{p.period}</span></p>
                {main && <Features items={p.features} className="mx-auto mt-5 inline-block text-left" />}
                <div className="mt-5"><Cta href={href} label={ctaLabel} /></div>
              </div>
            );
          })}
        </div>
      );

    case "soft-cards":
      return (
        <div className="pv-soft grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p, i) => (
            <div key={p.id} className={`pv-card flex flex-col p-8 text-center ${i === popularIndex ? "pv-star" : ""}`}>
              <h3 className="theme-heading text-2xl text-[var(--text-primary)]">{p.name}</h3>
              <p className="mt-4 text-4xl font-light text-[var(--text-primary)]">{p.price}</p>
              <p className="mb-5 text-xs tracking-widest text-[var(--text-secondary)]">{p.period}</p>
              <Features items={p.features} className="mx-auto mb-6 text-left" />
              <Cta href={href} label={ctaLabel} className="mt-auto" />
            </div>
          ))}
        </div>
      );

    case "bento-tiles":
      return (
        <div className="pv-bento">
          {plans.map((p, i) => (
            <div key={p.id} className={`pv-tile ${i === popularIndex ? "pv-star" : ""}`}>
              <p className="text-xs font-semibold uppercase tracking-widest opacity-70">{p.period}</p>
              <h3 className="theme-heading mt-1 text-xl">{p.name}</h3>
              <p className="my-3 text-4xl font-extrabold tracking-tight">{p.price}</p>
              {p.description && <p className="mb-3 text-sm opacity-80">{p.description}</p>}
              <Features items={i === popularIndex ? p.features : p.features.slice(0, 3)} className="mb-5" />
              <Cta href={href} label={ctaLabel} />
            </div>
          ))}
        </div>
      );

    case "engraved":
      return (
        <div className="pv-engraved mx-auto max-w-3xl">
          {plans.map((p) => (
            <div key={p.id} className="pv-line">
              <div>
                <h3 className="theme-heading text-3xl text-[var(--brand)]">{p.name}</h3>
                {p.description && <p className="mt-1 max-w-md text-sm italic text-[var(--text-secondary)]">{p.description}</p>}
                <Features items={p.features.slice(0, 4)} className="mt-3 text-[var(--text-secondary)]" />
              </div>
              <div className="text-right">
                <p className="theme-heading text-3xl text-[var(--text-primary)]">{p.price}</p>
                <p className="mb-3 text-[0.65rem] uppercase tracking-[0.3em] text-[var(--text-secondary)]">{p.period}</p>
                <Cta href={href} label={ctaLabel} />
              </div>
            </div>
          ))}
        </div>
      );

    case "hud-cards":
      return (
        <div className="pv-hud grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p, i) => (
            <div key={p.id} className="pv-card">
              <p className="text-[0.65rem] uppercase tracking-[0.35em] text-[var(--brand-2,var(--brand))]">{`// ${String(i + 1).padStart(2, "0")} · ${p.period}`}</p>
              <h3 className="theme-heading mt-2 text-xl text-[var(--text-primary)]">{p.name}</h3>
              <p className="pv-price my-3 text-3xl">{p.price}</p>
              <Features items={p.features} className="mb-5" />
              <Cta href={href} label={ctaLabel} className="w-full" />
            </div>
          ))}
        </div>
      );

    case "stickers":
      return (
        <div className="pv-stickers grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p, i) => (
            <div key={p.id} className="pv-card">
              <span className="pv-tag">{i === popularIndex ? "Le plus pris" : p.period}</span>
              <h3 className="theme-heading mt-3 text-3xl text-[var(--text-primary)]">{p.name}</h3>
              <p className="theme-heading my-2 text-5xl text-[var(--brand)]">{p.price}</p>
              <Features items={p.features} className="mb-5" />
              <Cta href={href} label={ctaLabel} className="w-full" />
            </div>
          ))}
        </div>
      );

    case "typographic":
      return (
        <div className="pv-typo mx-auto max-w-4xl overflow-x-auto">
          <table>
            <thead>
              <tr><th>Formule</th><th>Inclus</th><th style={{ textAlign: "right" }}>Tarif</th><th /></tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className="theme-heading text-2xl sm:text-3xl">{p.name}</td>
                  <td className="text-sm opacity-75">{p.features.slice(0, 3).join(" · ") || p.description || "—"}</td>
                  <td className="whitespace-nowrap text-right"><span className="theme-heading text-2xl">{p.price}</span><br /><span className="text-xs uppercase tracking-widest opacity-60">{p.period}</span></td>
                  <td className="text-right"><Cta href={href} label={ctaLabel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return (
        <PlanRowList>
          {plans.map((p, i) => (
            <PlanRowCard
              key={p.id}
              name={p.name}
              description={p.description}
              features={p.features}
              price={p.price}
              period={p.period}
              highlighted={i === popularIndex}
              badge="Offre la plus prisée"
              action={{ href, label: ctaLabel }}
            />
          ))}
        </PlanRowList>
      );
  }
}
