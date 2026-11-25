import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getSessionDateTime } from "@/lib/session-date";
import { resolveReservationConfig } from "@/lib/reservation-cutoff";
import { addDays, normalizeApiDate, sessionDateIso } from "@/lib/calendar-nav";
import {
  ACTIVITY_RANGES,
  attendanceRate,
  buildActivitySeries,
  currentWeek,
  last30VsPrevious30,
  localDay,
  membershipElapsedPercent,
  percentTrend,
  weeklyCounts,
} from "@/lib/member-dashboard";

// GET /api/dashboard — member KPIs, upcoming session, activity history.
// All queries are scoped by BOTH userId (ownership) AND clubId (tenant isolation); the club always
// comes from the authenticated account, never from the request.
//
// The original fields (userName, stats, upcomingSession, weeklyActivity, recentAttendances) keep
// their shape. Everything else is ADDITIVE and computed from the member's real rows only.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });
    const userId = auth.user.id;
    const clubId = auth.user.clubId!;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const yearAgo = new Date(now.getTime() - 370 * 24 * 60 * 60 * 1000);
    const eightWeeksAgo = new Date(now.getTime() - 57 * 24 * 60 * 60 * 1000);

    const [
      user,
      totalBookings,
      completedAttendances,
      upcomingUserSessions,
      activeSubscription,
      weeklyAttendances,
      recentAttendances,
      settings,
      bookedSessions,
      yearAttendances,
      unreadNotifications,
      recentNotifications,
      plans,
      latestPost,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId, clubId },
        select: { name: true },
      }),
      prisma.userSession.count({ where: { userId, clubId, isCancelled: false } }),
      prisma.attendance.count({ where: { userId, clubId } }),
      prisma.userSession.findMany({
        where: {
          userId,
          clubId,
          isCancelled: false,
          session: { weeklyPlan: { isActive: true } },
        },
        include: {
          session: {
            include: {
              weeklyPlan: true,
              coachRef: { select: { name: true, photoUrl: true } },
            },
          },
        },
      }),
      prisma.subscription.findFirst({
        where: { userId, clubId, status: "ACTIVE", endDate: { gt: now } },
        include: { plan: { select: { name: true } } },
        orderBy: { startDate: "desc" },
      }),
      prisma.attendance.findMany({
        where: { userId, clubId, checkInTime: { gte: sevenDaysAgo } },
        select: { checkInTime: true },
      }),
      prisma.attendance.findMany({
        where: { userId, clubId, checkInTime: { gte: thirtyDaysAgo } },
        select: { id: true, checkInTime: true, session: { select: { activity: true } } },
        orderBy: { checkInTime: "desc" },
        take: 5,
      }),
      prisma.gymSettings.findUnique({
        where: { clubId },
        select: { timezone: true, reservationCutoffMinutes: true },
      }),
      // Every non-cancelled booking (date of the session itself) — feeds the real activity chart.
      prisma.userSession.findMany({
        where: {
          userId,
          clubId,
          isCancelled: false,
          session: { weeklyPlan: { weekStart: { gte: yearAgo } } },
        },
        select: { session: { select: { day: true, weeklyPlan: { select: { weekStart: true } } } } },
        orderBy: { session: { weeklyPlan: { weekStart: "desc" } } },
      }),
      prisma.attendance.findMany({
        where: { userId, clubId, checkInTime: { gte: yearAgo } },
        select: { checkInTime: true },
        orderBy: { checkInTime: "desc" },
      }),
      prisma.notification.count({ where: { userId, clubId, isRead: false } }),
      prisma.notification.findMany({
        where: { userId, clubId, sentAt: { gte: eightWeeksAgo } },
        select: { sentAt: true },
        orderBy: { sentAt: "desc" },
      }),
      prisma.membershipPlan.findMany({
        where: { clubId, isActive: true },
        orderBy: { price: "asc" },
        take: 3,
        select: { id: true, name: true, price: true, currency: true, durationDays: true },
      }),
      prisma.post.findFirst({
        where: { clubId, isPublished: true },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, content: true, createdAt: true },
      }),
    ]);

    if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    const { timeZone } = resolveReservationConfig(settings);

    // Resolve the real next session
    const upcoming = upcomingUserSessions
      .map((us) => {
        const { session } = us;
        const dt = getSessionDateTime(session.weeklyPlan.weekStart, session.day, session.startTime, timeZone);
        return { session, dt };
      })
      .filter((entry) => entry.dt.getTime() >= now.getTime())
      .sort((a, b) => a.dt.getTime() - b.dt.getTime());

    const next = upcoming[0] ?? null;
    const nextSession = next?.session ?? null;

    // 7-day activity histogram (Mon..Sun) — original field, unchanged.
    const dayBuckets = [0, 0, 0, 0, 0, 0, 0];
    weeklyAttendances.forEach((a) => {
      const localDate = localDay(a.checkInTime, timeZone);
      const jsDay = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
      const idx = jsDay === 0 ? 6 : jsDay - 1;
      dayBuckets[idx] += 1;
    });
    const maxBucket = Math.max(...dayBuckets, 1);
    const weeklyActivity = dayBuckets.map((v) => Math.round((v / maxBucket) * 100));

    const membershipStatus =
      activeSubscription &&
      activeSubscription.endDate &&
      new Date(activeSubscription.endDate) >= now
        ? "Active"
        : "Inactive";

    const daysUntilExpiry =
      activeSubscription?.endDate
        ? Math.max(
            0,
            Math.ceil(
              (new Date(activeSubscription.endDate).getTime() - now.getTime()) / 86400000
            )
          )
        : null;

    // ── Additive, real-data blocks ────────────────────────────────────────────────────────
    const today = localDay(now, timeZone);
    const week = currentWeek(now, timeZone);

    // Club-local day + start instant of each booked session.
    const planMonday = (weekStart: Date) => normalizeApiDate(weekStart.toISOString());
    const reservations = bookedSessions
      .map(({ session }) => {
        const monday = planMonday(session.weeklyPlan.weekStart);
        return monday ? sessionDateIso(monday, session.day) : null;
      })
      .filter((d): d is string => !!d);
    const attendanceDays = yearAttendances.map((a) => localDay(a.checkInTime, timeZone));

    const reservedThisWeek = reservations.filter((d) => d >= week.start && d <= week.end);
    const attendedThisWeek = attendanceDays.filter((d) => d >= week.start && d <= week.end);

    const reservationsPeriods = last30VsPrevious30(reservations, today);
    const windowStart = addDays(today, -29);
    const past30Reserved = reservations.filter((d) => d <= today && d >= windowStart).length;
    const attended30 = attendanceDays.filter((d) => d >= windowStart && d <= today).length;

    const activity = Object.fromEntries(
      ACTIVITY_RANGES.map((range) => [range, buildActivitySeries(range, reservations, attendanceDays, today)])
    );

    return NextResponse.json({
      userName: user.name ?? "Membre",
      stats: {
        totalBookings,
        completedAttendances,
        membershipStatus,
        daysUntilExpiry,
        planName: activeSubscription?.plan?.name ?? null,
      },
      upcomingSession: nextSession
        ? {
            activity: nextSession.activity,
            day: nextSession.day,
            startTime: nextSession.startTime,
            endTime: nextSession.endTime,
            coach: nextSession.coach,
            location: nextSession.location,
            // additive
            sessionId: nextSession.id,
            startsAt: next!.dt.toISOString(),
            date: (() => {
              const monday = planMonday(nextSession.weeklyPlan.weekStart);
              return monday ? sessionDateIso(monday, nextSession.day) : null;
            })(),
            coachPhotoUrl: nextSession.coachRef?.photoUrl ?? null,
          }
        : null,
      weeklyActivity,
      recentAttendances: recentAttendances.map((a) => ({
        id: a.id,
        activity: a.session?.activity ?? null,
        checkInTime: a.checkInTime,
      })),

      // additive
      timeZone,
      unreadNotifications,
      weekly: {
        start: week.start,
        end: week.end,
        reserved: reservedThisWeek.length,
        attended: attendedThisWeek.length,
        days: week.days.map((d) => ({
          date: d,
          reserved: reservedThisWeek.filter((x) => x === d).length,
          attended: attendedThisWeek.filter((x) => x === d).length,
        })),
      },
      trends: {
        reservations: {
          last30: reservationsPeriods.current,
          previous30: reservationsPeriods.previous,
          percent: percentTrend(reservationsPeriods.current, reservationsPeriods.previous),
        },
        attendanceRate30: attendanceRate(past30Reserved, attended30),
        sparks: {
          reservations: weeklyCounts(reservations, today),
          attendances: weeklyCounts(attendanceDays, today),
          notifications: weeklyCounts(recentNotifications.map((n) => localDay(n.sentAt, timeZone)), today),
        },
      },
      membership: {
        planName: activeSubscription?.plan?.name ?? null,
        startDate: activeSubscription?.startDate ?? null,
        endDate: activeSubscription?.endDate ?? null,
        elapsedPercent: membershipElapsedPercent(
          activeSubscription?.startDate ?? null,
          activeSubscription?.endDate ?? null,
          now
        ),
      },
      activity,
      plans,
      latestPost: latestPost
        ? {
            id: latestPost.id,
            title: latestPost.title,
            excerpt: latestPost.content.length > 180 ? `${latestPost.content.slice(0, 177)}…` : latestPost.content,
            createdAt: latestPost.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Dashboard GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
