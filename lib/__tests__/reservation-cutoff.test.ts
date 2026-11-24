import { describe, it, expect } from "vitest";
import {
  DEFAULT_RESERVATION_CUTOFF_MINUTES,
  getReservationClosesAt,
  getReservationState,
  getSessionStartInstant,
  isReservationOpen,
  normalizeCutoffMinutes,
  reservationClosedMessage,
  reservationFieldsForSession,
  resolveReservationConfig,
} from "../reservation-cutoff";

const MIN = 60_000;
// Monday 2026-11-23 10:00 in Africa/Tunis (UTC+1, no DST) = 09:00Z
const WEEK = new Date("2026-11-23T00:00:00.000Z");
const START = getSessionStartInstant(WEEK, "MONDAY", "10:00", "Africa/Tunis");

describe("reservation cutoff — core rule", () => {
  it("computes the session start in the club timezone", () => {
    expect(START.toISOString()).toBe("2026-11-23T09:00:00.000Z");
  });

  it("closes the reservation 20 minutes before the start (10:00 → 09:40)", () => {
    expect(getReservationClosesAt(START, 20).toISOString()).toBe("2026-11-23T08:40:00.000Z");
  });

  it("21 minutes before → allowed", () => {
    expect(isReservationOpen(START.getTime() - 21 * MIN, START)).toBe(true);
  });
  it("20 minutes before → closed", () => {
    expect(isReservationOpen(START.getTime() - 20 * MIN, START)).toBe(false);
  });
  it("19 minutes before → closed", () => {
    expect(isReservationOpen(START.getTime() - 19 * MIN, START)).toBe(false);
  });

  it("has millisecond precision around the boundary", () => {
    expect(isReservationOpen(START.getTime() - 20 * MIN - 1, START)).toBe(true);
    expect(isReservationOpen(START.getTime() - 20 * MIN, START)).toBe(false);
    expect(isReservationOpen(START.getTime() - 20 * MIN + 1, START)).toBe(false);
  });

  it("reports CLOSED_CUTOFF inside the window and STARTED once the session began", () => {
    expect(getReservationState(START.getTime() - 5 * MIN, START).status).toBe("CLOSED_CUTOFF");
    expect(getReservationState(START.getTime(), START).status).toBe("STARTED");
    expect(getReservationState(START.getTime() + 30 * MIN, START).status).toBe("STARTED");
    expect(getReservationState(START.getTime() - 3 * 60 * MIN, START).status).toBe("OPEN");
  });

  it("defaults to 20 minutes", () => {
    expect(DEFAULT_RESERVATION_CUTOFF_MINUTES).toBe(20);
    expect(getReservationState(START.getTime() - 21 * MIN, START).open).toBe(true);
  });

  it("honours a club-specific cutoff", () => {
    expect(isReservationOpen(START.getTime() - 40 * MIN, START, 60)).toBe(false);
    expect(isReservationOpen(START.getTime() - 61 * MIN, START, 60)).toBe(true);
    expect(isReservationOpen(START.getTime() - 1 * MIN, START, 0)).toBe(true);
  });
});

describe("reservation cutoff — timezone & DST", () => {
  it("uses the club's own timezone, not the server's", () => {
    // Same wall-clock 10:00 in Tunis (UTC+1) and in Tokyo (UTC+9) are different instants.
    const tunis = getSessionStartInstant(WEEK, "MONDAY", "10:00", "Africa/Tunis");
    const tokyo = getSessionStartInstant(WEEK, "MONDAY", "10:00", "Asia/Tokyo");
    expect(tunis.getTime() - tokyo.getTime()).toBe(8 * 60 * MIN);
    // A "now" of 08:45Z is 15 min before the Tunis session (closed) but long before Tokyo's (01:00Z).
    const now = new Date("2026-11-23T08:45:00Z");
    expect(isReservationOpen(now, tunis)).toBe(false);
    expect(isReservationOpen(now, tokyo)).toBe(false); // Tokyo's started hours ago
    expect(isReservationOpen(new Date("2026-11-23T00:00:00Z"), tokyo)).toBe(true);
  });

  it("handles the spring-forward transition (Europe/Paris, 2026-03-29)", () => {
    // Monday of that week is 2026-03-23; Sunday 2026-03-29 10:00 is already CEST (UTC+2) = 08:00Z.
    const monday = new Date("2026-03-23T00:00:00.000Z");
    const sundayStart = getSessionStartInstant(monday, "SUNDAY", "10:00", "Europe/Paris");
    expect(sundayStart.toISOString()).toBe("2026-03-29T08:00:00.000Z");
    // Saturday 10:00 is still CET (UTC+1) = 09:00Z.
    expect(getSessionStartInstant(monday, "SATURDAY", "10:00", "Europe/Paris").toISOString()).toBe("2026-03-28T09:00:00.000Z");
    // cutoff is measured on the real instant, so it is exactly 20 real minutes either side of the DST change.
    expect(getReservationClosesAt(sundayStart, 20).toISOString()).toBe("2026-03-29T07:40:00.000Z");
  });

  it("handles the autumn fall-back transition (Europe/Paris, 2026-10-25)", () => {
    const monday = new Date("2026-10-19T00:00:00.000Z");
    // Sunday 25 Oct 10:00 is CET (UTC+1) = 09:00Z after the clocks went back.
    expect(getSessionStartInstant(monday, "SUNDAY", "10:00", "Europe/Paris").toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });
});

describe("reservation cutoff — config & payload fields", () => {
  it("normalises cutoff minutes and falls back to 20 on bad data", () => {
    expect(normalizeCutoffMinutes(30)).toBe(30);
    expect(normalizeCutoffMinutes(0)).toBe(0);
    expect(normalizeCutoffMinutes(-5)).toBe(20);
    expect(normalizeCutoffMinutes(1.5)).toBe(20);
    expect(normalizeCutoffMinutes("abc")).toBe(20);
    expect(normalizeCutoffMinutes(99999)).toBe(20);
    expect(normalizeCutoffMinutes(undefined)).toBe(20);
  });

  it("resolves a null/invalid settings row to Africa/Tunis + 20 minutes", () => {
    expect(resolveReservationConfig(null)).toEqual({ timeZone: "Africa/Tunis", cutoffMinutes: 20 });
    expect(resolveReservationConfig({ timezone: "Not/AZone", reservationCutoffMinutes: null })).toEqual({ timeZone: "Africa/Tunis", cutoffMinutes: 20 });
    expect(resolveReservationConfig({ timezone: "Europe/Paris", reservationCutoffMinutes: 45 })).toEqual({ timeZone: "Europe/Paris", cutoffMinutes: 45 });
  });

  it("uses the exact member-facing sentence", () => {
    expect(reservationClosedMessage()).toBe("Les réservations ferment 20 minutes avant le début de la séance.");
    expect(reservationClosedMessage(1)).toBe("Les réservations ferment 1 minute avant le début de la séance.");
  });

  it("exposes startsAt / reservationClosesAt / status on schedule payloads", () => {
    const cfg = { timeZone: "Africa/Tunis", cutoffMinutes: 20 };
    const fields = reservationFieldsForSession({ day: "MONDAY", startTime: "10:00" }, WEEK, cfg, new Date("2026-11-23T08:39:00Z"));
    expect(fields).toEqual({
      startsAt: "2026-11-23T09:00:00.000Z",
      reservationClosesAt: "2026-11-23T08:40:00.000Z",
      reservationOpen: true,
      reservationStatus: "OPEN",
    });
    const closed = reservationFieldsForSession({ day: "MONDAY", startTime: "10:00" }, WEEK, cfg, new Date("2026-11-23T08:40:00Z"));
    expect(closed.reservationOpen).toBe(false);
    expect(closed.reservationStatus).toBe("CLOSED_CUTOFF");
  });
});
