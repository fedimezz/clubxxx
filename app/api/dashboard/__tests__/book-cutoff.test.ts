// Direct-API test of the 20-minute reservation cutoff on POST /api/dashboard/schedule/book.
// The same endpoint serves the web app and the mobile app, so this covers "web, mobile and API".
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const requireUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...a: unknown[]) => requireUserMock(...a) }));
vi.mock("@/lib/plan-limits", () => ({ checkLimit: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/after", () => ({ runAfter: () => undefined }));
vi.mock("@/lib/activity-log", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/booking-notify", () => ({ notifyBookingCreated: vi.fn(), notifyBookingCancelled: vi.fn() }));

// State the fake transaction reads from.
const state = {
  session: { day: "MONDAY", startTime: "10:00", weeklyPlan: { weekStart: new Date("2026-11-23T00:00:00.000Z") } } as
    | { day: string; startTime: string; weeklyPlan: { weekStart: Date } }
    | null,
  settings: { timezone: "Africa/Tunis", reservationCutoffMinutes: 20 } as { timezone: string; reservationCutoffMinutes: number | null } | null,
  existing: null as { id: string; isCancelled: boolean } | null,
};
const queryRaw = vi.fn();
const sessionFindFirst = vi.fn();
const userSessionCreate = vi.fn();
const userSessionFindUnique = vi.fn();
const userSessionUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        session: { findFirst: (...a: unknown[]) => sessionFindFirst(...a) },
        gymSettings: { findUnique: async () => state.settings },
        userSession: {
          findUnique: (...a: unknown[]) => userSessionFindUnique(...a),
          create: (...a: unknown[]) => userSessionCreate(...a),
          update: vi.fn(),
          updateMany: (...a: unknown[]) => userSessionUpdateMany(...a),
        },
        $queryRaw: (...a: unknown[]) => queryRaw(...a),
      }),
  },
}));

const { POST, DELETE } = await import("../schedule/book/route");

const MIN = 60_000;
const START_MS = Date.parse("2026-11-23T09:00:00.000Z"); // Monday 10:00 Africa/Tunis

function req(body: unknown = { sessionId: "ckxyzsession000000000000001" }) {
  return new NextRequest("https://club-a.example.test/api/dashboard/schedule/book", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function cancelReq(body: unknown = { sessionId: "ckxyzsession000000000000001" }) {
  return new NextRequest("https://club-a.example.test/api/dashboard/schedule/book", {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function setNowMinutesBeforeStart(minutes: number, extraMs = 0) {
  vi.setSystemTime(new Date(START_MS - minutes * MIN + extraMs));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ ok: true, user: { id: "u1", name: "Membre", clubId: "club_A", role: "MEMBER" } });
  state.session = { day: "MONDAY", startTime: "10:00", weeklyPlan: { weekStart: new Date("2026-11-23T00:00:00.000Z") } };
  state.settings = { timezone: "Africa/Tunis", reservationCutoffMinutes: 20 };
  state.existing = null;
  sessionFindFirst.mockImplementation(async () => state.session);
  userSessionFindUnique.mockImplementation(async () => state.existing);
  userSessionUpdateMany.mockResolvedValue({ count: 1 });
  queryRaw.mockResolvedValue([{ id: "s1", currentBookings: 3, capacity: 20, day: "MONDAY", startTime: "10:00", activity: "YOGA", coach: "Sara" }]);
});
afterEach(() => vi.useRealTimers());

describe("POST /api/dashboard/schedule/book — 20 minute cutoff (server-side)", () => {
  it("21 minutes before the session → reservation allowed", async () => {
    setNowMinutesBeforeStart(21);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(userSessionCreate).toHaveBeenCalledOnce();
    expect(userSessionCreate.mock.calls[0][0].data).toMatchObject({ clubId: "club_A", userId: "u1" });
  });

  it("20 minutes before → refused (403 RESERVATION_CLOSED) and nothing is written", async () => {
    setNowMinutesBeforeStart(20);
    const res = await POST(req());
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.code).toBe("RESERVATION_CLOSED");
    expect(json.error).toBe("Les réservations ferment 20 minutes avant le début de la séance.");
    expect(json.closesAt).toBe("2026-11-23T08:40:00.000Z");
    expect(queryRaw).not.toHaveBeenCalled(); // capacity untouched
    expect(userSessionCreate).not.toHaveBeenCalled();
  });

  it("19 minutes before → refused", async () => {
    setNowMinutesBeforeStart(19);
    expect((await POST(req())).status).toBe(403);
  });

  it("1 ms before the closing time is still allowed, the closing instant is refused", async () => {
    setNowMinutesBeforeStart(20, -1);
    expect((await POST(req())).status).toBe(200);
    userSessionCreate.mockClear();
    setNowMinutesBeforeStart(20, 0);
    expect((await POST(req())).status).toBe(403);
  });

  it("after the session started → refused", async () => {
    setNowMinutesBeforeStart(-10);
    expect((await POST(req())).status).toBe(403);
  });

  it("uses the club's own cutoff setting when configured", async () => {
    state.settings = { timezone: "Africa/Tunis", reservationCutoffMinutes: 60 };
    setNowMinutesBeforeStart(45);
    expect((await POST(req())).status).toBe(403);
    setNowMinutesBeforeStart(61);
    expect((await POST(req())).status).toBe(200);
  });

  it("falls back to 20 minutes when the club has no settings row", async () => {
    state.settings = null;
    setNowMinutesBeforeStart(19);
    expect((await POST(req())).status).toBe(403);
    setNowMinutesBeforeStart(21);
    expect((await POST(req())).status).toBe(200);
  });

  it("a session of another club is indistinguishable from a missing one (404), scoped by the authenticated club", async () => {
    state.session = null;
    setNowMinutesBeforeStart(120);
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(sessionFindFirst.mock.calls[0][0].where).toEqual({ id: "ckxyzsession000000000000001", clubId: "club_A" });
  });

  it("ignores any clubId sent by the client", async () => {
    setNowMinutesBeforeStart(120);
    await POST(req({ sessionId: "ckxyzsession000000000000001", clubId: "club_B" }));
    expect(sessionFindFirst.mock.calls[0][0].where.clubId).toBe("club_A");
  });

  it("requires authentication", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401 });
    expect((await POST(req())).status).toBe(401);
  });

  it("only releases capacity when this request atomically cancels the active booking", async () => {
    state.existing = { id: "booking-1", isCancelled: false };
    queryRaw.mockResolvedValue([
      { id: "s1", currentBookings: 2, capacity: 20, day: "MONDAY", startTime: "10:00", activity: "YOGA", coach: "Sara" },
    ]);

    const response = await DELETE(cancelReq());

    expect(response.status).toBe(200);
    expect(userSessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "booking-1", userId: "u1", clubId: "club_A", isCancelled: false },
      data: expect.objectContaining({ isCancelled: true }),
    }));
    expect(userSessionFindUnique).toHaveBeenCalledWith({
      where: { userId_sessionId: { userId: "u1", sessionId: "ckxyzsession000000000000001" }, clubId: "club_A" },
    });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it("does not decrement capacity when a concurrent cancellation already won", async () => {
    state.existing = { id: "booking-1", isCancelled: false };
    userSessionUpdateMany.mockResolvedValue({ count: 0 });

    const response = await DELETE(cancelReq());

    expect(response.status).toBe(409);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
