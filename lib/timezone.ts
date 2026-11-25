// lib/timezone.ts
//
// Minimal, dependency-free IANA timezone helpers built on Intl.DateTimeFormat.
// Used to turn a club-local wall-clock time ("2026-11-23" + "10:00" in Africa/Tunis)
// into the exact UTC instant, correctly across daylight-saving transitions.

export const DEFAULT_TIMEZONE = "Africa/Tunis";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Returns `timeZone` when it is a valid IANA zone, otherwise the default. */
export function resolveTimeZone(timeZone: unknown): string {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock reading in `timeZone` at the given instant. */
export function wallClockInZone(instant: Date | number, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset (ms) of `timeZone` from UTC at the given instant: local = utc + offset. */
export function tzOffsetMs(instant: Date | number, timeZone: string): number {
  const ms = Math.floor(new Date(instant).getTime() / 1000) * 1000;
  const w = wallClockInZone(ms, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - ms;
}

/**
 * Converts a club-local wall-clock date+time into the UTC instant.
 *
 * DST edge cases (documented behaviour):
 * - Spring-forward gap (the wall time does not exist, e.g. 02:30 on the night the clocks
 *   jump 02:00 → 03:00): resolved with the pre-transition offset, i.e. it lands at the
 *   equivalent moment just after the gap (03:30 local).
 * - Fall-back overlap (the wall time happens twice): the FIRST occurrence is used.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const DAY = 24 * 60 * 60 * 1000;
  const offsetBefore = tzOffsetMs(guess - DAY, timeZone);
  const offsetAfter = tzOffsetMs(guess + DAY, timeZone);

  const matches = (candidate: number) => {
    const w = wallClockInZone(candidate, timeZone);
    return (
      w.year === year && w.month === month && w.day === day && w.hour === hour && w.minute === minute
    );
  };

  const candidates = [...new Set([guess - offsetBefore, guess - offsetAfter])].filter(matches);
  if (candidates.length > 0) return new Date(Math.min(...candidates));
  // Gap: no instant displays this wall time. Use the pre-transition offset.
  return new Date(guess - offsetBefore);
}

/** UTC instant at the start of the club-local calendar day containing `instant`. */
export function startOfDayInZone(instant: Date | number, timeZone: string): Date {
  const zone = resolveTimeZone(timeZone);
  const { year, month, day } = wallClockInZone(instant, zone);
  return zonedWallTimeToUtc(year, month, day, 0, 0, zone);
}

/** "YYYY-MM-DD" of the calendar day `instant` falls on in `timeZone`. */
export function isoDateInZone(instant: Date | number, timeZone: string): string {
  const w = wallClockInZone(instant, timeZone);
  return `${String(w.year).padStart(4, "0")}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

/** "HH:mm" wall-clock time of `instant` in `timeZone`. */
export function timeInZone(instant: Date | number, timeZone: string): string {
  const w = wallClockInZone(instant, timeZone);
  return `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
}
