// src/lib/session-date.ts
//
// Sessions store `day` as a DayOfWeek enum (MONDAY..SUNDAY) and belong to a
// WeeklyPlan that has a concrete weekStart date. This file is the single
// place that turns that pair into a real calendar Date — every other part
// of the app (UI, cron job, etc.) should go through here instead of doing
// its own offset math, so the "Monday = index 0" assumption only lives once.

import { DayOfWeek } from "@prisma/client";
import { DEFAULT_TIMEZONE, isoDateInZone, resolveTimeZone, zonedWallTimeToUtc } from "@/lib/timezone";

// The default club timezone is Africa/Tunis (fixed UTC+1, no DST since 2005). Every helper below
// takes an optional IANA `timeZone` (GymSettings.timezone) and converts with lib/timezone.ts.

// Index matches the order WeeklyPlan.weekStart is assumed to represent
// (i.e. weekStart IS the Monday of that week).
const DAY_OFFSET: Record<DayOfWeek, number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
};

/**
 * Returns the real calendar Date for a session, given the Monday
 * (weekStart) of its WeeklyPlan and its DayOfWeek.
 *
 * The time-of-day on the returned Date is midnight UTC of that day —
 * callers that need the session's start time should combine this with
 * `session.startTime` themselves (see `getSessionDateTime`).
 */
export function getSessionDate(weekStart: Date | string, day: DayOfWeek): Date {
  const base = new Date(weekStart);
  const result = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate())
  );
  result.setUTCDate(result.getUTCDate() + DAY_OFFSET[day]);
  return result;
}

/**
 * Same as getSessionDate, but also applies the session's startTime
 * ("HH:mm" string) so the result is the exact moment the session begins.
 *
 * `startTime` is entered by staff (via <input type="time">) and always
 * means club-local wall-clock time (Africa/Tunis, UTC+1) — it is NOT a
 * UTC time. This used to call `setUTCHours(hours, minutes, ...)` directly,
 * which silently treated "20:00" as 20:00 UTC (= 21:00 in Tunis) instead
 * of 20:00 Tunis (= 19:00 UTC). Every comparison against a real `now`
 * (cleanup job, "next session" widget, session-creation past-time check)
 * was therefore off by exactly the club's UTC offset — a session could
 * look already-over to a member an hour before it actually started, or
 * still look upcoming an hour after it had already begun. Subtracting the
 * offset here converts the local wall-clock time to the correct UTC
 * instant before any comparison happens.
 */
export function getSessionDateTime(
  weekStart: Date | string,
  day: DayOfWeek,
  startTime: string,
  timeZone: string = DEFAULT_TIMEZONE
): Date {
  const date = getSessionDate(weekStart, day);
  const [hours, minutes] = startTime.split(":").map(Number);
  // `timeZone` is the club's IANA zone (GymSettings.timezone). The conversion is DST-aware, so it
  // stays correct for clubs in zones that observe daylight saving. For the default (Africa/Tunis,
  // fixed UTC+1) the result is identical to the old constant-offset arithmetic.
  return zonedWallTimeToUtc(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    hours,
    minutes,
    resolveTimeZone(timeZone)
  );
}

/**
 * Maps today's real-world weekday to the DayOfWeek enum, e.g. for finding
 * "today's sessions" regardless of which WeeklyPlan they belong to.
 *
 * Computed in club-local time, not UTC — near midnight (e.g. 00:30 Tunis
 * = 23:30 UTC the previous day) the plain UTC day would have reported
 * yesterday's weekday instead of today's.
 */
export function todayAsDayOfWeek(reference: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): DayOfWeek {
  const [y, m, d] = isoDateInZone(reference, resolveTimeZone(timeZone)).split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  const ORDER: DayOfWeek[] = [
    "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY",
  ];
  return ORDER[jsDay];
}

/**
 * French long-form date label for display, e.g. "lundi 6 juillet 2026".
 */
export function formatSessionDateFR(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Returns true if the given calendar date is today, compared in
 * club-local time (Africa/Tunis) rather than raw UTC — same reasoning as
 * `todayAsDayOfWeek` above.
 */
export function isToday(date: Date, reference: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): boolean {
  const iso = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return iso === isoDateInZone(reference, resolveTimeZone(timeZone));
}