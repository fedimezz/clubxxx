import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireCoach } from "@/lib/auth";
import { resolveReservationConfig } from "@/lib/reservation-cutoff";

// GET /api/dashboard/coach/sessions — this coach's sessions in the active
// weekly plan, so they can see their own week without any admin access.
export async function GET(request: NextRequest) {
  const auth = await requireCoach(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });

  try {
    const coach = await prisma.coach.findFirst({ where: { userId: auth.user.id, clubId: auth.user.clubId! } });
    if (!coach) {
      return NextResponse.json({ error: "Aucun profil coach lié à ce compte" }, { status: 404 });
    }

    const sessions = await prisma.session.findMany({
      where: { coachId: coach.id, clubId: auth.user.clubId!, weeklyPlan: { isActive: true } },
      select: {
        id: true,
        day: true,
        startTime: true,
        endTime: true,
        activity: true,
        location: true,
        capacity: true,
        currentBookings: true,
        weeklyPlan: { select: { weekStart: true } },
      },
      orderBy: [{ day: "asc" }, { startTime: "asc" }],
      take: 100,
    });

    // Additive: lets the UI place each session on its real date and compute "today" in the club's zone.
    const settings = await prisma.gymSettings.findUnique({
      where: { clubId: auth.user.clubId! },
      select: { timezone: true, reservationCutoffMinutes: true },
    });
    const { timeZone } = resolveReservationConfig(settings);

    return NextResponse.json({
      coach: { id: coach.id, name: coach.name },
      timeZone,
      sessions: sessions.map(({ weeklyPlan, ...session }) => ({ ...session, weekStart: weeklyPlan.weekStart })),
    });
  } catch (error) {
    console.error("Coach sessions GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
