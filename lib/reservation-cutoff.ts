// lib/reservation-cutoff.ts
//
// Automatic reservation closing rule: a member cannot RESERVE a session that starts in
// `cutoffMinutes` (default 20) minutes or less. This module is pure (no I/O) and is the single
// source of truth used by the booking API (server-side enforcement), the schedule payloads that
// the web and mobile apps read, and the client UI (which only mirrors it for display).
//
// ── The rule, exactly ────────────────────────────────────────────────────────
//   reservation allowed  <=>  (sessionStart − now) > cutoffMinutes   (strict, millisecond precision)
//   reservationClosesAt  =    sessionStart − cutoffMinutes
//
// For a 10:00 session: closesAt = 09:40:00. At 09:39:59 it is still open, from 09:40:00 (and at
// 09:41, 09:59, 10:00 …) it is closed. Equivalently: 21 min before → allowed; 20 min before → closed;
// 19 min before → closed.
//
// NOTE — the original brief lists "09:39 → closed, 09:40 → closed, 09:41 → allowed", which is
// self-contradictory (09:39 precedes 09:40, and 09:41 is only 19 minutes before the start). The
// prose rule ("must not create a reservation when the session starts in 20 minutes or less") and the
// test request (21 / 20 / 19 minutes before) are consistent with each other, so that is what is
// implemented here.
//
// Cancelling an existing booking is NOT governed by this rule, and already-confirmed bookings are
// never cancelled automatically.

import type { DayOfWeek } from "@prisma/client";
import { getSessionDateTime } from "@/lib/session-date";
import { DEFAULT_TIMEZONE, resolveTimeZone } from "@/lib/timezone";

export const DEFAULT_RESERVATION_CUTOFF_MINUTES = 20;
export const MAX_RESERVATION_CUTOFF_MINUTES = 24 * 60;

export type ReservationStatus = "OPEN" | "CLOSED_CUTOFF" | "STARTED";

export interface ClubReservationConfig {
  timeZone: string;
  cutoffMinutes: number;
}

/** Normalises a stored cutoff: integer within [0, 1440]; anything else falls back to the default. */
export function normalizeCutoffMinutes(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_RESERVATION_CUTOFF_MINUTES) {
    return DEFAULT_RESERVATION_CUTOFF_MINUTES;
  }
  return n;
}

/** Reads the club's reservation config from a GymSettings row (null-safe, defaults on bad data). */
export function resolveReservationConfig(
  settings: { timezone?: string | null; reservationCutoffMinutes?: number | null } | null | undefined
): ClubReservationConfig {
  return {
    timeZone: resolveTimeZone(settings?.timezone ?? DEFAULT_TIMEZONE),
    cutoffMinutes: normalizeCutoffMinutes(settings?.reservationCutoffMinutes ?? DEFAULT_RESERVATION_CUTOFF_MINUTES),
  };
}

/** The exact UTC instant a session starts (club-local wall time → UTC, DST-aware). */
export function getSessionStartInstant(
  weekStart: Date | string,
  day: DayOfWeek,
  startTime: string,
  timeZone: string = DEFAULT_TIMEZONE
): Date {
  return getSessionDateTime(weekStart, day, startTime, timeZone);
}

export function getReservationClosesAt(sessionStart: Date, cutoffMinutes: number): Date {
  return new Date(sessionStart.getTime() - cutoffMinutes * 60_000);
}

export interface ReservationState {
  startsAt: Date;
  closesAt: Date;
  open: boolean;
  status: ReservationStatus;
}

export function getReservationState(
  now: Date | number,
  sessionStart: Date,
  cutoffMinutes: number = DEFAULT_RESERVATION_CUTOFF_MINUTES
): ReservationState {
  const nowMs = new Date(now).getTime();
  const closesAt = getReservationClosesAt(sessionStart, cutoffMinutes);
  const msUntilStart = sessionStart.getTime() - nowMs;
  const open = msUntilStart > cutoffMinutes * 60_000;
  const status: ReservationStatus = open ? "OPEN" : msUntilStart <= 0 ? "STARTED" : "CLOSED_CUTOFF";
  return { startsAt: sessionStart, closesAt, open, status };
}

export function isReservationOpen(
  now: Date | number,
  sessionStart: Date,
  cutoffMinutes: number = DEFAULT_RESERVATION_CUTOFF_MINUTES
): boolean {
  return getReservationState(now, sessionStart, cutoffMinutes).open;
}

/** Member-facing message. For the default 20 minutes this is exactly the sentence required by the brief. */
export function reservationClosedMessage(cutoffMinutes: number = DEFAULT_RESERVATION_CUTOFF_MINUTES): string {
  const unit = cutoffMinutes === 1 ? "minute" : "minutes";
  return `Les réservations ferment ${cutoffMinutes} ${unit} avant le début de la séance.`;
}

export interface SessionReservationFields {
  startsAt: string;
  reservationClosesAt: string;
  reservationOpen: boolean;
  reservationStatus: ReservationStatus;
}

/**
 * The additive per-session fields that every schedule payload (web + mobile) exposes.
 * `reservationOpen` is computed at response time; clients should recompute against their own
 * clock from `reservationClosesAt`, while the booking endpoint remains the authority.
 */
export function reservationFieldsForSession(
  session: { day: DayOfWeek; startTime: string },
  weekStart: Date | string,
  config: ClubReservationConfig,
  now: Date | number = new Date()
): SessionReservationFields {
  const start = getSessionStartInstant(weekStart, session.day, session.startTime, config.timeZone);
  const state = getReservationState(now, start, config.cutoffMinutes);
  return {
    startsAt: state.startsAt.toISOString(),
    reservationClosesAt: state.closesAt.toISOString(),
    reservationOpen: state.open,
    reservationStatus: state.status,
  };
}
