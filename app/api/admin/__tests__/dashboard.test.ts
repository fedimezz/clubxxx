// GET /api/admin/dashboard — auth, role-based financial visibility, tenant scoping, range parsing, empty club.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const requireAdminMock = vi.fn();
vi.mock("@/lib/auth", () => ({ requireAdmin: (...a: unknown[]) => requireAdminMock(...a) }));
vi.mock("@/lib/app-release", () => ({ getAppRelease: () => ({ available: true }) }));
vi.mock("@/lib/payments/availability", () => ({ isStripeConfigured: () => false }));

// Every prisma call is recorded as "model.method" → list of args; return values come from `returns`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recorded prisma args are arbitrary shapes
const calls: Array<{ key: string; args: any }> = [];
let returns: Record<string, unknown> = {};

const DEFAULTS: Record<string, unknown> = {
  count: 0,
  groupBy: [],
  findMany: [],
  findFirst: null,
  findUnique: null,
  aggregate: { _count: { _all: 0 }, _sum: { capacity: null } },
};

vi.mock("@/lib/prisma", () => {
  const model = (name: string) =>
    new Proxy({}, {
      get: (_t, method: string) => async (args: unknown) => {
        const key = `${name}.${method}`;
        calls.push({ key, args });
        return key in returns ? returns[key] : DEFAULTS[method];
      },
    });
  return { default: new Proxy({}, { get: (_t, name: string) => model(name) }) };
});

const { GET } = await import("../dashboard/route");

const OWNER = { id: "o1", role: "OWNER", clubId: "club_A" };
const ADMIN = { id: "a1", role: "ADMIN", clubId: "club_A" };

const req = (qs = "") => new NextRequest(`https://club-a.example.test/api/admin/dashboard${qs}`);
const whereOf = (key: string) => calls.filter((c) => c.key === key).map((c) => c.args?.where);

beforeEach(() => {
  calls.length = 0;
  returns = {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-23T09:00:00.000Z"));
  requireAdminMock.mockResolvedValue({ ok: true, user: OWNER });
});
afterEach(() => vi.useRealTimers());

describe("GET /api/admin/dashboard", () => {
  it("rejects unauthenticated / forbidden callers", async () => {
    requireAdminMock.mockResolvedValue({ ok: false, status: 401 });
    expect((await GET(req())).status).toBe(401);
    requireAdminMock.mockResolvedValue({ ok: false, status: 403 });
    expect((await GET(req())).status).toBe(403);
    expect(calls).toHaveLength(0); // no DB access before the auth check
  });

  it("empty club → zeros, empty series, no crash", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.stats).toMatchObject({
      activeMembers: 0, todayReservations: 0, pendingSubscriptions: 0, newMembersThisMonth: 0, expiredMemberships: 0,
    });
    expect(j.stats.newMembersGrowthPct).toBeNull();
    expect(j.stats.revenueMonth.amount).toBe(0);
    expect(j.stats.revenueMonth.currency).toBe("TND");
    expect(j.series.buckets).toHaveLength(30); // default range = 30d
    expect(j.series.members).toEqual(new Array(30).fill(0));
    expect(j.subscriptionPerformance).toEqual([]);
    expect(j.activity).toEqual([]);
    expect(j.health.items.map((i: { key: string }) => i.key)).toEqual(["website", "mobile", "payments", "email", "domain"]);
  });

  it("returns the real counts from the database (stats vs DB)", async () => {
    returns = {
      "user.count": 42, // every user.count returns 42 — checked through the shape below
      "subscription.count": 7,
      "userSession.count": 11,
      "subscription.groupBy": [
        { userId: "u1", planId: "p1", _count: { _all: 1 } },
        { userId: "u2", planId: "p1", _count: { _all: 1 } },
        { userId: "u3", planId: "p2", _count: { _all: 1 } },
      ],
      "session.aggregate": { _count: { _all: 5 }, _sum: { capacity: 80 } },
      "deviceToken.count": 2,
      "notification.count": 4,
    };
    const j = await (await GET(req())).json();
    expect(j.stats.activeMembers).toBe(42);
    expect(j.stats.totalMembers).toBe(42);
    expect(j.stats.todayReservations).toBe(11);
    expect(j.stats.todaySessions).toBe(5);
    expect(j.stats.todayCapacity).toBe(80);
    expect(j.stats.pendingSubscriptions).toBe(7);
    expect(j.stats.membersWithActiveSubscription).toBe(3);
    expect(j.stats.expiredMemberships).toBe(3);
    expect(j.notifications.unread).toBe(4);
  });

  it("OWNER sees revenue in TND and the SaaS plan", async () => {
    returns = {
      "payment.groupBy": [{ currency: "TND", _sum: { amount: 1250.5 } }],
      "club.findUnique": {
        name: "Club A", slug: "club-a", status: "ACTIVE", customDomain: null, trialEndsAt: null,
        subscription: { status: "ACTIVE", currentPeriodEnd: null, cancelAtPeriodEnd: false, plan: { tier: "PRO", name: "Pro", priceMonthly: 99, limits: { members: 500 } } },
      },
    };
    const j = await (await GET(req())).json();
    expect(j.role).toBe("OWNER");
    expect(j.stats.revenueMonth.currency).toBe("TND");
    expect(j.stats.revenueMonth.amount).toBe(1250.5);
    expect(j.series.revenue).toHaveLength(30);
    expect(j.saasPlan.tier).toBe("PRO");
    expect(j.club.status).toBe("ACTIVE");
  });

  it("ADMIN never receives revenue, payments, SaaS plan or club billing status", async () => {
    requireAdminMock.mockResolvedValue({ ok: true, user: ADMIN });
    returns = {
      "payment.groupBy": [{ currency: "TND", _sum: { amount: 9999 } }],
      "payment.findMany": [{ id: "p", amount: 9999, currency: "TND", paidAt: new Date(), subscription: null }],
      "club.findUnique": {
        name: "Club A", slug: "club-a", status: "ACTIVE", customDomain: null, trialEndsAt: null,
        subscription: { status: "ACTIVE", currentPeriodEnd: null, cancelAtPeriodEnd: false, plan: { tier: "PRO", name: "Pro", priceMonthly: 99, limits: {} } },
      },
    };
    const res = await GET(req());
    const text = JSON.stringify(await res.json());
    const j = JSON.parse(text);
    expect(j.role).toBe("ADMIN");
    expect(j.stats).not.toHaveProperty("revenueMonth");
    expect(j.series).not.toHaveProperty("revenue");
    expect(j).not.toHaveProperty("saasPlan");
    expect(j.club).not.toHaveProperty("status");
    expect(text).not.toContain("9999");
    expect(j.activity.some((a: { kind: string }) => a.kind === "payment")).toBe(false);
    expect(calls.some((c) => c.key.startsWith("payment."))).toBe(false); // not even queried
  });

  it("every query is scoped to the authenticated club — the client cannot choose one", async () => {
    await GET(req("?clubId=club_B&range=7d"));
    const scoped = calls.filter((c) => c.args && "where" in c.args);
    expect(scoped.length).toBeGreaterThan(15);
    for (const c of scoped) {
      const w = JSON.stringify(c.args.where);
      const key = c.key;
      // club.findUnique filters by id; everything else by clubId
      if (key === "club.findUnique") expect(c.args.where).toEqual({ id: "club_A" });
      else expect(w, key).toContain('"clubId":"club_A"');
      expect(w, key).not.toContain("club_B");
    }
  });

  it("nested relation filters are also tenant-scoped (today's reservations)", async () => {
    await GET(req());
    const w = whereOf("userSession.count")[0];
    expect(w.clubId).toBe("club_A");
    expect(w.session.clubId).toBe("club_A");
    expect(w.session.weeklyPlan.clubId).toBe("club_A");
    expect(w.session.day).toBe("MONDAY");
  });

  it("parses the range and falls back to 30d for junk", async () => {
    expect((await (await GET(req("?range=7d"))).json()).series.buckets).toHaveLength(7);
    expect((await (await GET(req("?range=90d"))).json()).series.buckets).toHaveLength(13);
    expect((await (await GET(req("?range=12m"))).json()).series.buckets).toHaveLength(12);
    const j = await (await GET(req("?range=DROP%20TABLE"))).json();
    expect(j.range).toBe("30d");
    expect(j.series.buckets).toHaveLength(30);
  });

  it("is never cached", async () => {
    expect((await GET(req())).headers.get("Cache-Control")).toContain("no-store");
  });

  it("returns a generic 500 (no internals) when the database fails", async () => {
    returns = {};
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    requireAdminMock.mockRejectedValue(new Error("db password leaked"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("leaked");
    spy.mockRestore();
  });
});
