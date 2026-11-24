// GET /api/admin/dashboard?range=7d|30d|90d|12m
//
// One aggregated, REAL-DATA payload for the owner/admin dashboard (shape: DashboardPayload in
// lib/dashboard-stats.ts). Everything is scoped to the AUTHENTICATED club (auth.user.clubId, which
// the guards re-verify from the database) — the request never supplies a club id. Financial fields
// (revenue, plan revenue, payment activity, SaaS plan, club status) are returned to OWNER only.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { resolveReservationConfig } from "@/lib/reservation-cutoff";
import { tzOffsetMs } from "@/lib/timezone";
import { getAppRelease } from "@/lib/app-release";
import { isStripeConfigured } from "@/lib/payments/availability";
import {
  ACTIVITY_LABELS_FR,
  DAY_LABELS_FR,
  buildBuckets,
  buildPlanPerformance,
  classifySubscriptions,
  countByBucket,
  cumulativeSeries,
  deriveHealth,
  localDayOfWeek,
  localMonthStart,
  localWeekMonday,
  mergeActivity,
  parseRange,
  percentChange,
  pickPrimaryCurrency,
  sumByBucket,
  sumCurrency,
  type ActivityItem,
  type CurrencyAmount,
  type DashboardPayload,
} from "@/lib/dashboard-stats";

const HOUR_MS = 3_600_000;
// Safety cap on rows pulled for bucketing (a very large club still answers in bounded time).
const ROW_CAP = 20_000;

function emailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(
    (env.SMTP_HOST || "").trim() || ((env.RESEND_API_KEY || "").trim() && (env.RESEND_FROM || "").trim())
  );
}

function paymentsConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return isStripeConfigured(env) || Boolean((env.KONNECT_API_KEY || "").trim() && (env.KONNECT_WALLET_ID || "").trim());
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    // Tenant context comes from the verified account, never from the query string / body.
    const clubId = auth.user.clubId as string;
    const isOwner = auth.user.role?.toUpperCase() === "OWNER";

    const range = parseRange(request.nextUrl.searchParams.get("range"));
    const now = new Date();

    const settings = await prisma.gymSettings.findUnique({
      where: { clubId },
      select: { timezone: true, reservationCutoffMinutes: true, websiteSetupCompleted: true },
    });
    const { timeZone } = resolveReservationConfig(settings);
    // Club-local calendar math = shift by the zone's UTC offset at `now` (exact except across a DST
    // switch that falls inside the displayed window, which only moves a bucket edge by one hour).
    const offset = tzOffsetMs(now, timeZone) / HOUR_MS;

    const buckets = buildBuckets(range, now, offset);
    const rangeStart = buckets[0].start;
    const monthStart = localMonthStart(now, 0, offset);
    const prevMonthStart = localMonthStart(now, 1, offset);
    const todayDay = localDayOfWeek(now, offset);
    const weekMonday = localWeekMonday(now, offset);

    const activeSubWhere = { clubId, status: "ACTIVE" as const, endDate: { gte: now } };

    const [
      totalMembers,
      activeMembers,
      newMembersThisMonth,
      membersBeforeMonth,
      activeSubUsers,
      todayReservations,
      todaySessionAgg,
      pendingSubscriptions,
      expiredUsers,
      unreadNotifications,
      memberRegistrations,
      membersBeforeRange,
      bookings,
      cancellations,
      plans,
      soldByPlan,
      activeByPlan,
      recentMembers,
      recentBookings,
      recentSubscriptions,
      ownNotifications,
      activeDevices,
      club,
      latestDomainRequest,
    ] = await Promise.all([
      prisma.user.count({ where: { clubId, role: "MEMBER" } }),
      prisma.user.count({ where: { clubId, role: "MEMBER", isActive: true } }),
      prisma.user.count({ where: { clubId, role: "MEMBER", createdAt: { gte: monthStart } } }),
      prisma.user.count({ where: { clubId, role: "MEMBER", createdAt: { lt: monthStart } } }),
      prisma.subscription.groupBy({ by: ["userId"], where: activeSubWhere }),
      // Reservations for sessions held TODAY (club-local day, current week's plan), not cancelled.
      prisma.userSession.count({
        where: { clubId, isCancelled: false, session: { clubId, day: todayDay, weeklyPlan: { clubId, weekStart: weekMonday } } },
      }),
      prisma.session.aggregate({
        where: { clubId, day: todayDay, weeklyPlan: { clubId, weekStart: weekMonday } },
        _count: { _all: true },
        _sum: { capacity: true },
      }),
      prisma.subscription.count({ where: { clubId, status: "PENDING" } }),
      // Members whose memberships have lapsed and who hold no live one.
      prisma.subscription.groupBy({
        by: ["userId"],
        where: {
          clubId,
          OR: [{ status: "EXPIRED" }, { status: "ACTIVE", endDate: { lt: now } }],
          user: { subscriptions: { none: { clubId, status: "ACTIVE", endDate: { gte: now } } } },
        },
      }),
      prisma.notification.count({ where: { clubId, userId: auth.user.id, isRead: false } }),
      prisma.user.findMany({
        where: { clubId, role: "MEMBER", createdAt: { gte: rangeStart } },
        select: { createdAt: true },
        take: ROW_CAP,
      }),
      prisma.user.count({ where: { clubId, role: "MEMBER", createdAt: { lt: rangeStart } } }),
      prisma.userSession.findMany({
        where: { clubId, bookedAt: { gte: rangeStart } },
        select: { bookedAt: true },
        take: ROW_CAP,
      }),
      prisma.userSession.findMany({
        where: { clubId, isCancelled: true, cancelledAt: { gte: rangeStart } },
        select: { cancelledAt: true },
        take: ROW_CAP,
      }),
      prisma.membershipPlan.findMany({ where: { clubId }, select: { id: true, name: true } }),
      prisma.subscription.groupBy({
        by: ["planId"],
        where: { clubId, createdAt: { gte: rangeStart } },
        _count: { _all: true },
      }),
      prisma.subscription.groupBy({ by: ["planId"], where: activeSubWhere, _count: { _all: true } }),
      prisma.user.findMany({
        where: { clubId, role: "MEMBER" },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.userSession.findMany({
        where: { clubId, isCancelled: false },
        select: {
          id: true,
          bookedAt: true,
          user: { select: { name: true } },
          session: { select: { activity: true, day: true, startTime: true } },
        },
        orderBy: { bookedAt: "desc" },
        take: 5,
      }),
      prisma.subscription.findMany({
        where: { clubId },
        select: { id: true, userId: true, createdAt: true, user: { select: { name: true } }, plan: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.notification.findMany({
        where: { clubId, userId: auth.user.id },
        select: { id: true, title: true, message: true, sentAt: true },
        orderBy: { sentAt: "desc" },
        take: 3,
      }),
      prisma.deviceToken.count({ where: { clubId, isActive: true } }),
      prisma.club.findUnique({
        where: { id: clubId },
        select: {
          name: true,
          slug: true,
          status: true,
          customDomain: true,
          trialEndsAt: true,
          subscription: {
            select: {
              status: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
              plan: { select: { tier: true, name: true, priceMonthly: true, limits: true } },
            },
          },
        },
      }),
      prisma.domainRequest.findFirst({ where: { clubId }, select: { status: true }, orderBy: { createdAt: "desc" } }),
    ]);

    // ── Owner-only financial data ───────────────────────────────────────────
    let revenueMonth: DashboardPayload["stats"]["revenueMonth"];
    let revenueSeries: number[] | undefined;
    let revenueCurrency: string | undefined;
    let revenueByPlan: Map<string, number> | undefined;
    let recentPayments: Array<{ id: string; amount: number; currency: string; paidAt: Date | null; name: string; planName: string }> = [];
    let totalCoaches = 0;
    let totalAdmins = 0;

    if (isOwner) {
      const [monthSums, prevMonthSums, paymentsInRange, latestPayments, coachCount, adminCount] = await Promise.all([
        prisma.payment.groupBy({
          by: ["currency"],
          where: { clubId, status: "PAID", paidAt: { gte: monthStart } },
          _sum: { amount: true },
        }),
        prisma.payment.groupBy({
          by: ["currency"],
          where: { clubId, status: "PAID", paidAt: { gte: prevMonthStart, lt: monthStart } },
          _sum: { amount: true },
        }),
        prisma.payment.findMany({
          where: { clubId, status: "PAID", paidAt: { gte: rangeStart } },
          select: { amount: true, currency: true, paidAt: true, subscription: { select: { planId: true } } },
          take: ROW_CAP,
        }),
        prisma.payment.findMany({
          where: { clubId, status: "PAID" },
          select: {
            id: true,
            amount: true,
            currency: true,
            paidAt: true,
            subscription: { select: { user: { select: { name: true } }, plan: { select: { name: true } } } },
          },
          orderBy: { paidAt: "desc" },
          take: 5,
        }),
        prisma.coach.count({ where: { clubId } }),
        prisma.user.count({ where: { clubId, role: "ADMIN" } }),
      ]);
      totalCoaches = coachCount;
      totalAdmins = adminCount;

      const toAmounts = (rows: Array<{ currency: string; _sum: { amount: number | null } }>): CurrencyAmount[] =>
        rows.map((r) => ({ currency: r.currency, amount: r._sum.amount ?? 0 }));
      const monthAmounts = toAmounts(monthSums);
      const prevAmounts = toAmounts(prevMonthSums);
      revenueCurrency = pickPrimaryCurrency([...monthAmounts, ...paymentsInRange.map((p) => ({ currency: p.currency, amount: p.amount }))]);
      revenueMonth = {
        currency: revenueCurrency,
        amount: sumCurrency(monthAmounts, revenueCurrency),
        trendPct: percentChange(sumCurrency(monthAmounts, revenueCurrency), sumCurrency(prevAmounts, revenueCurrency)),
        otherCurrencies: monthAmounts.filter((a) => a.currency !== revenueCurrency && a.amount > 0),
      };
      const inPrimary = paymentsInRange.filter((p) => p.currency === revenueCurrency);
      revenueSeries = sumByBucket(inPrimary.map((p) => ({ date: p.paidAt, amount: p.amount })), buckets);
      revenueByPlan = new Map();
      for (const p of inPrimary) {
        const planId = p.subscription?.planId;
        if (planId) revenueByPlan.set(planId, (revenueByPlan.get(planId) ?? 0) + p.amount);
      }
      recentPayments = latestPayments.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        paidAt: p.paidAt,
        name: p.subscription?.user?.name ?? "Membre",
        planName: p.subscription?.plan?.name ?? "Abonnement",
      }));
    }

    // ── Series ──────────────────────────────────────────────────────────────
    const newMembers = countByBucket(memberRegistrations.map((m) => m.createdAt), buckets);
    const series: DashboardPayload["series"] = {
      buckets: buckets.map(({ key, label, fullLabel }) => ({ key, label, fullLabel })),
      members: cumulativeSeries(membersBeforeRange, newMembers),
      newMembers,
      reservations: countByBucket(bookings.map((b) => b.bookedAt), buckets),
      cancellations: countByBucket(cancellations.map((c) => c.cancelledAt), buckets),
      ...(revenueSeries ? { revenue: revenueSeries, revenueCurrency } : {}),
    };

    // ── Subscription performance ────────────────────────────────────────────
    const subscriptionPerformance = buildPlanPerformance({
      plans,
      sold: soldByPlan.map((r) => ({ planId: r.planId, count: r._count._all })),
      active: activeByPlan.map((r) => ({ planId: r.planId, count: r._count._all })),
      revenueByPlan,
    });

    // ── Activity feed ───────────────────────────────────────────────────────
    const classUserIds = [...new Set(recentSubscriptions.map((s) => s.userId))];
    const history = classUserIds.length
      ? await prisma.subscription.findMany({
          where: { clubId, userId: { in: classUserIds } },
          select: { id: true, userId: true, createdAt: true },
        })
      : [];
    const kinds = classifySubscriptions(
      recentSubscriptions.map((s) => ({ id: s.id, userId: s.userId, createdAt: s.createdAt })),
      history
    );

    const activity: ActivityItem[] = [
      ...recentMembers.map<ActivityItem>((m) => ({
        id: `reg-${m.id}`,
        kind: "registration",
        title: "Nouveau membre inscrit",
        subtitle: m.name,
        at: m.createdAt.toISOString(),
      })),
      ...recentBookings.map<ActivityItem>((b) => ({
        id: `bk-${b.id}`,
        kind: "booking",
        title: "Réservation de cours",
        subtitle: `${b.user?.name ?? "Membre"} · ${ACTIVITY_LABELS_FR[b.session.activity] ?? b.session.activity} ${DAY_LABELS_FR[b.session.day] ?? ""} ${b.session.startTime}`.trim(),
        at: b.bookedAt.toISOString(),
      })),
      ...recentSubscriptions.map<ActivityItem>((s) => {
        const renewal = kinds.get(s.id) === "renewal";
        return {
          id: `sub-${s.id}`,
          kind: renewal ? "renewal" : "subscription",
          title: renewal ? "Abonnement renouvelé" : "Nouvel abonnement",
          subtitle: `${s.user?.name ?? "Membre"} · ${s.plan?.name ?? ""}`.trim(),
          at: s.createdAt.toISOString(),
        };
      }),
      ...recentPayments
        .filter((p) => p.paidAt)
        .map<ActivityItem>((p) => ({
          id: `pay-${p.id}`,
          kind: "payment",
          title: "Paiement reçu",
          subtitle: `${p.name} · ${new Intl.NumberFormat("fr-FR", { style: "currency", currency: p.currency, maximumFractionDigits: p.currency === "TND" ? 3 : 2 }).format(p.amount)}`,
          at: (p.paidAt as Date).toISOString(),
        })),
      ...ownNotifications.map<ActivityItem>((n) => ({
        id: `ntf-${n.id}`,
        kind: "notification",
        title: n.title,
        subtitle: n.message.length > 80 ? `${n.message.slice(0, 77)}…` : n.message,
        at: n.sentAt.toISOString(),
      })),
    ];

    const health = deriveHealth({
      slug: club?.slug ?? "",
      clubStatus: club?.status ?? "ACTIVE",
      websiteSetupCompleted: Boolean(settings?.websiteSetupCompleted),
      activeDevices,
      apkAvailable: getAppRelease().available,
      paymentsConfigured: paymentsConfigured(),
      emailConfigured: emailConfigured(),
      customDomain: club?.customDomain ?? null,
      domainRequestStatus: latestDomainRequest?.status ?? null,
    });

    const sub = club?.subscription;
    const payload: DashboardPayload = {
      range,
      generatedAt: now.toISOString(),
      role: isOwner ? "OWNER" : "ADMIN",
      club: {
        name: club?.name ?? "",
        slug: club?.slug ?? "",
        ...(isOwner ? { status: club?.status, trialEndsAt: club?.trialEndsAt ? club.trialEndsAt.toISOString() : null } : {}),
      },
      stats: {
        activeMembers,
        totalMembers,
        membersWithActiveSubscription: activeSubUsers.length,
        todayReservations,
        todaySessions: todaySessionAgg._count._all,
        todayCapacity: todaySessionAgg._sum.capacity ?? 0,
        pendingSubscriptions,
        newMembersThisMonth,
        newMembersGrowthPct: membersBeforeMonth > 0 ? Math.round((newMembersThisMonth / membersBeforeMonth) * 100) : null,
        expiredMemberships: expiredUsers.length,
        ...(revenueMonth ? { revenueMonth } : {}),
      },
      series,
      subscriptionPerformance,
      activity: mergeActivity(activity, 10),
      notifications: { unread: unreadNotifications },
      health,
      ...(isOwner
        ? {
            saasPlan: sub
              ? {
                  tier: sub.plan.tier,
                  name: sub.plan.name,
                  priceMonthly: sub.plan.priceMonthly,
                  limits: sub.plan.limits as Record<string, number>,
                  status: sub.status,
                  currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
                  cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
                  usage: { members: activeMembers, coaches: totalCoaches, admins: totalAdmins },
                }
              : null,
          }
        : {}),
    };

    const response = NextResponse.json(payload);
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    console.error("Admin dashboard GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
