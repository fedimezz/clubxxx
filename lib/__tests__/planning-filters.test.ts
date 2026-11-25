import { describe, expect, it } from "vitest";
import { filterSessions, sessionAvailability, type FilterableSession } from "@/lib/planning-filters";

const NOW = Date.parse("2026-11-26T08:00:00Z");
const s = (o: Partial<FilterableSession> = {}): FilterableSession => ({
  activity: "YOGA", coach: "Sarra", location: "Studio", isBookedByUser: false, isFull: false,
  reservationClosesAt: "2026-11-26T08:40:00Z", ...o,
});

describe("sessionAvailability", () => {
  it("never reports a full / cancelled-cutoff session as available", () => {
    expect(sessionAvailability(s(), NOW)).toBe("available");
    expect(sessionAvailability(s({ isFull: true }), NOW)).toBe("full");
    expect(sessionAvailability(s({ reservationClosesAt: "2026-11-26T07:59:00Z" }), NOW)).toBe("closed");
    expect(sessionAvailability(s({ reservationClosesAt: "2026-11-26T08:00:00Z" }), NOW)).toBe("closed");
  });
  it("my own booking is 'booked' even if the session is full or closed", () => {
    expect(sessionAvailability(s({ isBookedByUser: true, isFull: true, reservationClosesAt: "2026-11-26T07:00:00Z" }), NOW)).toBe("booked");
  });
  it("an older server without cutoff fields is treated as open", () => {
    expect(sessionAvailability(s({ reservationClosesAt: undefined }), NOW)).toBe("available");
  });
});

describe("filterSessions", () => {
  const list = [s(), s({ activity: "BOXE", coach: "Ahmed", location: "Ring", isFull: true }), s({ coach: "Ahmed", isBookedByUser: true })];
  it("filters by coach, availability and accent-insensitive text", () => {
    expect(filterSessions(list, { coach: "Ahmed", nowMs: NOW })).toHaveLength(2);
    expect(filterSessions(list, { availability: "available", nowMs: NOW })).toHaveLength(1);
    expect(filterSessions(list, { availability: "full", nowMs: NOW })).toHaveLength(1);
    expect(filterSessions(list, { availability: "booked", nowMs: NOW })).toHaveLength(1);
    expect(filterSessions(list, { query: "BOXE", nowMs: NOW, activityLabels: { BOXE: "Boxe" } })).toHaveLength(1);
    expect(filterSessions(list, { query: "ring", nowMs: NOW })).toHaveLength(1);
  });
  it("combines filters", () => {
    expect(filterSessions(list, { coach: "Ahmed", availability: "booked", nowMs: NOW })).toHaveLength(1);
    expect(filterSessions(list, { coach: "Sarra", availability: "full", nowMs: NOW })).toHaveLength(0);
  });
});
