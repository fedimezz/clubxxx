"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, CalendarDays, CalendarX, Clock, MapPin, Megaphone, Smartphone, Star, UserRound } from "lucide-react";
import { Sparkline } from "@/components/member/charts";
import { formatDayShort, type IsoDate } from "@/lib/calendar-nav";

export const ACTIVITY_LABELS: Record<string, string> = {
  BODYBUILDING: "Musculation", FITNESS: "Fitness", CARDIO: "Cardio", CROSSFIT: "CrossFit", YOGA: "Yoga", PILATES: "Pilates",
  BOXE: "Boxe", MMA: "MMA", AQUAGYM: "Aquagym", PADEL: "Padel", ZUMBA: "Zumba", SPINNING: "Spinning",
};

// ── KPI card ──────────────────────────────────────────────────────────────────────────────────
export function KpiCard({
  tint, icon: Icon, title, value, badge, spark, href, footer, index = 0,
}: {
  tint: "green" | "blue" | "purple" | "gold";
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  title: string;
  value: React.ReactNode;
  badge?: { label: string; direction?: "up" | "down" } | null;
  spark?: number[] | null;
  href?: string;
  footer?: React.ReactNode;
  index?: number;
}) {
  const body = (
    <>
      <div className="flex items-start gap-3 p-4 pb-2">
        <span className="mx-kpi-icon"><Icon size={22} aria-hidden /></span>
        <div className="min-w-0">
          <p className="text-sm text-muted">{title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-3xl font-extrabold leading-none text-primary">{value}</span>
            {badge && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[rgb(var(--tint)/0.15)] px-2 py-0.5 text-[11px] font-bold text-[rgb(var(--tint))]">
                {badge.direction === "up" && <ArrowUp size={11} aria-hidden />}
                {badge.direction === "down" && <ArrowDown size={11} aria-hidden />}
                {badge.label}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="h-11 px-1" aria-hidden>{spark ? <Sparkline values={spark} /> : null}</div>
      {footer && <div className="px-4 pb-3 pt-1">{footer}</div>}
    </>
  );
  const cls = `mx-kpi mx-tint-${tint} mx-rise block`;
  const style = { ["--i" as string]: index } as React.CSSProperties;
  return href ? <Link href={href} className={cls} style={style}>{body}</Link> : <div className={cls} style={style}>{body}</div>;
}

// ── Next session ──────────────────────────────────────────────────────────────────────────────
export interface NextSession {
  activity: string; day: string; startTime: string; endTime: string; coach: string; location: string;
  startsAt?: string; date?: string | null; coachPhotoUrl?: string | null;
}

export function CoachAvatar({ name, photoUrl, size = 40 }: { name: string; photoUrl?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const ok = photoUrl && /^https:\/\//.test(photoUrl) && !failed;
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted text-sm font-bold text-primary" style={{ width: size, height: size }}>
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element -- coach photos can be any https host; next/image only allows Cloudinary/Unsplash
        <img src={photoUrl!} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : name.trim() ? (
        name.trim().charAt(0).toUpperCase()
      ) : (
        <UserRound size={size / 2} aria-hidden />
      )}
    </span>
  );
}

function relativeStart(startsAt?: string): string | null {
  if (!startsAt) return null;
  const diff = Date.parse(startsAt) - Date.now();
  if (Number.isNaN(diff) || diff < 0) return null;
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `Dans ${Math.max(mins, 1)} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Dans ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Dans ${days} jour${days > 1 ? "s" : ""}`;
}

export function NextSessionCard({ session }: { session: NextSession | null }) {
  return (
    <section className="mx-card flex h-full flex-col p-5" aria-labelledby="next-session-title">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="next-session-title" className="flex items-center gap-2 text-lg font-bold text-primary">
          <CalendarDays size={20} className="text-[var(--primary)]" aria-hidden /> Prochaine séance
        </h2>
        <Link href="/dashboard/bookings" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline">Voir tout <ArrowRight size={13} aria-hidden /></Link>
      </div>

      {session ? (
        <div className="flex flex-1 flex-col">
          <div className="flex items-start gap-4">
            <CoachAvatar name={session.coach} photoUrl={session.coachPhotoUrl} size={64} />
            <div className="min-w-0">
              <p className="truncate text-xl font-extrabold text-primary">{ACTIVITY_LABELS[session.activity] ?? session.activity}</p>
              {relativeStart(session.startsAt) && <span className="mx-pill mx-pill-ok mt-1">{relativeStart(session.startsAt)}</span>}
            </div>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted"><CalendarDays size={15} aria-hidden /><dt className="sr-only">Date</dt><dd className="capitalize">{session.date ? formatDayShort(session.date as IsoDate) : session.day}</dd></div>
            <div className="flex items-center gap-2 text-muted"><Clock size={15} aria-hidden /><dt className="sr-only">Horaire</dt><dd>{session.startTime} – {session.endTime}</dd></div>
            <div className="flex items-center gap-2 text-muted"><UserRound size={15} aria-hidden /><dt className="sr-only">Coach</dt><dd>Coach : {session.coach}</dd></div>
            <div className="flex items-center gap-2 text-muted"><MapPin size={15} aria-hidden /><dt className="sr-only">Lieu</dt><dd>{session.location}</dd></div>
          </dl>
          <Link href="/dashboard/bookings" className="mx-cta mt-auto w-full px-4 py-3 text-sm">Voir ma réservation <ArrowRight size={15} aria-hidden /></Link>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-muted"><CalendarX size={24} className="text-muted" aria-hidden /></span>
          <p className="text-sm font-semibold text-primary">Aucune séance à venir</p>
          <p className="max-w-xs text-xs text-muted">Choisissez une séance dans le planning de votre club pour la retrouver ici.</p>
          <Link href="/dashboard/schedule" className="mx-cta px-5 py-2.5 text-sm">Voir le planning</Link>
        </div>
      )}
    </section>
  );
}

// ── Offers (the club's real membership plans) ─────────────────────────────────────────────────
export interface PlanSummary { id: string; name: string; price: number | string; currency: string | null; durationDays: number }

export function OffersCard({ plans, currentPlan }: { plans: PlanSummary[]; currentPlan: string | null }) {
  return (
    <section className="mx-card p-5" aria-labelledby="offers-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="offers-title" className="flex items-center gap-2 text-lg font-bold text-primary"><Star size={19} className="text-[var(--primary)]" aria-hidden /> Offres du club</h2>
        <Link href="/dashboard/membership" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline">Voir toutes <ArrowRight size={13} aria-hidden /></Link>
      </div>
      {plans.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Aucune offre publiée pour le moment.</p>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-3">
          {plans.map((p) => {
            const current = currentPlan !== null && p.name === currentPlan;
            return (
              <li key={p.id}>
                <Link href="/dashboard/membership" className={`block h-full rounded-xl border p-3 transition-colors hover:border-[var(--primary)]/60 ${current ? "border-[var(--primary)]/60 bg-[var(--primary)]/10" : "border-border bg-muted/30"}`}>
                  <p className="truncate text-sm font-bold text-primary">{p.name}</p>
                  <p className="mt-1 text-lg font-extrabold text-[var(--primary)]">{Number(p.price)} <span className="text-xs font-semibold">{p.currency ?? "TND"}</span></p>
                  <p className="text-[11px] text-muted">{p.durationDays} jours</p>
                  {current && <span className="mx-pill mx-pill-ok mt-2">Mon offre</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Club news (the latest published announcement) ─────────────────────────────────────────────
export function NewsCard({ post }: { post: { id: string; title: string | null; excerpt: string; createdAt: string } | null }) {
  return (
    <section className="mx-card flex h-full flex-col p-5" aria-labelledby="news-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="news-title" className="flex items-center gap-2 text-lg font-bold text-primary"><Megaphone size={19} className="text-[var(--primary)]" aria-hidden /> Actualités du club</h2>
        <Link href="/dashboard/actualites" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline">Voir tout <ArrowRight size={13} aria-hidden /></Link>
      </div>
      {post ? (
        <Link href="/dashboard/actualites" className="block flex-1 rounded-xl border border-border bg-muted/30 p-4 transition-colors hover:border-[var(--primary)]/50">
          {post.title && <p className="text-sm font-bold text-primary">{post.title}</p>}
          <p className="mt-1 line-clamp-4 text-sm text-muted">{post.excerpt}</p>
          <p className="mt-2 text-[11px] text-muted">{new Date(post.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
        </Link>
      ) : (
        <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted">Aucune actualité publiée pour le moment.</p>
      )}
    </section>
  );
}

// ── Mobile app promo (buttons only appear when a real release exists) ─────────────────────────
interface AppDownload { downloadPageUrl: string; apk: { url: string; version: string } | null; playStoreUrl: string | null }

export function MobileAppPromo() {
  const [info, setInfo] = useState<AppDownload | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/app-download", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j) setInfo(j); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="mx-card relative flex h-full flex-col overflow-hidden p-5" aria-labelledby="app-title"
      style={{ background: "radial-gradient(120% 120% at 100% 100%, rgb(var(--glow) / 0.22), transparent 60%), var(--bg-card)" }}>
      <Smartphone size={92} className="pointer-events-none absolute -bottom-3 -right-2 text-[var(--primary)] opacity-15" aria-hidden />
      <h2 id="app-title" className="text-lg font-bold text-primary">Téléchargez notre application mobile</h2>
      <p className="mt-1 text-sm text-muted">Votre club toujours avec vous : planning, réservations et notifications.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {info?.playStoreUrl && <a href={info.playStoreUrl} rel="noopener noreferrer" className="mx-cta px-4 py-2 text-xs">Google Play</a>}
        {info?.apk && <a href={info.apk.url} rel="noopener noreferrer" className="mx-ghost px-4 py-2 text-xs">APK v{info.apk.version}</a>}
        <Link href="/download" className="mx-ghost px-4 py-2 text-xs">{info?.playStoreUrl || info?.apk ? "Plus d’infos" : "Page de téléchargement"}</Link>
      </div>
    </section>
  );
}
