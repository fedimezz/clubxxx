// GET /api/bookings — tab classification unchanged, tenant scoping, additive display fields.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...a: unknown[]) => requireUserMock(...a) }));

const findMany = vi.fn();
const settings = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    userSession: { findMany: (...a: unknown[]) => findMany(...a) },
    gymSettings: { findUnique: (...a: unknown[]) => settings(...a) },
  },
}));

const { GET } = await import("../route");
const monday = new Date("2026-11-23T00:00:00.000Z");
const row = (id: string, over: Record<string, unknown> = {}, archived = false) => ({
  id, sessionId: `s_${id}`, bookedAt: new Date("2026-11-20T10:00:00Z"), cancelledAt: null, isCancelled: false,
  session: {
    id: `s_${id}`, day: "THURSDAY", startTime: "10:00", endTime: "11:00", activity: "YOGA", coach: "Sarra", location: "Studio",
    description: "Cours doux", coachRef: { photoUrl: "https://res.cloudinary.com/x/c.jpg" },
    weeklyPlan: { weekStart: monday, weekEnd: new Date("2026-11-29T00:00:00.000Z"), isArchived: archived },
  },
  ...over,
});
const req = () => new NextRequest("https://club-a.example.test/api/bookings?clubId=club_B");

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ ok: true, user: { id: "u1", clubId: "club_A" } });
  settings.mockResolvedValue({ timezone: "Africa/Tunis", reservationCutoffMinutes: 20 });
  findMany.mockResolvedValue([row("a"), row("b", { isCancelled: true, cancelledAt: new Date() }), row("c", {}, true)]);
});

describe("GET /api/bookings", () => {
  it("401 without a session", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401 });
    expect((await GET(req())).status).toBe(401);
  });

  it("scopes the query by user AND authenticated club; ignores a clubId in the URL", async () => {
    await GET(req());
    expect(findMany.mock.calls[0][0].where).toEqual({ userId: "u1", clubId: "club_A" });
    expect(settings.mock.calls[0][0].where).toEqual({ clubId: "club_A" });
  });

  it("keeps the upcoming / past / cancelled classification", async () => {
    const j = await (await GET(req())).json();
    expect(j.upcoming.map((b: { id: string }) => b.id)).toEqual(["a"]);
    expect(j.cancelled.map((b: { id: string }) => b.id)).toEqual(["b"]);
    expect(j.past.map((b: { id: string }) => b.id)).toEqual(["c"]);
  });

  it("adds the real start/end instants, date and coach photo", async () => {
    const j = await (await GET(req())).json();
    expect(j.upcoming[0].session).toMatchObject({
      date: "2026-11-26",
      startsAt: "2026-11-26T09:00:00.000Z", // 10:00 Africa/Tunis
      endsAt: "2026-11-26T10:00:00.000Z",
      coachPhotoUrl: "https://res.cloudinary.com/x/c.jpg",
      description: "Cours doux",
    });
    expect(j.timeZone).toBe("Africa/Tunis");
  });
});
