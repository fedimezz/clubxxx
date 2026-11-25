// lib/planning-filters.ts
//
// Display-only filtering for the member Planning page (search, coach, availability). It never
// decides whether a booking is accepted — POST /api/dashboard/schedule/book remains the authority
// (capacity, cutoff, subscription limits).

export type AvailabilityFilter = "all" | "available" | "booked" | "full";
export type SessionAvailability = "booked" | "full" | "closed" | "available";

export interface FilterableSession {
  activity: string;
  coach: string;
  location: string;
  isBookedByUser: boolean;
  isFull: boolean;
  reservationClosesAt?: string;
}

/** Same rules the cards use: booked wins, then full, then "closed" (cutoff passed), else available. */
export function sessionAvailability(s: FilterableSession, nowMs: number): SessionAvailability {
  if (s.isBookedByUser) return "booked";
  if (s.isFull) return "full";
  const closes = s.reservationClosesAt ? Date.parse(s.reservationClosesAt) : NaN;
  if (!Number.isNaN(closes) && nowMs >= closes) return "closed";
  return "available";
}

const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function filterSessions<T extends FilterableSession>(
  list: readonly T[],
  opts: { query?: string; coach?: string; availability?: AvailabilityFilter; nowMs: number; activityLabels?: Record<string, string> }
): T[] {
  const q = norm(opts.query ?? "");
  return list.filter((s) => {
    if (opts.coach && opts.coach !== "ALL" && s.coach !== opts.coach) return false;
    if (opts.availability && opts.availability !== "all") {
      if (sessionAvailability(s, opts.nowMs) !== opts.availability) return false;
    }
    if (!q) return true;
    const label = opts.activityLabels?.[s.activity] ?? s.activity;
    return norm(`${label} ${s.activity} ${s.coach} ${s.location}`).includes(q);
  });
}
