"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, BarChart3, Bell, CalendarCheck, Dumbbell, RefreshCw, ShieldCheck, Target, Trophy } from "lucide-react";

import { Skeleton } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import MembershipCard from "@/components/dashboard/MembershipCard";
import NotificationList from "@/components/dashboard/NotificationList";
import { ActivityChart, ProgressRing, type ActivityPoint } from "@/components/member/charts";
import { ACTIVITY_LABELS, KpiCard, MobileAppPromo, NewsCard, NextSessionCard, OffersCard, type NextSession, type PlanSummary } from "@/components/member/DashboardWidgets";

type Range = "7d" | "30d" | "3m" | "1y";
const RANGES: { key: Range; label: string }[] = [
  { key: "7d", label: "7j" }, { key: "30d", label: "30j" }, { key: "3m", label: "3 mois" }, { key: "1y", label: "1 an" },
];

interface DashboardData {
  userName: string;
  stats: { totalBookings: number; completedAttendances: number; membershipStatus: "Active" | "Inactive"; daysUntilExpiry: number | null; planName: string | null };
  upcomingSession: NextSession | null;
  weeklyActivity: number[];
  recentAttendances: { id: string; activity: string | null; checkInTime: string }[];
  // Additive fields — absent on an older server, so every use below is guarded.
  unreadNotifications?: number;
  weekly?: { start: string; end: string; reserved: number; attended: number };
  trends?: {
    reservations: { last30: number; previous30: number; percent: number | null };
    attendanceRate30: number | null;
    sparks: { reservations: number[]; attendances: number[]; notifications: number[] };
  };
  membership?: { planName: string | null; elapsedPercent: number | null };
  activity?: Record<Range, ActivityPoint[]>;
  plans?: PlanSummary[];
  latestPost?: { id: string; title: string | null; excerpt: string; createdAt: string } | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const { userRole, logout } = useAuth();
  const isCoach = userRole?.toUpperCase() === "COACH";
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("7d");

  const fetchDashboard = useCallback(async (signal?: AbortSignal) => {
    // Hard stop so a slow/hung API can never leave the page on the skeleton:
    // after 15s the user gets the error state with a retry button instead.
    const timeoutCtl = new AbortController();
    const timer = window.setTimeout(() => timeoutCtl.abort(), 15000);
    signal?.addEventListener("abort", () => timeoutCtl.abort(), { once: true });
    try {
      const res = await fetch("/api/dashboard", { credentials: "include", cache: "no-store", signal: timeoutCtl.signal });
      if (res.status === 401) {
        // Session expired/revoked while the page was open: go to the login page.
        void logout({ redirectTo: "/user/login" });
        return;
      }
      const json = await res.json().catch(() => null);
      if (signal?.aborted) return;
      if (res.ok && json) {
        setData(json);
        setError(null);
      } else {
        setError(json?.error || "Impossible de charger votre tableau de bord.");
      }
    } catch {
      if (signal?.aborted) return; // unmounted — nothing to update
      setError(timeoutCtl.signal.aborted ? "Le serveur met trop de temps à répondre." : "Connexion impossible. Vérifiez votre réseau.");
    } finally {
      window.clearTimeout(timer);
      if (!signal?.aborted) setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    // Coaches have their own dedicated dashboard (their schedule + attendance tools).
    if (isCoach) {
      router.replace("/dashboard/coach");
      return;
    }
    const controller = new AbortController();
    fetchDashboard(controller.signal);
    return () => controller.abort();
  }, [isCoach, router, fetchDashboard]);

  if (isCoach || loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Chargement du tableau de bord">
        <Skeleton className="h-52" rounded="rounded-3xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" rounded="rounded-2xl" />)}</div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" rounded="rounded-2xl" />
          <Skeleton className="h-80" rounded="rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto mt-10 max-w-md">
        <EmptyState
          icon={AlertTriangle}
          title="Impossible d’afficher votre tableau de bord"
          description={error || "Une erreur est survenue. Vos données sont intactes."}
          action={
            <button onClick={() => { setLoading(true); setError(null); void fetchDashboard(); }} className="mx-cta px-5 py-2.5 text-sm">
              <RefreshCw size={15} aria-hidden /> Réessayer
            </button>
          }
        />
      </div>
    );
  }

  const firstName = data.userName.split(" ")[0];
  const active = data.stats.membershipStatus === "Active";
  const weekly = data.weekly;
  const weeklyPct = weekly && weekly.reserved > 0 ? Math.min(100, Math.round((weekly.attended / weekly.reserved) * 100)) : null;
  const trend = data.trends?.reservations;
  const points = data.activity?.[range] ?? [];
  const hasActivity = points.some((p) => p.reservations > 0 || p.attendances > 0);
  const unread = data.unreadNotifications ?? 0;
  const expiringSoon = active && data.stats.daysUntilExpiry !== null && data.stats.daysUntilExpiry <= 7;

  return (
    <div className="space-y-6">
      {(!active || expiringSoon) && (
        <Link href="/dashboard/membership" className="flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 transition-colors hover:bg-amber-500/15 dark:text-amber-300">
          <AlertTriangle size={18} className="shrink-0" aria-hidden />
          <span className="flex-1">
            {!active
              ? "Votre adhésion n’est pas active. Renouvelez-la pour continuer à réserver vos séances."
              : `Votre adhésion expire dans ${data.stats.daysUntilExpiry} jour${data.stats.daysUntilExpiry === 1 ? "" : "s"}.`}
          </span>
          <span className="font-semibold underline">Voir mon abonnement</span>
        </Link>
      )}

      {/* Welcome banner + weekly progress */}
      <section className="mx-hero mx-rise grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center" aria-label="Bienvenue">
        <Dumbbell aria-hidden className="mx-hero-mask pointer-events-none absolute right-[20%] top-1/2 hidden h-64 w-64 -translate-y-1/2 -rotate-12 text-[var(--primary)] opacity-15 md:block" strokeWidth={1.2} />
        <div>
          <h1 className="text-3xl font-extrabold text-primary sm:text-4xl">
            Bonjour <span className="text-[var(--primary)]">{firstName}</span> <span aria-hidden>👋</span>
          </h1>
          <p className="mt-2 text-base font-semibold text-primary">Bienvenue sur votre espace.</p>
          <p className="mt-1 max-w-lg text-sm text-muted">Restez actif, atteignez vos objectifs et profitez de votre club !</p>
          <Link href="/dashboard/schedule" className="mx-cta mt-5 px-5 py-2.5 text-sm">Voir mon planning <ArrowRight size={16} aria-hidden /></Link>
        </div>
        <div className="flex flex-col items-center gap-2 text-center md:pr-4">
          <ProgressRing value={weeklyPct}>
            <span className="text-2xl font-extrabold text-primary">{weeklyPct === null ? "—" : `${weeklyPct}%`}</span>
          </ProgressRing>
          <p className="text-sm font-semibold text-primary">Séances de la semaine</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <BarChart3 size={14} className="text-[var(--primary)]" aria-hidden />
            {weekly && weekly.reserved > 0 ? `${weekly.attended} / ${weekly.reserved} effectuée${weekly.attended > 1 ? "s" : ""}` : "Aucune séance réservée"}
          </p>
        </div>
      </section>

      {/* KPIs — every figure comes from the member's own records */}
      <section aria-label="Indicateurs" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={1} tint="green" icon={CalendarCheck} title="Mes réservations" href="/dashboard/bookings"
          value={data.stats.totalBookings}
          badge={trend?.percent != null ? { label: `${trend.percent > 0 ? "+" : ""}${trend.percent}%`, direction: trend.percent >= 0 ? "up" : "down" } : trend && trend.last30 > 0 ? { label: `${trend.last30} ce mois` } : null}
          spark={data.trends?.sparks.reservations}
        />
        <KpiCard
          index={2} tint="blue" icon={ShieldCheck} title="Mon adhésion" href="/dashboard/membership"
          value={active ? "Actif" : "Inactif"}
          badge={{ label: active ? (data.stats.daysUntilExpiry !== null ? `Expire dans ${data.stats.daysUntilExpiry} j` : "En cours") : "À renouveler" }}
          footer={
            <div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Période d’adhésion écoulée" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.membership?.elapsedPercent ?? 0}>
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${data.membership?.elapsedPercent ?? 0}%` }} />
              </div>
              <p className="mt-1 truncate text-[11px] text-muted">{data.stats.planName ?? "Aucune formule active"}</p>
            </div>
          }
        />
        <KpiCard
          index={3} tint="purple" icon={Bell} title="Notifications" href="/dashboard/notifications"
          value={unread}
          badge={{ label: unread > 0 ? "Nouvelles" : "Tout est lu" }}
          spark={data.trends?.sparks.notifications}
        />
        <KpiCard
          index={4} tint="gold" icon={Trophy} title="Assiduité (30 j)"
          value={data.trends?.attendanceRate30 != null ? `${data.trends.attendanceRate30}%` : "—"}
          badge={data.trends?.attendanceRate30 == null ? { label: "Pas encore de séance passée" } : null}
          spark={data.trends?.sparks.attendances}
          footer={<p className="text-[11px] text-muted">{data.stats.completedAttendances} présence{data.stats.completedAttendances > 1 ? "s" : ""} au total</p>}
        />
      </section>

      {/* Activity + next session */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="mx-card p-5 lg:col-span-2" aria-labelledby="activity-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="activity-title" className="flex items-center gap-2 text-lg font-bold text-primary"><BarChart3 size={20} className="text-[var(--primary)]" aria-hidden /> Activité globale</h2>
            <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1" role="group" aria-label="Période">
              {RANGES.map((r) => (
                <button key={r.key} type="button" onClick={() => setRange(r.key)} aria-pressed={range === r.key} className="mx-chip">{r.label}</button>
              ))}
            </div>
          </div>
          {hasActivity ? (
            <>
              <ActivityChart points={points} />
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-[var(--primary)]" />Réservations</span>
                <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-blue-400" />Présences</span>
              </div>
            </>
          ) : (
            <EmptyState icon={Target} title="Pas encore d’activité sur cette période" description="Réservez une séance : vos réservations et présences apparaîtront ici." action={<Link href="/dashboard/schedule" className="mx-cta px-4 py-2 text-sm">Réserver une séance</Link>} />
          )}
        </section>
        <NextSessionCard session={data.upcomingSession} />
      </div>

      {/* Membership pass, offers, news, app */}
      <div className="grid gap-6 lg:grid-cols-3">
        <MembershipCard planName={data.stats.planName} daysUntilExpiry={data.stats.daysUntilExpiry} isActive={active} />
        <div className="lg:col-span-2"><OffersCard plans={data.plans ?? []} currentPlan={active ? data.stats.planName : null} /></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <NewsCard post={data.latestPost ?? null} />
        <MobileAppPromo />
      </div>

      {data.recentAttendances.length > 0 && (
        <section className="mx-card p-5" aria-labelledby="recent-title">
          <h2 id="recent-title" className="mb-3 text-lg font-bold text-primary">Présences récentes</h2>
          <ul>
            {data.recentAttendances.map((a) => (
              <li key={a.id} className="flex items-center justify-between border-b border-border py-2.5 last:border-0">
                <span className="text-sm text-primary">{a.activity ? ACTIVITY_LABELS[a.activity] ?? a.activity : "Présence libre"}</span>
                <span className="text-xs text-muted">{new Date(a.checkInTime).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <NotificationList />
    </div>
  );
}
