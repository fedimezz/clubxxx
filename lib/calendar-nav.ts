// lib/calendar-nav.ts
//
// Pure calendar-date arithmetic for the planning screens (admin calendar + member schedule).
//
// WHY THIS EXISTS — the "previous week" bug. The old pages kept the displayed week as a JS `Date`
// built from the BROWSER's clock (`new Date()` → UTC getters, `setMonth(getMonth() - 1)`,
// `new Date(year, month, 1)` mixed with UTC getters …). That produced three families of errors:
//   1. "Today" / the current Monday were computed in UTC or in the device zone instead of the club's
//      zone, so around midnight the app showed yesterday's / tomorrow's week.
//   2. Month navigation with `setMonth(±1)` overflows (31 Jan − 1 month → 3 Mar; 31 Mar − 1 → 3 Mar),
//      so Prev/Next skipped or repeated months, and local-midnight dates read through UTC getters
//      shifted the month grid by a day in zones ahead of UTC.
//   3. Every navigation click swapped the whole page for a full-screen spinner (the nav buttons
//      vanished mid-click) and concurrent responses could overwrite each other.
// Everything here works on plain "YYYY-MM-DD" strings and integer civil-date maths (no `Date`, no
// time zone, no DST), so a week is ALWAYS exactly +7 / −7 days from the previous one.
// The only time-zone-dependent function is `todayIso`, which delegates to lib/timezone.ts.

import { DEFAULT_TIMEZONE, isoDateInZone, resolveTimeZone, timeInZone, zonedWallTimeToUtc } from "@/lib/timezone";

export type IsoDate = string; // "YYYY-MM-DD"
export type CalendarView = "day" | "week" | "month" | "agenda";
export const CALENDAR_VIEWS: readonly CalendarView[] = ["day", "week", "month", "agenda"];

export interface Civil {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// ─── Civil date <-> day number (Howard Hinnant's algorithms; proleptic Gregorian) ─────────────

/** Days since 1970-01-01 for a civil date. */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(days: number): Civil {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

// ─── ISO strings ──────────────────────────────────────────────────────────────────────────────

export function formatIso(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parses a strictly valid "YYYY-MM-DD" (rejects 2026-02-30, 2026-13-01, "2026-1-1" …). */
export function parseIso(value: unknown): Civil | null {
  if (typeof value !== "string") return null;
  const match = ISO_RE.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function isIsoDate(value: unknown): value is IsoDate {
  return parseIso(value) !== null;
}

/** "2026-11-23T00:00:00.000Z" (API value) or "2026-11-23" → "2026-11-23"; null when unusable. */
export function normalizeApiDate(value: unknown): IsoDate | null {
  if (typeof value !== "string") return null;
  const head = value.slice(0, 10);
  return isIsoDate(head) ? head : null;
}

function toDays(iso: IsoDate): number {
  const c = parseIso(iso);
  if (!c) throw new RangeError(`Invalid ISO date: ${String(iso)}`);
  return daysFromCivil(c.y, c.m, c.d);
}

function fromDays(days: number): IsoDate {
  const c = civilFromDays(days);
  return formatIso(c.y, c.m, c.d);
}

// ─── Arithmetic ───────────────────────────────────────────────────────────────────────────────

export function addDays(iso: IsoDate, n: number): IsoDate {
  return fromDays(toDays(iso) + n);
}

export function addWeeks(iso: IsoDate, n: number): IsoDate {
  return addDays(iso, n * 7);
}

/** Adds calendar months; the day is clamped to the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: IsoDate, n: number): IsoDate {
  const c = parseIso(iso);
  if (!c) throw new RangeError(`Invalid ISO date: ${String(iso)}`);
  const index = c.y * 12 + (c.m - 1) + n;
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  return formatIso(y, m, Math.min(c.d, daysInMonth(y, m)));
}

/** Whole days from `a` to `b` (b − a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return toDays(b) - toDays(a);
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0; // "YYYY-MM-DD" sorts chronologically as a string
}

/** Monday = 0 … Sunday = 6. (1970-01-01 was a Thursday.) */
export function weekdayIndex(iso: IsoDate): number {
  return (((toDays(iso) + 3) % 7) + 7) % 7;
}

export function startOfWeek(iso: IsoDate): IsoDate {
  return addDays(iso, -weekdayIndex(iso));
}

export function endOfWeek(iso: IsoDate): IsoDate {
  return addDays(startOfWeek(iso), 6);
}

export function startOfMonth(iso: IsoDate): IsoDate {
  const c = parseIso(iso);
  if (!c) throw new RangeError(`Invalid ISO date: ${String(iso)}`);
  return formatIso(c.y, c.m, 1);
}

export function endOfMonth(iso: IsoDate): IsoDate {
  const c = parseIso(iso);
  if (!c) throw new RangeError(`Invalid ISO date: ${String(iso)}`);
  return formatIso(c.y, c.m, daysInMonth(c.y, c.m));
}

/** The 7 ISO dates (Mon..Sun) of the week containing `iso`. */
export function weekDates(iso: IsoDate): IsoDate[] {
  const monday = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export interface MonthCell {
  iso: IsoDate;
  inMonth: boolean;
}

/** Month grid, Monday-first, whole weeks (4–6 rows) covering the month containing `iso`. */
export function monthGrid(iso: IsoDate): MonthCell[][] {
  const first = startOfMonth(iso);
  const last = endOfMonth(iso);
  const gridStart = startOfWeek(first);
  const rows = (diffDays(gridStart, endOfWeek(last)) + 1) / 7;
  const month = parseIso(first)!.m;
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => {
      const cell = addDays(gridStart, r * 7 + c);
      return { iso: cell, inMonth: parseIso(cell)!.m === month };
    })
  );
}

/** Inclusive list of Mondays whose week intersects [start, end]. */
export function mondaysInRange(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let monday = startOfWeek(start); compareIso(monday, end) <= 0; monday = addWeeks(monday, 1)) out.push(monday);
  return out;
}

// ─── Today (the only zone-dependent function) ─────────────────────────────────────────────────

/** Calendar day "today" in the club's IANA zone (falls back to Africa/Tunis on an invalid zone). */
export function todayIso(timeZone: string = DEFAULT_TIMEZONE, now: Date | number = Date.now()): IsoDate {
  return isoDateInZone(now, resolveTimeZone(timeZone));
}

// ─── Views ────────────────────────────────────────────────────────────────────────────────────

export const AGENDA_DAYS = 14;

/** Previous / next anchor for a view. Day ±1, week & agenda ±7 days, month ±1 calendar month. */
export function shiftAnchor(view: CalendarView, anchor: IsoDate, direction: -1 | 1): IsoDate {
  switch (view) {
    case "day":
      return addDays(anchor, direction);
    case "month":
      return addMonths(startOfMonth(anchor), direction);
    default:
      return addWeeks(anchor, direction);
  }
}

/** Inclusive [start, end] range of dates a view displays (month = whole grid weeks). */
export function rangeForView(view: CalendarView, anchor: IsoDate): { start: IsoDate; end: IsoDate } {
  switch (view) {
    case "day":
      return { start: anchor, end: anchor };
    case "week":
      return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
    case "month":
      return { start: startOfWeek(startOfMonth(anchor)), end: endOfWeek(endOfMonth(anchor)) };
    case "agenda":
      return { start: anchor, end: addDays(anchor, AGENDA_DAYS - 1) };
  }
}

/** Is `today` inside what the view currently shows? (used to highlight the Today button) */
export function viewContains(view: CalendarView, anchor: IsoDate, today: IsoDate): boolean {
  const { start, end } = rangeForView(view, anchor);
  return compareIso(today, start) >= 0 && compareIso(today, end) <= 0;
}

// ─── Labels (French, no Intl → identical on server and client) ────────────────────────────────

export const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const MONTHS_SHORT_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export const WEEKDAYS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
export const WEEKDAYS_SHORT_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function formatDayLong(iso: IsoDate): string {
  const c = parseIso(iso)!;
  return `${WEEKDAYS_FR[weekdayIndex(iso)]} ${c.d} ${MONTHS_FR[c.m - 1]}`;
}

export function formatDayShort(iso: IsoDate): string {
  const c = parseIso(iso)!;
  return `${WEEKDAYS_SHORT_FR[weekdayIndex(iso)]} ${c.d}`;
}

export function formatMonthYear(iso: IsoDate): string {
  const c = parseIso(iso)!;
  return `${MONTHS_FR[c.m - 1]} ${c.y}`;
}

/** "23 – 29 nov. 2026", "28 déc. 2026 – 3 janv. 2027". */
export function formatWeekRange(iso: IsoDate): string {
  const a = parseIso(startOfWeek(iso))!;
  const b = parseIso(endOfWeek(iso))!;
  if (a.y !== b.y) return `${a.d} ${MONTHS_SHORT_FR[a.m - 1]} ${a.y} – ${b.d} ${MONTHS_SHORT_FR[b.m - 1]} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS_SHORT_FR[a.m - 1]} – ${b.d} ${MONTHS_SHORT_FR[b.m - 1]} ${b.y}`;
  return `${a.d} – ${b.d} ${MONTHS_SHORT_FR[b.m - 1]} ${b.y}`;
}

export function periodLabel(view: CalendarView, anchor: IsoDate): string {
  switch (view) {
    case "day":
      return formatDayLong(anchor);
    case "month":
      return formatMonthYear(anchor);
    case "agenda":
      return `À partir du ${formatDayLong(anchor)}`;
    default:
      return formatWeekRange(anchor);
  }
}

// ─── Session <-> date ─────────────────────────────────────────────────────────────────────────

export const DAY_NAMES = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type DayName = (typeof DAY_NAMES)[number];

export function dayNameIndex(day: string): number {
  return DAY_NAMES.indexOf(day as DayName);
}

/** The calendar date of a session: its plan's Monday + the weekday offset. */
export function sessionDateIso(weekStart: IsoDate, day: string): IsoDate | null {
  const idx = dayNameIndex(day);
  return idx < 0 ? null : addDays(startOfWeek(weekStart), idx);
}

export function dayNameOfIso(iso: IsoDate): DayName {
  return DAY_NAMES[weekdayIndex(iso)];
}

/** The exact UTC instant a session starts, from its club-local date and "HH:mm" (DST-aware). */
export function sessionStartInstant(dateIso: IsoDate, startTime: string, timeZone: string = DEFAULT_TIMEZONE): Date | null {
  const c = parseIso(dateIso);
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
  if (!c || !t) return null;
  return zonedWallTimeToUtc(c.y, c.m, c.d, Number(t[1]), Number(t[2]), resolveTimeZone(timeZone));
}

/** Reservation closes `cutoffMinutes` before the start; allowed only while strictly more than that remains. */
export function reservationClosesAt(start: Date, cutoffMinutes: number): Date {
  return new Date(start.getTime() - cutoffMinutes * 60_000);
}

export function isReservationOpenAt(nowMs: number, start: Date, cutoffMinutes: number): boolean {
  return start.getTime() - nowMs > cutoffMinutes * 60_000;
}

/** "HH:mm" of an instant in the club zone (for "Réservations jusqu'à 09:40"). */
export function clockTime(instant: Date | number, timeZone: string = DEFAULT_TIMEZONE): string {
  return timeInZone(instant, resolveTimeZone(timeZone));
}

// ─── URL / storage (?date=2026-11-22&view=week) ───────────────────────────────────────────────

export function parseView(value: unknown): CalendarView | null {
  return typeof value === "string" && (CALENDAR_VIEWS as readonly string[]).includes(value) ? (value as CalendarView) : null;
}

export function parseCalendarSearch(search: string): { view: CalendarView | null; date: IsoDate | null } {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const date = params.get("date");
  return { view: parseView(params.get("view")), date: isIsoDate(date) ? date : null };
}

/** Rebuilds the query string, keeping unrelated params untouched. */
export function buildCalendarSearch(existing: string, view: CalendarView, date: IsoDate): string {
  const params = new URLSearchParams(existing.startsWith("?") ? existing.slice(1) : existing);
  params.set("view", view);
  params.set("date", date);
  return `?${params.toString()}`;
}

// ─── Time-of-day + conflict detection (admin planning) ───────────────────────────────────────

/** "HH:mm" → minutes since midnight; null when malformed. */
export function timeToMinutes(time: string): number | null {
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return t ? Number(t[1]) * 60 + Number(t[2]) : null;
}

export interface ConflictSlot {
  id?: string;
  date: IsoDate;
  startTime: string;
  endTime: string;
  coachId?: string | null;
  coach?: string | null;
  location?: string | null;
}

export type ConflictKind = "coach" | "location";
export interface SlotConflict<T extends ConflictSlot = ConflictSlot> {
  kind: ConflictKind;
  other: T;
}

const norm = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Half-open overlap: 09:00–10:00 and 10:00–11:00 do NOT overlap. */
export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  if (as === null || ae === null || bs === null || be === null) return false;
  return as < be && bs < ae;
}

/**
 * Same coach (id, or same non-empty name) or same location overlapping on the same calendar day.
 * `candidate.id` (when editing) is excluded from `others`. Purely advisory: the API stays the authority.
 */
export function findSlotConflicts<T extends ConflictSlot>(candidate: ConflictSlot, others: readonly T[]): SlotConflict<T>[] {
  const out: SlotConflict<T>[] = [];
  const coachName = norm(candidate.coach);
  const place = norm(candidate.location);
  for (const other of others) {
    if (candidate.id && other.id === candidate.id) continue;
    if (other.date !== candidate.date) continue;
    if (!timesOverlap(candidate.startTime, candidate.endTime, other.startTime, other.endTime)) continue;
    const sameCoach =
      (!!candidate.coachId && !!other.coachId && candidate.coachId === other.coachId) ||
      (!!coachName && coachName === norm(other.coach));
    if (sameCoach) out.push({ kind: "coach", other });
    if (place && place === norm(other.location)) out.push({ kind: "location", other });
  }
  return out;
}

/** Ids of every session that conflicts with at least one other session (for badges in the grid). */
export function conflictingIds<T extends ConflictSlot & { id: string }>(slots: readonly T[]): Set<string> {
  const ids = new Set<string>();
  for (const slot of slots) {
    if (findSlotConflicts(slot, slots).length > 0) ids.add(slot.id);
  }
  return ids;
}
