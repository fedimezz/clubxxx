// lib/member-dashboard.ts
//
// Pure helpers behind GET /api/dashboard (member dashboard). No Prisma, no clock reads: everything
// takes `now` and the club's IANA time zone, so it is deterministic and unit-testable.
//
// Every number produced here comes from rows the member really owns (bookings, check-ins,
// notifications). Nothing is estimated or invented; when there is nothing to compare, helpers
// return `null` so the UI can say so instead of showing a fake percentage.

import {
  addDays,
  diffDays,
  formatIso,
  MONTHS_SHORT_FR,
  parseIso,
  startOfMonth,
  startOfWeek,
  WEEKDAYS_SHORT_FR,
  weekdayIndex,
  type IsoDate,
} from "@/lib/calendar-nav";
import { isoDateInZone } from "@/lib/timezone";

export const ACTIVITY_RANGES = ["7d", "30d", "3m", "1y"] as const;
export type ActivityRange = (typeof ACTIVITY_RANGES)[number];

export interface ActivityPoint {
  /** Short x-axis label ("Lun", "12", "sept.", ...). */
  label: string;
  /** Longer label for tooltips ("Lundi 24 nov."). */
  title: string;
  /** Sessions the member booked that take place in this bucket (cancelled ones excluded). */
  reservations: number;
  /** Check-ins recorded for the member in this bucket. */
  attendances: number;
}

export function parseActivityRange(value: unknown): ActivityRange {
  return (ACTIVITY_RANGES as readonly string[]).includes(value as string) ? (value as ActivityRange) : "7d";
}

/** Club-local calendar day of an instant ("YYYY-MM-DD"). */
export function localDay(instant: Date | string | number, timeZone: string): IsoDate {
  return isoDateInZone(typeof instant === "object" ? instant : new Date(instant), timeZone);
}

/** Percentage change current vs previous. `null` when there is no previous value to compare with. */
export function percentTrend(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Monday..Sunday ISO dates of the club-local week containing `now`. */
export function currentWeek(now: Date, timeZone: string): { start: IsoDate; end: IsoDate; days: IsoDate[] } {
  const today = localDay(now, timeZone);
  const start = startOfWeek(today);
  return { start, end: addDays(start, 6), days: Array.from({ length: 7 }, (_, i) => addDays(start, i)) };
}

interface Bucket {
  key: string;
  label: string;
  title: string;
}

function dayTitle(iso: IsoDate): string {
  const c = parseIso(iso);
  if (!c) return iso;
  const names = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  return `${names[weekdayIndex(iso)]} ${c.d} ${MONTHS_SHORT_FR[c.m - 1]}`;
}

/** Bucket definitions for a range, oldest first, ending with the bucket that contains today. */
export function bucketsFor(range: ActivityRange, today: IsoDate): { buckets: Bucket[]; keyOf: (iso: IsoDate) => string | null } {
  if (range === "7d" || range === "30d") {
    const n = range === "7d" ? 7 : 30;
    const first = addDays(today, -(n - 1));
    const buckets: Bucket[] = Array.from({ length: n }, (_, i) => {
      const iso = addDays(first, i);
      const c = parseIso(iso)!;
      const weekday = WEEKDAYS_SHORT_FR[weekdayIndex(iso)];
      return { key: iso, label: range === "7d" ? weekday : String(c.d), title: dayTitle(iso) };
    });
    return { buckets, keyOf: (iso) => (iso >= first && iso <= today ? iso : null) };
  }

  if (range === "3m") {
    // 13 weekly buckets (Monday-based), the last one is the current week.
    const lastMonday = startOfWeek(today);
    const firstMonday = addDays(lastMonday, -7 * 12);
    const buckets: Bucket[] = Array.from({ length: 13 }, (_, i) => {
      const monday = addDays(firstMonday, i * 7);
      const c = parseIso(monday)!;
      return { key: monday, label: `${c.d} ${MONTHS_SHORT_FR[c.m - 1]}`, title: `Semaine du ${c.d} ${MONTHS_SHORT_FR[c.m - 1]}` };
    });
    return {
      buckets,
      keyOf: (iso) => {
        if (iso < firstMonday || iso > addDays(lastMonday, 6)) return null;
        return addDays(firstMonday, Math.floor(diffDays(firstMonday, iso) / 7) * 7);
      },
    };
  }

  // "1y": 12 monthly buckets, the last one is the current month.
  const cur = parseIso(startOfMonth(today))!;
  const buckets: Bucket[] = Array.from({ length: 12 }, (_, i) => {
    const offset = 11 - i;
    let y = cur.y;
    let m = cur.m - offset;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    return { key: formatIso(y, m, 1).slice(0, 7), label: MONTHS_SHORT_FR[m - 1], title: `${MONTHS_SHORT_FR[m - 1]} ${y}` };
  });
  const keys = new Set(buckets.map((b) => b.key));
  return { buckets, keyOf: (iso) => (keys.has(iso.slice(0, 7)) ? iso.slice(0, 7) : null) };
}

/**
 * Real activity series. `reservationDays` = club-local days of the member's non-cancelled bookings
 * (the day the session takes place), `attendanceDays` = club-local days of the member's check-ins.
 */
export function buildActivitySeries(
  range: ActivityRange,
  reservationDays: readonly IsoDate[],
  attendanceDays: readonly IsoDate[],
  today: IsoDate
): ActivityPoint[] {
  const { buckets, keyOf } = bucketsFor(range, today);
  const byKey = new Map<string, ActivityPoint>(
    buckets.map((b) => [b.key, { label: b.label, title: b.title, reservations: 0, attendances: 0 }])
  );
  for (const d of reservationDays) {
    const k = keyOf(d);
    if (k) byKey.get(k)!.reservations += 1;
  }
  for (const d of attendanceDays) {
    const k = keyOf(d);
    if (k) byKey.get(k)!.attendances += 1;
  }
  return buckets.map((b) => byKey.get(b.key)!);
}

/** Weekly counts for the last `weeks` weeks (oldest first) — used by KPI sparklines. */
export function weeklyCounts(days: readonly IsoDate[], today: IsoDate, weeks = 8): number[] {
  const lastMonday = startOfWeek(today);
  const firstMonday = addDays(lastMonday, -7 * (weeks - 1));
  const out = Array.from({ length: weeks }, () => 0);
  for (const d of days) {
    if (d < firstMonday || d > addDays(lastMonday, 6)) continue;
    out[Math.floor(diffDays(firstMonday, d) / 7)] += 1;
  }
  return out;
}

/** Counts of `days` inside (today-29 .. today) and the 30 days before that. */
export function last30VsPrevious30(days: readonly IsoDate[], today: IsoDate): { current: number; previous: number } {
  const curStart = addDays(today, -29);
  const prevStart = addDays(today, -59);
  let current = 0;
  let previous = 0;
  for (const d of days) {
    if (d >= curStart && d <= today) current += 1;
    else if (d >= prevStart && d < curStart) previous += 1;
  }
  return { current, previous };
}

/**
 * Attendance rate over a period: check-ins ÷ non-cancelled bookings whose session already took
 * place. `null` when the member had no past booking (nothing to rate). Capped at 100.
 */
export function attendanceRate(pastBookings: number, attended: number): number | null {
  if (pastBookings <= 0) return null;
  return Math.min(100, Math.round((attended / pastBookings) * 100));
}

/** Elapsed share (0-100) of a membership period — real start/end dates. `null` if unusable. */
export function membershipElapsedPercent(start: Date | null, end: Date | null, now: Date): number | null {
  if (!start || !end) return null;
  const total = end.getTime() - start.getTime();
  if (!(total > 0)) return null;
  return Math.max(0, Math.min(100, Math.round(((now.getTime() - start.getTime()) / total) * 100)));
}
