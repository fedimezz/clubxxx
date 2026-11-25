import { describe, expect, it } from "vitest";
import { bookingStatus, durationMinutes, filterBookings, formatDuration, type BookingLike } from "@/lib/booking-status";

const mk = (over: Partial<BookingLike["session"]> = {}, isCancelled = false): BookingLike => ({
  isCancelled,
  session: { activity: "YOGA", coach: "Sarra Ben Ali", location: "Studio 2", startsAt: "2026-11-26T09:00:00.000Z", endsAt: "2026-11-26T10:00:00.000Z", ...over },
});
const T = (iso: string) => Date.parse(iso);

describe("bookingStatus", () => {
  it("future upcoming booking is confirmed and cancellable", () => {
    const s = bookingStatus(mk(), "upcoming", T("2026-11-25T12:00:00Z"));
    expect(s).toMatchObject({ key: "UPCOMING", canCancel: true });
  });
  it("a started session is live and no longer cancellable from the UI", () => {
    expect(bookingStatus(mk(), "upcoming", T("2026-11-26T09:30:00Z"))).toMatchObject({ key: "LIVE", canCancel: false });
  });
  it("an ended session still in an active plan is 'Terminée'", () => {
    expect(bookingStatus(mk(), "upcoming", T("2026-11-26T10:00:00Z"))).toMatchObject({ key: "DONE", canCancel: false });
  });
  it("cancelled and archived bookings never offer cancel", () => {
    expect(bookingStatus(mk({}, true), "cancelled", 0)).toMatchObject({ key: "CANCELLED", canCancel: false });
    expect(bookingStatus(mk(), "past", 0)).toMatchObject({ key: "PAST", canCancel: false });
    expect(bookingStatus(mk(), "upcoming", 0).canCancel).toBe(true);
    expect(bookingStatus(mk({}, true), "upcoming", 0).key).toBe("CANCELLED");
  });
  it("without timestamps (older API) it falls back to the tab", () => {
    expect(bookingStatus(mk({ startsAt: undefined, endsAt: undefined }), "upcoming", 0)).toMatchObject({ key: "UPCOMING", canCancel: true });
  });
});

describe("filterBookings", () => {
  const list = [mk(), mk({ activity: "BOXE", coach: "Ahmed", location: "Ring" })];
  const labels = { YOGA: "Yoga", BOXE: "Boxe" };
  it("filters by text, accents and case insensitive, on coach / activity / place", () => {
    expect(filterBookings(list, { query: "sarra", activityLabels: labels })).toHaveLength(1);
    expect(filterBookings(list, { query: "RING", activityLabels: labels })).toHaveLength(1);
    expect(filterBookings(list, { query: "boxe", activityLabels: labels })[0].session.coach).toBe("Ahmed");
    expect(filterBookings(list, { query: "zzz" })).toHaveLength(0);
  });
  it("filters by activity", () => {
    expect(filterBookings(list, { activity: "YOGA" })).toHaveLength(1);
    expect(filterBookings(list, { activity: "ALL" })).toHaveLength(2);
  });
});

describe("duration", () => {
  it("computes and formats", () => {
    expect(durationMinutes("10:00", "11:30")).toBe(90);
    expect(durationMinutes("11:00", "10:00")).toBeNull();
    expect(formatDuration(90)).toBe("1 h 30");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(null)).toBeNull();
  });
});
