"use client";

// Owner / admin dashboard. All numbers come from GET /api/admin/dashboard (real database
// aggregates, scoped to the authenticated club on the server). ADMIN accounts receive no
// financial fields, so the revenue widgets are simply not rendered for them.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Users, CalendarCheck, Hourglass, Wallet, UserPlus, UserX, ArrowRight, ArrowUpRight, ArrowDownRight,
  CalendarPlus, CreditCard, FileBarChart, UserCog, BookOpen, Activity, ShieldCheck, Globe, Smartphone,
  Mail, Link2, Palette, AlertCircle, RefreshCw, TrendingUp, Zap, CheckCircle2, AlertTriangle, XCircle, Hand,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useClubSettings } from "@/context/ClubSettingsContext";
import { useToast } from "@/components/ui/Toast";
import Tooltip from "@/components/ui/Tooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { BarChart, LineAreaChart, Sparkline, type ChartPoint } from "@/components/admin/dashboard/charts";
import { formatMembershipPrice } from "@/lib/payment-currencies";
import { getTheme, SELECTABLE_THEME_PRESETS } from "@/lib/website-themes";
import type { ActivityKind, DashboardPayload, HealthItem, HealthKey, RangeKey } from "@/lib/dashboard-stats";

const RANGES: Array<{ key: RangeKey; label: string; long: string }> = [
  { key: "7d", label: "7j", long: "7 derniers jours" },
  { key: "30d", label: "30j", long: "30 derniers jours" },
  { key: "90d", label: "90j", long: "90 derniers jours" },
  { key: "12m", label: "1 an", long: "12 derniers mois" },
];

const nf = (n: number) => n.toLocaleString("fr-FR");

function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `il y a ${d} j` : new Date(iso).toLocaleDateString("fr-FR");
}

// ─── Stat card ──────────────────────────────────────────────────────────────
function StatCard({
  title, value, hint, icon: Icon, tint, href, trend, spark, tooltip,
}: {
  title: string; value: string; hint?: string; icon: React.ElementType; tint: string; href: string;
  trend?: number | null; spark?: number[]; tooltip: string;
}) {
  return (
    <Tooltip label={tooltip} side="bottom" className="block">
      <Link href={href} className={`dash-stat stat-tint-${tint} block w-full p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]`}>
        <div className="flex items-start justify-between gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "rgb(var(--tint) / 0.18)", color: "rgb(var(--tint))" }}>
            <Icon size={20} aria-hidden />
          </span>
          {trend !== undefined && trend !== null && (
            <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${trend >= 0 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>
              {trend >= 0 ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownRight size={12} aria-hidden />}
              {trend >= 0 ? "+" : ""}{trend}%
              <span className="sr-only"> par rapport à la période précédente</span>
            </span>
          )}
        </div>
        <p className="mt-3 text-2xl font-extrabold tracking-tight text-primary">{value}</p>
        <p className="text-xs font-medium text-muted">{title}</p>
        {hint && <p className="mt-0.5 text-[11px] text-muted opacity-80">{hint}</p>}
        {spark && spark.length > 1 && <Sparkline values={spark} className="mt-2 h-6 w-full" color="rgb(var(--tint))" />}
      </Link>
    </Tooltip>
  );
}

// ─── Loading skeleton ───────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Chargement du tableau de bord">
      <Skeleton className="h-32 w-full" rounded="rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-32" rounded="rounded-2xl" />)}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Skeleton className="h-80" rounded="rounded-2xl" />
        <Skeleton className="h-80" rounded="rounded-2xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-60" rounded="rounded-2xl" />
        <Skeleton className="h-60" rounded="rounded-2xl" />
      </div>
    </div>
  );
}

// ─── Activity ───────────────────────────────────────────────────────────────
const ACTIVITY_ICON: Record<ActivityKind, { icon: React.ElementType; tint: string }> = {
  registration: { icon: UserPlus, tint: "text-emerald-500 bg-emerald-500/15" },
  booking: { icon: CalendarCheck, tint: "text-sky-500 bg-sky-500/15" },
  subscription: { icon: CreditCard, tint: "text-violet-500 bg-violet-500/15" },
  renewal: { icon: RefreshCw, tint: "text-teal-500 bg-teal-500/15" },
  payment: { icon: Wallet, tint: "text-amber-500 bg-amber-500/15" },
  notification: { icon: AlertCircle, tint: "text-rose-500 bg-rose-500/15" },
};

// ─── Health ─────────────────────────────────────────────────────────────────
const HEALTH_ICON: Record<HealthKey, React.ElementType> = { website: Globe, mobile: Smartphone, payments: CreditCard, email: Mail, domain: Link2 };
const HEALTH_HREF: Record<HealthKey, string> = { website: "/admin/website-setup", mobile: "/download", payments: "/admin/billing", email: "/admin/settings", domain: "/admin/services" };
const HEALTH_STYLE = {
  ok: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 },
  warn: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", Icon: AlertTriangle },
  error: { dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", Icon: XCircle },
} as const;

function HealthTile({ item, ownerOnly }: { item: HealthItem; ownerOnly: boolean }) {
  const Icon = HEALTH_ICON[item.key];
  const st = HEALTH_STYLE[item.status];
  const inner = (
    <>
      <span className="relative grid h-11 w-11 place-items-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
        <Icon size={20} aria-hidden />
        <span className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg-card)] ${st.dot}`} aria-hidden />
      </span>
      <span className="text-sm font-semibold text-primary">{item.label}</span>
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${st.text}`}><st.Icon size={12} aria-hidden />{item.detail}</span>
    </>
  );
  const cls = "flex flex-col items-center gap-1.5 rounded-xl p-3 text-center transition hover:bg-[var(--primary)]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]";
  // Health tiles that point at owner-only pages are plain tiles for ADMIN accounts.
  const href = HEALTH_HREF[item.key];
  const restricted = !ownerOnly && item.key !== "mobile" && item.key !== "website";
  return restricted ? <div className={cls}>{inner}</div> : <Link href={href} className={cls}>{inner}</Link>;
}

// ─── Main ───────────────────────────────────────────────────────────────────
type Metric = "members" | "revenue" | "reservations";

export default function DashboardView() {
  const { user } = useAuth();
  const { name: clubName, themeId } = useClubSettings();
  const toast = useToast();
  const [range, setRange] = useState<RangeKey>("30d");
  const [metric, setMetric] = useState<Metric>("members");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async (r: RangeKey, manual = false) => {
    const id = ++reqId.current;
    setError(null);
    if (manual) setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/dashboard?range=${r}`, { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (id !== reqId.current) return; // a newer request superseded this one
      if (!res.ok || !json) throw new Error(json?.error || "Impossible de charger le tableau de bord.");
      setData(json as DashboardPayload);
      if (manual) toast.success("Tableau de bord actualisé");
    } catch (e) {
      if (id !== reqId.current) return;
      const msg = e instanceof Error ? e.message : "Impossible de contacter le serveur.";
      setError(msg);
      if (manual) toast.error(msg);
    } finally {
      if (id === reqId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [toast]);

  useEffect(() => { void load(range); }, [load, range]);

  const isOwner = data?.role === "OWNER";
  const points = useMemo<ChartPoint[]>(() => {
    if (!data) return [];
    const values = metric === "members" ? data.series.members : metric === "revenue" ? data.series.revenue ?? [] : data.series.reservations;
    return data.series.buckets.map((b, i) => ({ label: b.label, fullLabel: b.fullLabel, value: values[i] ?? 0 }));
  }, [data, metric]);
  const cancelPoints = useMemo<ChartPoint[]>(
    () => (data ? data.series.buckets.map((b, i) => ({ label: b.label, fullLabel: b.fullLabel, value: data.series.cancellations[i] ?? 0 })) : []),
    [data]
  );

  if (loading && !data) return <DashboardSkeleton />;
  if (!data) {
    return (
      <div className="mx-auto max-w-md py-16">
        <EmptyState
          icon={AlertCircle}
          title="Le tableau de bord est indisponible"
          description={error ?? "Une erreur est survenue."}
          action={<button type="button" onClick={() => { setLoading(true); void load(range); }} className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--brand-contrast,#fff)]"><RefreshCw size={14} aria-hidden /> Réessayer</button>}
        />
      </div>
    );
  }

  const { stats } = data;
  const firstName = (user?.name ?? "").split(" ")[0] || "";
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const money = (n: number) => formatMembershipPrice(n, data.series.revenueCurrency ?? "TND");
  const fmtMetric = metric === "revenue" ? money : nf;
  const rangeLong = RANGES.find((r) => r.key === range)?.long ?? "";
  const clubActive = data.health.overall !== "error";
  const theme = getTheme(themeId);

  const quickActions = [
    { label: "Ajouter un membre", href: "/admin/members", icon: UserPlus, tint: "text-emerald-500 bg-emerald-500/15" },
    { label: "Ajouter un coach", href: "/admin/staff/coaches", icon: UserCog, tint: "text-sky-500 bg-sky-500/15" },
    { label: "Créer une séance", href: "/admin/schedule", icon: CalendarPlus, tint: "text-violet-500 bg-violet-500/15" },
    ...(isOwner ? [{ label: "Créer une formule", href: "/admin/plans", icon: CreditCard, tint: "text-amber-500 bg-amber-500/15" }] : []),
    { label: "Gérer les réservations", href: "/admin/bookings", icon: BookOpen, tint: "text-teal-500 bg-teal-500/15" },
    { label: "Voir les rapports", href: "/admin/reports", icon: FileBarChart, tint: "text-rose-500 bg-rose-500/15" },
  ];

  const tabs: Array<{ id: Metric; label: string }> = [
    { id: "members", label: "Croissance des membres" },
    ...(isOwner ? [{ id: "revenue" as Metric, label: "Revenus" }] : []),
    { id: "reservations", label: "Réservations" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome */}
      <section className="dash-hero p-5 sm:p-7" aria-labelledby="dash-welcome">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)]/15 px-3 py-1 text-xs font-semibold text-[var(--primary)]">
              Bienvenue{firstName ? `, ${firstName}` : ""} <Hand size={12} aria-hidden />
            </span>
            <h1 id="dash-welcome" className="mt-3 text-2xl font-extrabold tracking-tight text-primary sm:text-3xl">
              {clubName || data.club.name || "Votre club"} <span className="text-[var(--primary)]">en un coup d&apos;œil</span>
            </h1>
            <p className="mt-1 text-sm text-muted">{isOwner ? "Pilotez votre club : membres, réservations, abonnements et revenus." : "Suivez l'activité opérationnelle de votre club."}</p>
          </div>
          <div className="flex flex-col items-start gap-2 rounded-xl border border-[var(--border-light)] bg-[var(--bg-card)]/70 px-4 py-3 text-sm backdrop-blur sm:items-end">
            <span className="capitalize text-primary">{today}</span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${clubActive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
              <span className={`h-2 w-2 rounded-full ${clubActive ? "bg-emerald-500" : "bg-rose-500"}`} aria-hidden /> {clubActive ? "Club actif" : "Club suspendu"}
            </span>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <span>Les données affichées peuvent être obsolètes : {error}</span>
          <button type="button" onClick={() => void load(range, true)} className="font-semibold underline">Réessayer</button>
        </div>
      )}

      {/* KPIs */}
      <section aria-label="Indicateurs clés" className={`grid gap-4 sm:grid-cols-2 ${isOwner ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
        <StatCard title="Membres actifs" value={nf(stats.activeMembers)} hint={`sur ${nf(stats.totalMembers)} inscrits`} icon={Users} tint="green" href="/admin/members?status=active" trend={stats.newMembersGrowthPct} spark={data.series.members} tooltip="Membres dont le compte est actif" />
        <StatCard title="Réservations aujourd'hui" value={nf(stats.todayReservations)} hint={stats.todaySessions ? `${nf(stats.todaySessions)} séance${stats.todaySessions > 1 ? "s" : ""} · ${nf(stats.todayCapacity)} places` : "Aucune séance aujourd'hui"} icon={CalendarCheck} tint="purple" href="/admin/bookings" tooltip="Réservations confirmées pour les séances du jour (heure du club)" />
        <StatCard title="Abonnements en attente" value={nf(stats.pendingSubscriptions)} hint={stats.pendingSubscriptions ? "À valider" : "Tout est à jour"} icon={Hourglass} tint="amber" href="/admin/subscriptions?status=PENDING" tooltip="Abonnements en attente de validation de paiement" />
        {isOwner && stats.revenueMonth && (
          <StatCard title="Chiffre d'affaires du mois" value={formatMembershipPrice(stats.revenueMonth.amount, stats.revenueMonth.currency)} hint={stats.revenueMonth.otherCurrencies.length ? `+ ${stats.revenueMonth.otherCurrencies.map((c) => formatMembershipPrice(c.amount, c.currency)).join(" · ")}` : "vs mois précédent"} icon={Wallet} tint="blue" href="/admin/payments" trend={stats.revenueMonth.trendPct} spark={data.series.revenue} tooltip="Paiements encaissés ce mois-ci" />
        )}
        <StatCard title="Nouveaux membres" value={nf(stats.newMembersThisMonth)} hint="ce mois-ci" icon={UserPlus} tint="teal" href="/admin/members" tooltip="Inscriptions depuis le début du mois" />
        <StatCard title="Abonnements expirés" value={nf(stats.expiredMemberships)} hint="membres sans abonnement actif" icon={UserX} tint="rose" href="/admin/subscriptions" tooltip="Membres dont l'abonnement est terminé et qui n'en ont pas de nouveau" />
      </section>

      {/* Analytics + quick actions */}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="dash-card p-5" aria-labelledby="analytics-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-[var(--primary)]" aria-hidden />
              <h2 id="analytics-h" className="font-semibold text-primary">Analytique</h2>
              {refreshing && <RefreshCw size={13} className="animate-spin text-muted" aria-label="Actualisation" />}
            </div>
            <div className="flex gap-1" role="group" aria-label="Période">
              {RANGES.map((r) => (
                <button key={r.key} type="button" className="dash-chip" aria-pressed={range === r.key} onClick={() => setRange(r.key)} title={r.long}>{r.label}</button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label="Indicateur">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={metric === t.id} aria-pressed={metric === t.id} className="dash-chip" onClick={() => setMetric(t.id)}>{t.label}</button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            {metric === "members" && `Membres inscrits cumulés — ${rangeLong}. +${nf(data.series.newMembers.reduce((a, b) => a + b, 0))} sur la période.`}
            {metric === "revenue" && `Revenus encaissés (${data.series.revenueCurrency ?? "TND"}) — ${rangeLong}.`}
            {metric === "reservations" && `Réservations créées (barres) et annulations — ${rangeLong}.`}
          </p>
          <div className="mt-2 text-primary">
            {points.every((p) => p.value === 0) && metric !== "members" ? (
              <EmptyState icon={TrendingUp} title="Pas encore de données sur cette période" description="Les chiffres apparaîtront ici dès les premières activités." className="my-6" />
            ) : metric === "reservations" ? (
              <BarChart points={points} unit="réservations" color="var(--primary)" secondary={{ points: cancelPoints, color: "#f43f5e", name: "annulations" }} />
            ) : (
              <LineAreaChart points={points} unit={metric === "revenue" ? data.series.revenueCurrency ?? "TND" : "membres"} format={fmtMetric} />
            )}
          </div>
          {metric === "reservations" && (
            <p className="mt-2 flex items-center gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--primary)]" aria-hidden />Réservations</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-500" aria-hidden />Annulations</span>
            </p>
          )}

          {/* Subscription performance */}
          <div className="mt-6 border-t border-[var(--border-light)] pt-4">
            <h3 className="text-sm font-semibold text-primary">Performance des formules</h3>
            {data.subscriptionPerformance.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Aucun abonnement vendu ou actif pour l&apos;instant.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {data.subscriptionPerformance.slice(0, 6).map((p) => {
                  const max = Math.max(1, ...data.subscriptionPerformance.map((x) => x.sold));
                  return (
                    <li key={p.planId} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-medium text-primary">{p.name}</span>
                        <span className="shrink-0 text-xs text-muted">{p.sold} vendu{p.sold > 1 ? "s" : ""} · {p.active} actif{p.active > 1 ? "s" : ""}{p.revenue !== undefined && ` · ${money(p.revenue)}`}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--border-light)]"><div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.round((p.sold / max) * 100)}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="dash-card p-5" aria-labelledby="qa-h">
          <div className="flex items-center gap-2"><Zap size={18} className="text-[var(--primary)]" aria-hidden /><h2 id="qa-h" className="font-semibold text-primary">Actions rapides</h2></div>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {quickActions.map((a) => (
              <Link key={a.label} href={a.href} className="group flex min-h-[56px] items-center gap-3 rounded-xl border border-[var(--border-light)] p-3 transition hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${a.tint}`}><a.icon size={18} aria-hidden /></span>
                <span className="text-sm font-medium text-primary">{a.label}</span>
                <ArrowRight size={14} className="ml-auto text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
              </Link>
            ))}
          </div>
          {data.stats.pendingSubscriptions > 0 && (
            <Link href="/admin/subscriptions?status=PENDING" className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-300">
              <span>{data.stats.pendingSubscriptions} abonnement{data.stats.pendingSubscriptions > 1 ? "s" : ""} à valider</span><ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </section>
      </div>

      {/* Activity + health */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="dash-card p-5" aria-labelledby="act-h">
          <div className="flex items-center justify-between">
            <h2 id="act-h" className="flex items-center gap-2 font-semibold text-primary"><Activity size={18} className="text-[var(--primary)]" aria-hidden />Activité récente</h2>
            <Link href="/admin/logs" className={`text-xs font-medium text-[var(--primary)] hover:underline ${isOwner ? "" : "hidden"}`}>Voir tout</Link>
          </div>
          {data.activity.length === 0 ? (
            <EmptyState icon={Activity} title="Aucune activité pour l'instant" description="Les inscriptions, réservations et paiements apparaîtront ici." className="mt-4" action={<Link href="/admin/members" className="text-sm font-semibold text-[var(--primary)] hover:underline">Ajouter un premier membre</Link>} />
          ) : (
            <ul className="mt-3 divide-y divide-[var(--border-light)]">
              {data.activity.map((a) => {
                const k = ACTIVITY_ICON[a.kind];
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${k.tint}`}><k.icon size={16} aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-primary">{a.title}</p>
                      <p className="truncate text-xs text-muted">{a.subtitle}</p>
                    </div>
                    <time dateTime={a.at} className="shrink-0 text-[11px] text-muted">{timeAgo(a.at)}</time>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="dash-card p-5" aria-labelledby="health-h">
            <div className="flex items-center justify-between">
              <h2 id="health-h" className="flex items-center gap-2 font-semibold text-primary"><ShieldCheck size={18} className="text-[var(--primary)]" aria-hidden />État de votre club</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${data.health.overall === "ok" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : data.health.overall === "warn" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>
                {data.health.overall === "ok" ? "Tout fonctionne" : data.health.overall === "warn" ? "À vérifier" : "Action requise"}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-5">
              {data.health.items.map((it) => <HealthTile key={it.key} item={it} ownerOnly={isOwner} />)}
            </div>
          </section>

          {isOwner && (
            <section className="dash-card p-5" aria-labelledby="theme-h">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="theme-h" className="flex items-center gap-2 font-semibold text-primary"><Palette size={18} className="text-[var(--primary)]" aria-hidden />Thème du site</h2>
                  <p className="mt-0.5 text-xs text-muted">Actuel : <strong className="text-primary">{theme.name}</strong> · {SELECTABLE_THEME_PRESETS.filter((t) => t.flagship).length} thèmes disponibles</p>
                </div>
                <Link href="/admin/appearance" className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--primary)] px-3.5 py-2 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)]/10">Choisir un thème <ArrowRight size={13} aria-hidden /></Link>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {SELECTABLE_THEME_PRESETS.filter((t) => t.flagship).map((t) => (
                  <Tooltip key={t.id} label={t.name}>
                    <Link href="/admin/appearance" aria-label={`Thème ${t.name}`} className={`h-12 w-16 shrink-0 rounded-lg border-2 ${t.id === theme.id ? "border-[var(--primary)]" : "border-transparent"}`} style={{ background: `linear-gradient(135deg, ${t.previewBg} 55%, ${t.primaryColor} 56%)` }} />
                  </Tooltip>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {isOwner && data.saasPlan && <PlanWidget plan={data.saasPlan} />}
    </div>
  );
}

function PlanWidget({ plan }: { plan: NonNullable<DashboardPayload["saasPlan"]> }) {
  const rows = [
    { label: "Membres actifs", used: plan.usage.members, limit: plan.limits.maxMembers },
    { label: "Coachs", used: plan.usage.coaches, limit: plan.limits.maxCoaches },
    { label: "Admins", used: plan.usage.admins, limit: plan.limits.maxAdmins },
  ].filter((r) => r.limit !== undefined);
  return (
    <section className="dash-card p-5" aria-labelledby="plan-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="plan-h" className="font-semibold text-primary">Votre plan ClubX · {plan.name}</h2>
        <Link href="/admin/billing" className="text-xs font-semibold text-[var(--primary)] hover:underline">Gérer mon abonnement →</Link>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        {rows.map((r) => {
          const pct = r.limit > 0 ? Math.min(100, Math.round((r.used / r.limit) * 100)) : 0;
          return (
            <div key={r.label} className="text-xs text-muted">
              <div className="flex justify-between"><span>{r.label}</span><span className={pct >= 90 ? "font-semibold text-rose-500" : ""}>{r.used} / {r.limit === -1 ? "∞" : r.limit}</span></div>
              {r.limit !== -1 && <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--border-light)]"><div className={`h-full rounded-full ${pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-[var(--primary)]"}`} style={{ width: `${pct}%` }} /></div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
