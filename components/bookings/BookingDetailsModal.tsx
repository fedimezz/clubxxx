"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { CalendarDays, CalendarPlus, Clock, Hash, MapPin, Timer, UserRound, X, Loader2, Info } from "lucide-react";
import { CoachAvatar, ACTIVITY_LABELS } from "@/components/member/DashboardWidgets";
import { bookingStatus, durationMinutes, formatDuration, type BookingTab } from "@/lib/booking-status";
import { bookingDateLabel, type Booking } from "@/components/bookings/BookingCard";

const TONE = { ok: "mx-pill-ok", info: "mx-pill-info", mute: "mx-pill-mute", danger: "mx-pill-danger" } as const;

function fmt(iso: string | null | undefined, timeZone: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone });
}

export default function BookingDetailsModal({
  booking, tab, nowMs, timeZone, cancelling, onClose, onCancel,
}: {
  booking: Booking; tab: BookingTab; nowMs: number; timeZone: string; cancelling: boolean;
  onClose: () => void; onCancel: (sessionId: string) => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const { session } = booking;
  const status = bookingStatus(booking, tab, nowMs);
  const duration = formatDuration(durationMinutes(session.startTime, session.endTime));
  const planLink = session.date ? `/dashboard/schedule?view=week&date=${session.date}` : "/dashboard/schedule";

  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const items = ref.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [onClose]);

  const rows: { icon: typeof Clock; label: string; value: React.ReactNode }[] = [
    { icon: CalendarDays, label: "Date", value: <span className="capitalize">{bookingDateLabel(booking)}</span> },
    { icon: Clock, label: "Horaire", value: `${session.startTime} – ${session.endTime}` },
    ...(duration ? [{ icon: Timer, label: "Durée", value: duration }] : []),
    { icon: UserRound, label: "Coach", value: session.coach },
    { icon: MapPin, label: "Lieu", value: session.location },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="mx-card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none p-6 shadow-2xl sm:rounded-b-[1.1rem]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CoachAvatar name={session.coach} photoUrl={session.coachPhotoUrl} size={56} />
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-xl font-extrabold text-primary">{ACTIVITY_LABELS[session.activity] ?? session.activity}</h2>
              <span className={`mx-pill mt-1 ${TONE[status.tone]}`}>{status.label}</span>
            </div>
          </div>
          <button data-autofocus onClick={onClose} className="rounded-lg p-2 hover:bg-muted" aria-label="Fermer"><X size={18} className="text-primary" /></button>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-xl border border-border bg-muted/30 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-muted"><Icon size={13} aria-hidden />{label}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-primary">{value}</dd>
            </div>
          ))}
        </dl>

        {session.description && (
          <div className="mt-4 rounded-xl border border-border p-3">
            <p className="flex items-center gap-1.5 text-xs text-muted"><Info size={13} aria-hidden />À propos de la séance</p>
            <p className="mt-1 text-sm text-primary">{session.description}</p>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-border p-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs text-muted"><Hash size={13} aria-hidden />Confirmation</p>
          <p className="mt-1 text-primary">Réservée le {fmt(booking.bookedAt, timeZone) ?? "—"}</p>
          {booking.cancelledAt && <p className="text-danger">Annulée le {fmt(booking.cancelledAt, timeZone)}</p>}
          <p className="mt-1 font-mono text-xs text-muted">Réf. {booking.id.slice(-8).toUpperCase()}</p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href={planLink} className="mx-ghost px-4 py-2.5 text-sm"><CalendarPlus size={15} aria-hidden />{status.key === "CANCELLED" ? "Réserver une autre séance" : "Voir dans le planning"}</Link>
          {status.canCancel && (
            <button onClick={() => onCancel(booking.sessionId)} disabled={cancelling} className="mx-cta !bg-red-600 !text-white px-4 py-2.5 text-sm !shadow-none">
              {cancelling ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <X size={15} aria-hidden />}
              Annuler la réservation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
