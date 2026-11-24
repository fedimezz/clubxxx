import { describe, it, expect } from "vitest";
import {
  addDays, addWeeks, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, weekDates, monthGrid,
  shiftAnchor, rangeForView, periodLabel, todayIso, viewContains, weekdayIndex, isIsoDate, normalizeApiDate,
  parseCalendarSearch, buildCalendarSearch, sessionDateIso, sessionStartInstant, reservationClosesAt,
  isReservationOpenAt, clockTime, findSlotConflicts, conflictingIds, timesOverlap, mondaysInRange,
  type CalendarView,
} from "../calendar-nav";

describe("calendar arithmetic is pure and timezone-independent", () => {
  it("addWeeks crosses month and year boundaries", () => {
    expect(addWeeks("2026-11-23", 1)).toBe("2026-11-30");
    expect(addWeeks("2026-11-30", 1)).toBe("2026-12-07");
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
    expect(addWeeks("2027-01-04", -1)).toBe("2026-12-28");
  });

  it("handles leap years (Feb 2028)", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("addMonths clamps the day to the target month", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2027-01-15", -1)).toBe("2026-12-15");
    expect(addMonths("2026-01-15", -13)).toBe("2024-12-15");
  });

  it("weeks start on Monday", () => {
    expect(weekdayIndex("2026-11-23")).toBe(0); // Monday
    expect(startOfWeek("2026-11-29")).toBe("2026-11-23"); // Sunday → previous Monday
    expect(endOfWeek("2026-11-23")).toBe("2026-11-29");
    expect(weekDates("2026-11-25")).toEqual([
      "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29",
    ]);
  });

  it("DST changes never skip or repeat a calendar day", () => {
    // Europe/Paris DST ends 2026-10-25, starts 2026-03-29 — a UTC-midnight Date bug would break here.
    let d = "2026-10-19";
    const seen: string[] = [];
    for (let i = 0; i < 14; i++) { seen.push(d); d = addDays(d, 1); }
    expect(new Set(seen).size).toBe(14);
    expect(seen[6]).toBe("2026-10-25");
    expect(seen[7]).toBe("2026-10-26");
  });
});

describe("prev / next navigation (the week-navigation bug)", () => {
  const views: CalendarView[] = ["day", "week", "month", "agenda"];

  it("next then prev always returns to the starting period, for every view", () => {
    for (const view of views) {
      for (const start of ["2026-11-23", "2026-12-28", "2027-01-31", "2028-02-29", "2026-03-29"]) {
        const there = shiftAnchor(view, start, 1);
        const back = shiftAnchor(view, there, -1);
        expect(rangeForView(view, back)).toEqual(rangeForView(view, start));
      }
    }
  });

  it("clicking Next 60 times in a row always moves forward by exactly one week", () => {
    let anchor = "2026-11-23";
    for (let i = 1; i <= 60; i++) {
      const next = shiftAnchor("week", anchor, 1);
      expect(next).toBe(addDays(anchor, 7));
      expect(startOfWeek(next) > startOfWeek(anchor)).toBe(true);
      anchor = next;
    }
  });

  it("week: month → month and year → year transitions", () => {
    expect(rangeForView("week", shiftAnchor("week", "2026-11-23", 1))).toEqual({ start: "2026-11-30", end: "2026-12-06" });
    expect(rangeForView("week", shiftAnchor("week", "2026-12-28", 1))).toEqual({ start: "2027-01-04", end: "2027-01-10" });
    expect(rangeForView("week", "2026-12-30")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
    expect(periodLabel("week", "2026-12-30")).toBe("28 déc. 2026 – 3 janv. 2027");
    expect(periodLabel("week", "2026-11-25")).toBe("23 – 29 nov. 2026");
  });

  it("month view moves one calendar month, even from the 31st", () => {
    expect(shiftAnchor("month", "2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftAnchor("month", "2027-01-31", 1)).toBe("2027-02-01");
    expect(shiftAnchor("month", "2027-03-31", -1)).toBe("2027-02-01");
    expect(periodLabel("month", shiftAnchor("month", "2026-12-15", 1))).toBe("janvier 2027");
  });

  it("day view moves one day", () => {
    expect(shiftAnchor("day", "2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftAnchor("day", "2027-03-01", -1)).toBe("2027-02-28");
    expect(shiftAnchor("day", "2028-03-01", -1)).toBe("2028-02-29");
  });

  it("changing view keeps the same anchor date", () => {
    const anchor = "2026-12-30";
    expect(rangeForView("day", anchor).start).toBe(anchor);
    expect(viewContains("week", anchor, anchor)).toBe(true);
    expect(viewContains("month", anchor, anchor)).toBe(true);
  });

  it("Today button: todayIso uses the club zone, and lights up only when today is inside the view", () => {
    // 2026-11-22T23:30Z is already 2026-11-23 00:30 in Tunis (UTC+1) but still the 22nd in New York.
    const now = Date.parse("2026-11-22T23:30:00Z");
    expect(todayIso("Africa/Tunis", now)).toBe("2026-11-23");
    expect(todayIso("America/New_York", now)).toBe("2026-11-22");
    expect(todayIso("Not/AZone", now)).toBe("2026-11-23"); // falls back to Africa/Tunis
    expect(viewContains("week", "2026-12-07", "2026-11-23")).toBe(false);
    expect(viewContains("week", "2026-11-25", "2026-11-23")).toBe(true);
  });
});

describe("month grid", () => {
  it("Monday-first whole weeks", () => {
    const grid = monthGrid("2026-11-10");
    expect(grid[0][0].iso).toBe("2026-10-26");
    expect(grid[0][0].inMonth).toBe(false);
    expect(grid.every((r) => r.length === 7)).toBe(true);
    expect(grid.flat().filter((c) => c.inMonth)).toHaveLength(30);
    expect(grid.at(-1)![6].iso).toBe("2026-12-06");
  });

  it("February of a leap year has 29 in-month cells; Feb 2027 starting on Monday fits 4 rows", () => {
    expect(monthGrid("2028-02-10").flat().filter((c) => c.inMonth)).toHaveLength(29);
    expect(monthGrid("2027-02-01")).toHaveLength(4);
    expect(startOfMonth("2028-02-17")).toBe("2028-02-01");
    expect(endOfMonth("2028-02-17")).toBe("2028-02-29");
  });

  it("mondaysInRange lists each week once", () => {
    expect(mondaysInRange("2026-12-30", "2027-01-12")).toEqual(["2026-12-28", "2027-01-04", "2027-01-11"]);
  });
});

describe("date validation + URL state", () => {
  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2026-11-23")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("23/11/2026")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it("normalizes API dates (ISO timestamps) to a day", () => {
    expect(normalizeApiDate("2026-11-23T00:00:00.000Z")).toBe("2026-11-23");
    expect(normalizeApiDate("garbage")).toBeNull();
  });

  it("round-trips view + date through the query string and keeps other params", () => {
    const qs = buildCalendarSearch("?tab=planning", "month", "2026-12-01");
    expect(parseCalendarSearch(qs)).toEqual({ view: "month", date: "2026-12-01" });
    expect(new URLSearchParams(qs).get("tab")).toBe("planning");
  });

  it("ignores invalid view/date from a hand-edited URL", () => {
    expect(parseCalendarSearch("?view=year&date=2026-13-40")).toEqual({ view: null, date: null });
    expect(parseCalendarSearch("")).toEqual({ view: null, date: null });
  });
});

describe("session date + reservation instant (DST aware)", () => {
  it("maps a plan Monday + day name to the calendar date", () => {
    expect(sessionDateIso("2026-11-23", "MONDAY")).toBe("2026-11-23");
    expect(sessionDateIso("2026-11-23", "SUNDAY")).toBe("2026-11-29");
    expect(sessionDateIso("2026-11-25", "MONDAY")).toBe("2026-11-23"); // normalised to the week's Monday
    expect(sessionDateIso("2026-11-23", "FUNDAY")).toBeNull();
  });

  it("computes the club-local start instant and the closing time", () => {
    const start = sessionStartInstant("2026-11-23", "10:00", "Africa/Tunis")!;
    expect(start.toISOString()).toBe("2026-11-23T09:00:00.000Z");
    expect(reservationClosesAt(start, 20).toISOString()).toBe("2026-11-23T08:40:00.000Z");
    expect(clockTime(reservationClosesAt(start, 20), "Africa/Tunis")).toBe("09:40");
    expect(sessionStartInstant("2026-11-23", "25:00")).toBeNull();
  });

  it("follows DST: the same 10:00 session is UTC+2 in summer and UTC+1 in winter (Europe/Paris)", () => {
    expect(sessionStartInstant("2026-07-15", "10:00", "Europe/Paris")!.toISOString()).toBe("2026-07-15T08:00:00.000Z");
    expect(sessionStartInstant("2026-12-15", "10:00", "Europe/Paris")!.toISOString()).toBe("2026-12-15T09:00:00.000Z");
  });

  it("cutoff: 21 min open, 20 min closed, 19 min closed", () => {
    const start = sessionStartInstant("2026-11-23", "10:00", "Africa/Tunis")!;
    const at = (min: number) => start.getTime() - min * 60_000;
    expect(isReservationOpenAt(at(21), start, 20)).toBe(true);
    expect(isReservationOpenAt(at(20), start, 20)).toBe(false);
    expect(isReservationOpenAt(at(19), start, 20)).toBe(false);
  });
});

describe("admin conflict detection", () => {
  const base = { date: "2026-11-23", startTime: "09:00", endTime: "10:00", coach: "Sara", location: "Salle A" };

  it("overlap is half-open", () => {
    expect(timesOverlap("09:00", "10:00", "10:00", "11:00")).toBe(false);
    expect(timesOverlap("09:00", "10:00", "09:59", "11:00")).toBe(true);
    expect(timesOverlap("09:00", "10:00", "bad", "11:00")).toBe(false);
  });

  it("flags the same coach double-booked", () => {
    const c = findSlotConflicts({ ...base, startTime: "09:30", endTime: "10:30", location: "Salle B" }, [{ id: "1", ...base }]);
    expect(c.map((x) => x.kind)).toEqual(["coach"]);
  });

  it("flags the same room double-booked, ignoring case and spacing", () => {
    const c = findSlotConflicts({ ...base, coach: "Yassine", location: "  salle   a " }, [{ id: "1", ...base }]);
    expect(c.map((x) => x.kind)).toEqual(["location"]);
  });

  it("no conflict on another day, back-to-back, or when editing the same session", () => {
    expect(findSlotConflicts({ ...base, date: "2026-11-24" }, [{ id: "1", ...base }])).toHaveLength(0);
    expect(findSlotConflicts({ ...base, startTime: "10:00", endTime: "11:00" }, [{ id: "1", ...base }])).toHaveLength(0);
    expect(findSlotConflicts({ id: "1", ...base }, [{ id: "1", ...base }])).toHaveLength(0);
  });

  it("conflictingIds marks both sides of a clash", () => {
    const ids = conflictingIds([
      { id: "a", ...base },
      { id: "b", ...base, startTime: "09:30", endTime: "10:30" },
      { id: "c", ...base, startTime: "12:00", endTime: "13:00", coach: "Amine", location: "Salle C" },
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
});
