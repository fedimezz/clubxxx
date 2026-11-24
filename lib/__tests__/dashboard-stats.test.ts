import { describe, it, expect } from "vitest";
import {
  parseRange, buildBuckets, bucketIndex, countByBucket, sumByBucket, cumulativeSeries, percentChange,
  pickPrimaryCurrency, sumCurrency, classifySubscriptions, buildPlanPerformance, mergeActivity, deriveHealth,
  localDayStart, localMonthStart, localDayOfWeek, localWeekMonday, type HealthInput, type ActivityItem,
} from "../dashboard-stats";

// 2026-11-23 10:00 Tunis (UTC+1) = 09:00Z
const NOW = new Date("2026-11-23T09:00:00.000Z");

describe("range parsing", () => {
  it("accepts the four ranges and falls back to 30d", () => {
    for (const r of ["7d", "30d", "90d", "12m"]) expect(parseRange(r)).toBe(r);
    expect(parseRange("1y")).toBe("30d");
    expect(parseRange(null)).toBe("30d");
    expect(parseRange(undefined)).toBe("30d");
  });
});

describe("club-local calendar helpers", () => {
  it("day start is local midnight (UTC+1)", () => {
    expect(localDayStart(NOW).toISOString()).toBe("2026-11-22T23:00:00.000Z");
    // 23:30Z on the 22nd is already the 23rd in Tunis
    expect(localDayStart(new Date("2026-11-22T23:30:00Z")).toISOString()).toBe("2026-11-22T23:00:00.000Z");
  });
  it("month start, including previous months and year rollover", () => {
    expect(localMonthStart(NOW).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(localMonthStart(new Date("2027-01-10T12:00:00Z"), 1).toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });
  it("weekday and week Monday", () => {
    expect(localDayOfWeek(NOW)).toBe("MONDAY");
    expect(localDayOfWeek(new Date("2026-11-29T12:00:00Z"))).toBe("SUNDAY");
    expect(localWeekMonday(new Date("2026-11-29T12:00:00Z")).toISOString()).toBe("2026-11-23T00:00:00.000Z");
  });
});

describe("buckets", () => {
  it.each([["7d", 7], ["30d", 30], ["90d", 13], ["12m", 12]] as const)("%s → %i contiguous buckets ending now", (range, n) => {
    const b = buildBuckets(range, NOW);
    expect(b).toHaveLength(n);
    for (let i = 1; i < b.length; i++) expect(b[i].start.getTime()).toBe(b[i - 1].end.getTime());
    expect(b.at(-1)!.start.getTime() <= NOW.getTime() && NOW.getTime() < b.at(-1)!.end.getTime()).toBe(true);
    expect(new Set(b.map((x) => x.key)).size).toBe(n);
  });

  it("7d: last bucket is today (club local)", () => {
    const b = buildBuckets("7d", NOW);
    expect(b.at(-1)!.key).toBe("2026-11-23");
    expect(b[0].key).toBe("2026-11-17");
  });

  it("12m crosses the year boundary correctly", () => {
    const b = buildBuckets("12m", new Date("2027-01-15T12:00:00Z"));
    expect(b[0].key.slice(0, 7)).toBe("2026-02");
    expect(b.at(-1)!.key.slice(0, 7)).toBe("2027-01");
  });

  it("bucketIndex / countByBucket place events on the right day and ignore out-of-range or null", () => {
    const b = buildBuckets("7d", NOW);
    expect(bucketIndex(NOW, b)).toBe(6);
    expect(bucketIndex(new Date("2026-11-22T23:00:00.000Z"), b)).toBe(6); // exactly local midnight → new day
    expect(bucketIndex(new Date("2026-11-22T22:59:59.999Z"), b)).toBe(5);
    expect(bucketIndex(new Date("2026-01-01T00:00:00Z"), b)).toBe(-1);
    expect(countByBucket([NOW, NOW, null, undefined, new Date("2020-01-01")], b)).toEqual([0, 0, 0, 0, 0, 0, 2]);
  });

  it("sumByBucket adds amounts per bucket", () => {
    const b = buildBuckets("7d", NOW);
    expect(sumByBucket([{ date: NOW, amount: 50 }, { date: NOW, amount: 25.5 }, { date: null, amount: 99 }], b)[6]).toBe(75.5);
  });

  it("cumulativeSeries starts from the baseline", () => {
    expect(cumulativeSeries(100, [1, 0, 2])).toEqual([101, 101, 103]);
    expect(cumulativeSeries(0, [])).toEqual([]);
  });
});

describe("percentChange", () => {
  it("rounds and refuses a zero/negative base", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(NaN, 10)).toBeNull();
  });
});

describe("money (TND)", () => {
  it("never mixes currencies", () => {
    const rows = [{ currency: "TND", amount: 100 }, { currency: "EUR", amount: 500 }, { currency: "TND", amount: 20 }];
    expect(pickPrimaryCurrency(rows)).toBe("TND");
    expect(sumCurrency(rows, "TND")).toBe(120);
    expect(sumCurrency(rows, "EUR")).toBe(500);
  });
  it("uses another currency only when TND has nothing", () => {
    expect(pickPrimaryCurrency([{ currency: "EUR", amount: 10 }, { currency: "USD", amount: 30 }])).toBe("USD");
    expect(pickPrimaryCurrency([])).toBe("TND");
  });
});

describe("subscriptions", () => {
  const d = (s: string) => new Date(s);
  it("classifies a second subscription of the same member as a renewal", () => {
    const old = { id: "s1", userId: "u1", createdAt: d("2026-01-01") };
    const fresh = { id: "s2", userId: "u1", createdAt: d("2026-11-01") };
    const first = { id: "s3", userId: "u2", createdAt: d("2026-11-02") };
    const map = classifySubscriptions([fresh, first], [old, fresh, first]);
    expect(map.get("s2")).toBe("renewal");
    expect(map.get("s3")).toBe("new");
  });
  it("is deterministic when two subscriptions share a timestamp", () => {
    const a = { id: "a", userId: "u", createdAt: d("2026-11-01") };
    const b = { id: "b", userId: "u", createdAt: d("2026-11-01") };
    const map = classifySubscriptions([a, b], [a, b]);
    expect(map.get("a")).toBe("new");
    expect(map.get("b")).toBe("renewal");
  });
  it("plan performance drops idle plans, sorts by sales, and omits revenue for ADMIN", () => {
    const base = {
      plans: [{ id: "p1", name: "Mensuel" }, { id: "p2", name: "Annuel" }, { id: "p3", name: "Dormant" }],
      sold: [{ planId: "p1", count: 5 }, { planId: "p2", count: 9 }],
      active: [{ planId: "p1", count: 12 }],
    };
    const admin = buildPlanPerformance(base);
    expect(admin.map((r) => r.planId)).toEqual(["p2", "p1"]);
    expect(admin[0]).not.toHaveProperty("revenue");
    const owner = buildPlanPerformance({ ...base, revenueByPlan: new Map([["p1", 300]]) });
    expect(owner.find((r) => r.planId === "p1")!.revenue).toBe(300);
    expect(owner.find((r) => r.planId === "p2")!.revenue).toBe(0);
  });
});

describe("activity feed", () => {
  it("is newest first, limited, with a stable tie-break", () => {
    const mk = (id: string, at: string): ActivityItem => ({ id, kind: "booking", title: id, subtitle: "", at });
    const out = mergeActivity([mk("a", "2026-11-01T00:00:00Z"), mk("c", "2026-11-03T00:00:00Z"), mk("b", "2026-11-03T00:00:00Z")], 2);
    expect(out.map((x) => x.id)).toEqual(["b", "c"]);
  });
});

describe("club health", () => {
  const healthy: HealthInput = {
    slug: "club-a", clubStatus: "ACTIVE", websiteSetupCompleted: true, activeDevices: 3, apkAvailable: true,
    paymentsConfigured: true, emailConfigured: true, customDomain: null, domainRequestStatus: null,
  };
  it("all green when everything is configured", () => {
    const h = deriveHealth(healthy);
    expect(h.overall).toBe("ok");
    expect(h.items.map((i) => i.key)).toEqual(["website", "mobile", "payments", "email", "domain"]);
  });
  it("warns on missing payments/email and errors on a suspended club", () => {
    expect(deriveHealth({ ...healthy, paymentsConfigured: false }).overall).toBe("warn");
    expect(deriveHealth({ ...healthy, clubStatus: "SUSPENDED" }).overall).toBe("error");
    expect(deriveHealth({ ...healthy, websiteSetupCompleted: false }).items[0].status).toBe("warn");
  });
  it("domain states", () => {
    expect(deriveHealth({ ...healthy, customDomain: "club.tn" }).items[4].detail).toBe("club.tn");
    expect(deriveHealth({ ...healthy, domainRequestStatus: "PENDING" }).items[4].status).toBe("warn");
    expect(deriveHealth({ ...healthy, domainRequestStatus: "REJECTED" }).items[4].detail).toBe("Demande refusée");
  });
  it("mobile: connected devices > APK available > warning", () => {
    expect(deriveHealth({ ...healthy, activeDevices: 1 }).items[1].detail).toBe("1 appareil");
    expect(deriveHealth({ ...healthy, activeDevices: 0 }).items[1].detail).toBe("Disponible");
    expect(deriveHealth({ ...healthy, activeDevices: 0, apkAvailable: false }).items[1].status).toBe("warn");
  });
});
