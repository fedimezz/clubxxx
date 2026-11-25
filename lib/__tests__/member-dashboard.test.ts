import { describe, expect, it } from "vitest";
import {
  attendanceRate,
  buildActivitySeries,
  bucketsFor,
  currentWeek,
  last30VsPrevious30,
  membershipElapsedPercent,
  parseActivityRange,
  percentTrend,
  weeklyCounts,
} from "@/lib/member-dashboard";

// 2026-11-24 is a Tuesday.
const TODAY = "2026-11-24";

describe("parseActivityRange", () => {
  it("accepts the four ranges and falls back to 7d", () => {
    expect(parseActivityRange("30d")).toBe("30d");
    expect(parseActivityRange("3m")).toBe("3m");
    expect(parseActivityRange("1y")).toBe("1y");
    expect(parseActivityRange("nope")).toBe("7d");
    expect(parseActivityRange(null)).toBe("7d");
  });
});

describe("percentTrend", () => {
  it("returns a rounded percentage", () => {
    expect(percentTrend(12, 10)).toBe(20);
    expect(percentTrend(5, 10)).toBe(-50);
  });
  it("returns null when there is nothing to compare with (never a fake number)", () => {
    expect(percentTrend(5, 0)).toBeNull();
    expect(percentTrend(0, 0)).toBeNull();
  });
});

describe("currentWeek", () => {
  it("is Monday..Sunday of the club-local week", () => {
    const w = currentWeek(new Date("2026-11-24T10:00:00Z"), "Africa/Tunis");
    expect(w.start).toBe("2026-11-23");
    expect(w.end).toBe("2026-11-29");
    expect(w.days).toHaveLength(7);
  });
  it("uses the club zone around midnight (Sunday 23:30 UTC is already Monday in Tunis)", () => {
    const w = currentWeek(new Date("2026-11-22T23:30:00Z"), "Africa/Tunis");
    expect(w.start).toBe("2026-11-23");
  });
});

describe("buildActivitySeries", () => {
  it("7d: 7 daily buckets ending today, counts land on the right day", () => {
    const s = buildActivitySeries("7d", ["2026-11-24", "2026-11-24", "2026-11-20"], ["2026-11-23"], TODAY);
    expect(s).toHaveLength(7);
    expect(s[6].reservations).toBe(2);
    expect(s[6].label).toBe("Mar");
    expect(s[2].reservations).toBe(1); // 20 Nov
    expect(s[5].attendances).toBe(1); // 23 Nov
  });
  it("ignores days outside the window", () => {
    const s = buildActivitySeries("7d", ["2026-10-01", "2026-12-30"], [], TODAY);
    expect(s.reduce((n, p) => n + p.reservations, 0)).toBe(0);
  });
  it("30d: 30 buckets", () => {
    expect(buildActivitySeries("30d", [], [], TODAY)).toHaveLength(30);
  });
  it("3m: 13 weekly buckets, current week last", () => {
    const s = buildActivitySeries("3m", ["2026-11-24", "2026-11-29"], [], TODAY);
    expect(s).toHaveLength(13);
    expect(s[12].reservations).toBe(2);
  });
  it("1y: 12 monthly buckets across a year boundary", () => {
    const { buckets } = bucketsFor("1y", "2026-02-10");
    expect(buckets).toHaveLength(12);
    expect(buckets[11].key).toBe("2026-02");
    expect(buckets[0].key).toBe("2025-03");
    const s = buildActivitySeries("1y", ["2025-12-15", "2026-02-01"], ["2025-03-01"], "2026-02-10");
    expect(s[9].reservations).toBe(1);
    expect(s[11].reservations).toBe(1);
    expect(s[0].attendances).toBe(1);
  });
});

describe("weeklyCounts / last30VsPrevious30", () => {
  it("buckets by Monday-based weeks, current week last", () => {
    const c = weeklyCounts(["2026-11-24", "2026-11-23", "2026-11-16", "2026-01-01"], TODAY, 8);
    expect(c).toHaveLength(8);
    expect(c[7]).toBe(2);
    expect(c[6]).toBe(1);
    expect(c.reduce((a, b) => a + b, 0)).toBe(3);
  });
  it("splits the last 30 days from the 30 before", () => {
    const r = last30VsPrevious30(["2026-11-24", "2026-10-26", "2026-10-25", "2026-09-26", "2026-09-25"], TODAY);
    expect(r).toEqual({ current: 2, previous: 2 });
  });
});

describe("attendanceRate", () => {
  it("is null without past bookings, capped at 100", () => {
    expect(attendanceRate(0, 3)).toBeNull();
    expect(attendanceRate(4, 3)).toBe(75);
    expect(attendanceRate(2, 5)).toBe(100);
  });
});

describe("membershipElapsedPercent", () => {
  it("computes from real dates and clamps", () => {
    const start = new Date("2026-11-01T00:00:00Z");
    const end = new Date("2026-12-01T00:00:00Z");
    expect(membershipElapsedPercent(start, end, new Date("2026-11-16T00:00:00Z"))).toBe(50);
    expect(membershipElapsedPercent(start, end, new Date("2027-01-01T00:00:00Z"))).toBe(100);
    expect(membershipElapsedPercent(null, end, new Date())).toBeNull();
    expect(membershipElapsedPercent(end, start, new Date())).toBeNull();
  });
});
