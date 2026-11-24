import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { getSessionDateTime } from "@/lib/session-date";
import { hasPermission } from "@/lib/permissions";
import { formatZodError, weeklyPlanSchema } from "@/lib/validation";
import { resolveReservationConfig } from "@/lib/reservation-cutoff";
import { compareIso, diffDays, isIsoDate, startOfWeek } from "@/lib/calendar-nav";

/**
 * Optional visible window `?from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive, used by the planning
 * calendar so that ANY week/month can be browsed, not only the 12 most recent plans). Returns
 * null when absent/invalid/too wide, in which case the historical behaviour applies unchanged.
 */
function parseRangeParams(request: NextRequest): { from: Date; to: Date } | null {
  const fromRaw = request.nextUrl.searchParams.get("from");
  const toRaw = request.nextUrl.searchParams.get("to");
  if (!isIsoDate(fromRaw) || !isIsoDate(toRaw)) return null;
  if (compareIso(fromRaw, toRaw) > 0 || diffDays(fromRaw, toRaw) > 62) return null;
  const monday = startOfWeek(fromRaw); // a plan that starts before `from` can still cover it
  return { from: new Date(`${monday}T00:00:00.000Z`), to: new Date(`${toRaw}T00:00:00.000Z`) };
}

async function cleanupPastData(clubId: string) {
  const now = new Date();

  const sessions = await prisma.session.findMany({
    where: { clubId, weeklyPlan: { isArchived: false } },
    select: {
      id: true,
      day: true,
      endTime: true,
      weeklyPlan: { select: { weekStart: true } },
    },
  });

  const idsToDelete: string[] = [];

  for (const s of sessions) {
    // Use the shared UTC-based helper instead of local-time Date math —
    // weekStart is stored as a UTC calendar date, so mixing it with
    // setDate()/setHours() (local time) shifted this by a day for any
    // server timezone ahead of UTC, deleting/keeping sessions incorrectly.
    const sessionDate = getSessionDateTime(s.weeklyPlan.weekStart, s.day, s.endTime);

    if (sessionDate < now) {
      idsToDelete.push(s.id);
    }
  }

  if (idsToDelete.length > 0) {
    await prisma.session.deleteMany({ where: { id: { in: idsToDelete }, clubId } });
  }

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  await prisma.weeklyPlan.updateMany({
    where: {
      clubId,
      weekEnd: { lt: todayMidnight },
      isArchived: false,
    },
    data: { isActive: false, isArchived: true },
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;

    await cleanupPastData(admin.clubId as string);

    const range = parseRangeParams(request);
    const plans = await prisma.weeklyPlan.findMany({
      where: {
        clubId: admin.clubId as string,
        ...(range ? { weekStart: { gte: range.from, lte: range.to } } : {}),
      },
      orderBy: { weekStart: "desc" },
      include: {
        sessions: {
          orderBy: [{ day: "asc" }, { startTime: "asc" }],
          take: 500,
        },
        _count: { select: { sessions: true } },
      },
      take: 12,
    });

    // Additive: the club's zone and reservation cutoff, so the calendar computes "today" and the
    // reservation closing time in the club's time zone instead of the browser's.
    const settings = await prisma.gymSettings.findUnique({
      where: { clubId: admin.clubId as string },
      select: { timezone: true, reservationCutoffMinutes: true },
    });
    const config = resolveReservationConfig(settings);

    return NextResponse.json({
      plans,
      timeZone: config.timeZone,
      reservationCutoffMinutes: config.cutoffMinutes,
    });
  } catch (error) {
    console.error("Admin schedule GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    if (!(await hasPermission(admin, "planning.manage"))) {
      return NextResponse.json({ error: "Permission requise : gérer le planning" }, { status: 403 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = weeklyPlanSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { weekStart, weekEnd, isActive } = parsed.data;

    const existing = await prisma.weeklyPlan.findFirst({
      where: { clubId: admin.clubId as string, weekStart },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Un planning existe déjà pour cette semaine" },
        { status: 409 }
      );
    }

    const plan = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (isActive) {
        await tx.weeklyPlan.updateMany({
          where: { clubId: admin.clubId as string, isActive: true },
          data: { isActive: false },
        });
      }

      return tx.weeklyPlan.create({
        data: {
          clubId: admin.clubId as string,
          weekStart,
          weekEnd,
          isActive: !!isActive,
        },
        include: { _count: { select: { sessions: true } } },
      });
    });

    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    console.error("Admin schedule POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}