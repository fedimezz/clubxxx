// lib/booking-status.ts
//
// Display-only helpers for the member Reservations page. The API still decides which tab a booking
// belongs to (upcoming / past / cancelled) and the DELETE endpoint stays the authority on whether a
// cancellation is accepted; this module only derives the badge and which buttons to offer.

export type BookingTab = "upcoming" | "past" | "cancelled";
export type BookingStatusKey = "UPCOMING" | "LIVE" | "DONE" | "PAST" | "CANCELLED";

export interface BookingLike {
  isCancelled: boolean;
  session: {
    activity: string;
    coach: string;
    location: string;
    startsAt?: string;
    endsAt?: string;
  };
}

export interface BookingStatus {
  key: BookingStatusKey;
  label: string;
  tone: "ok" | "info" | "mute" | "danger";
  /** The "Annuler" button is only offered for a reservation that has not started yet. */
  canCancel: boolean;
}

export function bookingStatus(booking: BookingLike, tab: BookingTab, nowMs: number): BookingStatus {
  if (booking.isCancelled || tab === "cancelled") return { key: "CANCELLED", label: "Annulée", tone: "danger", canCancel: false };
  if (tab === "past") return { key: "PAST", label: "Passée", tone: "mute", canCancel: false };

  const start = booking.session.startsAt ? Date.parse(booking.session.startsAt) : NaN;
  const end = booking.session.endsAt ? Date.parse(booking.session.endsAt) : NaN;
  if (Number.isNaN(start)) return { key: "UPCOMING", label: "Confirmée", tone: "ok", canCancel: true };
  if (nowMs < start) return { key: "UPCOMING", label: "Confirmée", tone: "ok", canCancel: true };
  if (!Number.isNaN(end) && nowMs >= end) return { key: "DONE", label: "Terminée", tone: "mute", canCancel: false };
  return { key: "LIVE", label: "En cours", tone: "info", canCancel: false };
}

const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Free-text (activity label, coach, location) + exact activity filter. */
export function filterBookings<T extends BookingLike>(
  list: readonly T[],
  opts: { query?: string; activity?: string; activityLabels?: Record<string, string> }
): T[] {
  const q = norm(opts.query ?? "");
  return list.filter((b) => {
    if (opts.activity && opts.activity !== "ALL" && b.session.activity !== opts.activity) return false;
    if (!q) return true;
    const label = opts.activityLabels?.[b.session.activity] ?? b.session.activity;
    return norm(`${label} ${b.session.activity} ${b.session.coach} ${b.session.location}`).includes(q);
  });
}

/** Whole minutes between two "HH:mm" times (null when malformed or not increasing). */
export function durationMinutes(startTime: string, endTime: string): number | null {
  const parse = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = parse(startTime);
  const b = parse(endTime);
  if (a === null || b === null || b <= a) return null;
  return b - a;
}

export function formatDuration(minutes: number | null): string | null {
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`) : `${m} min`;
}
