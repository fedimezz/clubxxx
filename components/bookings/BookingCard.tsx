"use client";

import { Clock, MapPin, CalendarDays, X, Loader2, Eye } from "lucide-react";
import { CoachAvatar, ACTIVITY_LABELS } from "@/components/member/DashboardWidgets";
import { bookingStatus, durationMinutes, formatDuration, type BookingTab } from "@/lib/booking-status";
import { formatDayLong, type IsoDate } from "@/lib/calendar-nav";

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Lundi", TUESDAY: "Mardi", WEDNESDAY: "Mercredi", THURSDAY: "Jeudi", FRIDAY: "Vendredi", SATURDAY: "Samedi", SUNDAY: "Dimanche",
};

export interface Booking {
  id: string;
  sessionId: string;
  bookedAt: string;
  cancelledAt: string | null;
  isCancelled: boolean;
  session: {
    id?: string;
    day: string;
    startTime: string;
    endTime: string;
    activity: string;
    coach: string;
    location: string;
    // additive (absent on an older server)
    description?: string | null;
    coachPhotoUrl?: string | null;
    date?: string | null;
    startsAt?: string;
    endsAt?: string;
  };
  weeklyPlan: { weekStart: string; weekEnd: string; isArchived: boolean };
}

const TONE: Record<"ok" | "info" | "mute" | "danger", string> = { ok: "mx-pill-ok", info: "mx-pill-info", mute: "mx-pill-mute", danger: "mx-pill-danger" };

export function bookingDateLabel(b: Booking): string {
  return b.session.date ? formatDayLong(b.session.date as IsoDate) : DAY_LABELS[b.session.day] ?? b.session.day;
}

interface Props {
  booking: Booking;
  tab: BookingTab;
  nowMs: number;
  onCancel?: (sessionId: string) => void;
  onDetails?: (booking: Booking) => void;
  cancelling?: boolean;
}

export default function BookingCard({ booking, tab, nowMs, onCancel, onDetails, cancelling }: Props) {
  const { session } = booking;
  const status = bookingStatus(booking, tab, nowMs);
  const duration = formatDuration(durationMinutes(session.startTime, session.endTime));
  const dim = status.key === "CANCELLED" || status.key === "PAST" || status.key === "DONE";

  return (
    <article className={`mx-card flex flex-col gap-4 p-4 transition-colors hover:border-[var(--primary)]/40 sm:flex-row sm:items-center ${dim ? "opacity-80" : ""}`}>
      <CoachAvatar name={session.coach} photoUrl={session.coachPhotoUrl} size={52} />

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-primary">{ACTIVITY_LABELS[session.activity] ?? session.activity}</h3>
          <span className={`mx-pill ${TONE[status.tone]}`}>{status.label}</span>
        </div>
        <p className="text-sm text-muted">Coach {session.coach}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="flex items-center gap-1.5 capitalize"><CalendarDays size={14} aria-hidden />{bookingDateLabel(booking)}</span>
          <span className="flex items-center gap-1.5"><Clock size={14} aria-hidden />{session.startTime} – {session.endTime}{duration ? ` · ${duration}` : ""}</span>
          <span className="flex items-center gap-1.5"><MapPin size={14} aria-hidden />{session.location}</span>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 sm:flex-col lg:flex-row">
        {onDetails && (
          <button onClick={() => onDetails(booking)} className="mx-ghost flex-1 px-3.5 py-2 text-sm" aria-label={`Détails de la réservation ${ACTIVITY_LABELS[session.activity] ?? session.activity}`}>
            <Eye size={15} aria-hidden /> Détails
          </button>
        )}
        {onCancel && status.canCancel && (
          <button
            onClick={() => onCancel(booking.sessionId)}
            disabled={cancelling}
            className="mx-ghost flex-1 border-red-500/30 px-3.5 py-2 text-sm text-danger hover:!bg-danger/10"
          >
            {cancelling ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <X size={15} aria-hidden />}
            Annuler
          </button>
        )}
      </div>
    </article>
  );
}
