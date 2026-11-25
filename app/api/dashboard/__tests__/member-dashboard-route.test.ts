// GET /api/dashboard — member dashboard payload: auth, tenant scoping, real-data blocks.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const requireUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...a: unknown[]) => requireUserMock(...a) }));

const calls: Record<string, unknown[]> = {};
function track(name: string, result: unknown) {
  return vi.fn(async (args: unknown) => {
    (calls[name] ??= []).push(args);
    return typeof result === "function" ? (result as () => unknown)() : result;
  });
}

const monday = new Date("2026-11-23T00:00:00.000Z");
const state = {
  bookings: [] as unknown[],
  upcoming: [] as unknown[],
};

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: track("user", { name: "Fedi Mezghani" }) },
    userSession: {
      count: track("userSession.count", 2),
      findMany: vi.fn(async (args: { include?: unknown; select?: unknown }) => {
        (calls["userSession.findMany"] ??= []).push(args);
        return args.include ? state.upcoming : state.bookings;
      }),
    },
    attendance: {
      count: track("attendance.count", 1),
      findMany: track("attendance.findMany", [{ id: "a1", checkInTime: new Date("2026-11-23T23:30:00Z"), session: { activity: "YOGA" } }]),
    },
    subscription: { findFirst: track("subscription", null) },
    gymSettings: { findUnique: track("gymSettings", { timezone: "Africa/Tunis", reservationCutoffMinutes: 20 }) },
    notification: { count: track("notification.count", 3), findMany: track("notification.findMany", [{ sentAt: new Date("2026-11-23T09:00:00Z") }]) },
    membershipPlan: { findMany: track("membershipPlan", [{ id: "p1", name: "Pro", price: 90, currency: "TND", durationDays: 30 }]) },
    post: { findFirst: track("post", { id: "po1", title: "Fermeture", content: "x".repeat(400), createdAt: new Date("2026-11-20T00:00:00Z") }) },
  },
}));

const { GET } = await import("../route");
const req = () => new NextRequest("https://club-a.example.test/api/dashboard?clubId=club_B");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-24T10:00:00.000Z")); // Tuesday
  for (const k of Object.keys(calls)) delete calls[k];
  requireUserMock.mockResolvedValue({ ok: true, user: { id: "u1", clubId: "club_A", role: "MEMBER" } });
  state.bookings = [
    { session: { day: "MONDAY", weeklyPlan: { weekStart: monday } } },
    { session: { day: "THURSDAY", weeklyPlan: { weekStart: monday } } },
  ];
  state.upcoming = [
    {
      session: {
        id: "s9", day: "THURSDAY", startTime: "10:00", endTime: "11:00", activity: "BODYBUILDING",
        coach: "Ahmed", location: "Main Hall", weeklyPlan: { weekStart: monday },
        coachRef: { name: "Ahmed", photoUrl: "https://res.cloudinary.com/x/a.jpg" },
      },
    },
  ];
});
afterEach(() => vi.useRealTimers());

describe("GET /api/dashboard", () => {
  it("401 when unauthenticated", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401 });
    expect((await GET(req())).status).toBe(401);
  });

  it("every query is scoped to the authenticated user AND club (client clubId is ignored)", async () => {
    await GET(req());
    for (const [name, list] of Object.entries(calls)) {
      for (const args of list as { where?: Record<string, unknown> }[]) {
        const w = args?.where ?? {};
        if (name === "gymSettings") expect(w).toEqual({ clubId: "club_A" });
        else expect(w.clubId, name).toBe("club_A");
        expect(JSON.stringify(args)).not.toContain("club_B");
      }
    }
    for (const name of ["userSession.count", "attendance.findMany", "notification.count", "notification.findMany"]) {
      for (const args of calls[name] as { where: Record<string, unknown> }[]) expect(args.where.userId, name).toBe("u1");
    }
  });

  it("keeps the original payload fields and adds real-data blocks", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.userName).toBe("Fedi Mezghani");
    expect(j.stats).toMatchObject({ totalBookings: 2, completedAttendances: 1, membershipStatus: "Inactive" });
    expect(j.weeklyActivity).toHaveLength(7);
    expect(j.weeklyActivity[0]).toBe(0);
    expect(j.weeklyActivity[1]).toBe(100); // Monday 23:30 UTC is Tuesday in the club's timezone.
    expect(j.unreadNotifications).toBe(3);
    expect(j.weekly).toMatchObject({ start: "2026-11-23", end: "2026-11-29", reserved: 2, attended: 1 });
    expect(j.upcomingSession).toMatchObject({ sessionId: "s9", date: "2026-11-26", coachPhotoUrl: "https://res.cloudinary.com/x/a.jpg" });
    expect(j.upcomingSession.startsAt).toBe("2026-11-26T09:00:00.000Z");
    expect(j.activity["7d"]).toHaveLength(7);
    expect(j.activity["1y"]).toHaveLength(12);
    expect(j.plans).toHaveLength(1);
    expect(j.latestPost.excerpt.length).toBeLessThanOrEqual(180);
  });

  it("never invents numbers: no previous period → null trend, no past bookings → null rate", async () => {
    state.bookings = [];
    state.upcoming = [];
    const j = await (await GET(req())).json();
    expect(j.trends.reservations.percent).toBeNull();
    expect(j.trends.attendanceRate30).toBeNull();
    expect(j.upcomingSession).toBeNull();
    expect(j.weekly.reserved).toBe(0);
  });

  it("uses current memberships and orders bounded chart data newest-first", async () => {
    await GET(req());

    expect(calls.subscription[0]).toMatchObject({
      where: {
        userId: "u1",
        clubId: "club_A",
        status: "ACTIVE",
        endDate: { gt: new Date("2026-11-24T10:00:00.000Z") },
      },
    });

    const bookingQuery = (calls["userSession.findMany"] as {
      include?: unknown;
      where: { session: { weeklyPlan: { weekStart: { gte: Date } } } };
      take?: number;
      orderBy?: unknown;
    }[])
      .find((args) => !args.include);
    expect(bookingQuery?.where.session.weeklyPlan.weekStart.gte).toBeInstanceOf(Date);
    expect(bookingQuery?.orderBy).toEqual({ session: { weeklyPlan: { weekStart: "desc" } } });
    expect(bookingQuery?.take).toBeUndefined();

    const attendanceQuery = (calls["attendance.findMany"] as {
      where: { checkInTime?: { gte?: Date } };
      take?: number;
      orderBy?: unknown;
    }[])
      .find((args) => args.take === undefined && args.orderBy);
    expect(attendanceQuery?.where.checkInTime?.gte).toBeInstanceOf(Date);
    expect(attendanceQuery?.orderBy).toEqual({ checkInTime: "desc" });
    expect(attendanceQuery?.take).toBeUndefined();

    expect(calls["notification.findMany"][0]).toMatchObject({
      orderBy: { sentAt: "desc" },
    });
    expect((calls["notification.findMany"][0] as { take?: number }).take).toBeUndefined();
  });
});
