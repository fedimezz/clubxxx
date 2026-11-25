import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getSessionDateTime } from "@/lib/session-date";
import { resolveReservationConfig } from "@/lib/reservation-cutoff";
import { normalizeApiDate, sessionDateIso } from "@/lib/calendar-nav";

// GET /api/bookings
// Returns all of the user's bookings, classified into upcoming / past / cancelled.
//
// "Upcoming" vs "past" is determined relative to the session's weekly plan:
// a session belongs to an active (non-archived) weekly plan is treated as
// upcoming unless explicitly cancelled; everything tied to an archived plan
// is treated as past. This matches how WeeklyPlan/Session are used elsewhere
// (no per-session absolute date exists in the schema — only day-of-week +
// time within a given week).
//
// Scoping: userId (ownership) AND clubId (tenant isolation, taken from the authenticated account).
// The classification above is unchanged; the extra per-booking fields (startsAt, endsAt, date,
// coachPhotoUrl, description) are additive and only drive the display.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) {
      return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });
    }
    const userId = auth.user.id;
    const clubId = auth.user.clubId as string;

    const [userSessions, settings] = await Promise.all([
      prisma.userSession.findMany({
        where: { userId, clubId },
        include: {
          session: {
            include: {
              weeklyPlan: true,
              coachRef: { select: { photoUrl: true } },
            },
          },
        },
        orderBy: { bookedAt: "desc" },
        take: 1000,
      }),
      prisma.gymSettings.findUnique({ where: { clubId }, select: { timezone: true, reservationCutoffMinutes: true } }),
    ]);
    const { timeZone } = resolveReservationConfig(settings);

    const upcoming: typeof userSessions = [];
    const past: typeof userSessions = [];
    const cancelled: typeof userSessions = [];

    for (const us of userSessions) {
      if (us.isCancelled) {
        cancelled.push(us);
      } else if (us.session.weeklyPlan.isArchived) {
        past.push(us);
      } else {
        upcoming.push(us);
      }
    }

    const format = (list: typeof userSessions) =>
      list.map((us) => {
        const { session } = us;
        const monday = normalizeApiDate(session.weeklyPlan.weekStart.toISOString());
        const startsAt = getSessionDateTime(session.weeklyPlan.weekStart, session.day, session.startTime, timeZone);
        const endsAt = getSessionDateTime(session.weeklyPlan.weekStart, session.day, session.endTime, timeZone);
        return {
          id: us.id,
          sessionId: us.sessionId,
          bookedAt: us.bookedAt,
          cancelledAt: us.cancelledAt,
          isCancelled: us.isCancelled,
          session: {
            id: session.id,
            day: session.day,
            startTime: session.startTime,
            endTime: session.endTime,
            activity: session.activity,
            coach: session.coach,
            location: session.location,
            // additive
            description: session.description,
            coachPhotoUrl: session.coachRef?.photoUrl ?? null,
            date: monday ? sessionDateIso(monday, session.day) : null,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
          },
          weeklyPlan: {
            weekStart: session.weeklyPlan.weekStart,
            weekEnd: session.weeklyPlan.weekEnd,
            isArchived: session.weeklyPlan.isArchived,
          },
        };
      });

    return NextResponse.json({
      upcoming: format(upcoming),
      past: format(past),
      cancelled: format(cancelled),
      timeZone, // additive
    });
  } catch (error) {
    console.error("Bookings GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
