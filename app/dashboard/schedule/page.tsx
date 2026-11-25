"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Loader2, RefreshCw, CalendarX, Clock, MapPin, X, Check,
  CalendarDays, Users, Zap, BookCheck, AlertCircle, Lock, Search, Ban,
} from "lucide-react";
import CalendarToolbar from "@/components/schedule/CalendarToolbar";
import { useCalendarState } from "@/components/schedule/useCalendarState";
import { Skeleton } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { CoachAvatar } from "@/components/member/DashboardWidgets";
import { filterSessions, type AvailabilityFilter } from "@/lib/planning-filters";
import {
  addDays, clockTime, compareIso, formatDayLong, mondaysInRange, monthGrid, parseIso, weekDates,
  type IsoDate,
} from "@/lib/calendar-nav";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const DAY_LABELS_SHORT: Record<string, string> = {
  MONDAY: "Lun", TUESDAY: "Mar", WEDNESDAY: "Mer",
  THURSDAY: "Jeu", FRIDAY: "Ven", SATURDAY: "Sam", SUNDAY: "Dim",
};
const DAY_LABELS_FULL: Record<string, string> = {
  MONDAY: "Lundi", TUESDAY: "Mardi", WEDNESDAY: "Mercredi",
  THURSDAY: "Jeudi", FRIDAY: "Vendredi", SATURDAY: "Samedi", SUNDAY: "Dimanche",
};
const DAY_INDEX: Record<string, number> = {
  MONDAY: 0, TUESDAY: 1, WEDNESDAY: 2, THURSDAY: 3, FRIDAY: 4, SATURDAY: 5, SUNDAY: 6,
};

const ACTIVITIES = [
  "BODYBUILDING", "FITNESS", "CARDIO", "CROSSFIT", "YOGA",
  "PILATES", "BOXE", "MMA", "AQUAGYM", "PADEL", "ZUMBA", "SPINNING",
];
const ACTIVITY_LABELS: Record<string, string> = {
  BODYBUILDING: "Musculation", FITNESS: "Fitness", CARDIO: "Cardio",
  CROSSFIT: "CrossFit", YOGA: "Yoga", PILATES: "Pilates",
  BOXE: "Boxe", MMA: "MMA", AQUAGYM: "Aquagym",
  PADEL: "Padel", ZUMBA: "Zumba", SPINNING: "Spinning",
};
const ACTIVITY_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; bar: string }> = {
  BODYBUILDING: { bg: "bg-orange-500/15", border: "border-orange-500/40", text: "text-orange-700 dark:text-orange-400", dot: "bg-orange-500", bar: "bg-orange-500" },
  FITNESS:      { bg: "bg-blue-500/15",   border: "border-blue-500/40",   text: "text-blue-700 dark:text-blue-400",   dot: "bg-blue-500",   bar: "bg-blue-500" },
  CARDIO:       { bg: "bg-red-500/15",    border: "border-red-500/40",    text: "text-red-700 dark:text-red-400",     dot: "bg-red-500",    bar: "bg-red-500" },
  CROSSFIT:     { bg: "bg-amber-500/15",  border: "border-amber-500/40",  text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500",  bar: "bg-amber-500" },
  YOGA:         { bg: "bg-emerald-500/15",border: "border-emerald-500/40",text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  PILATES:      { bg: "bg-teal-500/15",   border: "border-teal-500/40",   text: "text-teal-700 dark:text-teal-400",   dot: "bg-teal-500",   bar: "bg-teal-500" },
  BOXE:         { bg: "bg-rose-500/15",   border: "border-rose-500/40",   text: "text-rose-700 dark:text-rose-400",   dot: "bg-rose-500",   bar: "bg-rose-500" },
  MMA:          { bg: "bg-rose-600/15",   border: "border-rose-600/40",   text: "text-rose-800 dark:text-rose-400",   dot: "bg-rose-600",   bar: "bg-rose-600" },
  AQUAGYM:      { bg: "bg-cyan-500/15",   border: "border-cyan-500/40",   text: "text-cyan-700 dark:text-cyan-400",   dot: "bg-cyan-500",   bar: "bg-cyan-500" },
  PADEL:        { bg: "bg-lime-500/15",   border: "border-lime-500/40",   text: "text-lime-700 dark:text-lime-400",   dot: "bg-lime-500",   bar: "bg-lime-500" },
  ZUMBA:        { bg: "bg-pink-500/15",   border: "border-pink-500/40",   text: "text-pink-700 dark:text-pink-400",   dot: "bg-pink-500",   bar: "bg-pink-500" },
  SPINNING:     { bg: "bg-violet-500/15", border: "border-violet-500/40", text: "text-violet-700 dark:text-violet-400", dot: "bg-violet-500", bar: "bg-violet-500" },
};
const DEFAULT_COLOR = { bg: "bg-[var(--primary)]/15", border: "border-[var(--primary)]/40", text: "text-[var(--primary)]", dot: "bg-[var(--primary)]", bar: "bg-[var(--primary)]" };

const DAY_START_MIN = 6 * 60;
const DAY_END_MIN = 22 * 60;
const PX_PER_MIN = 1.15;
const GRID_HEIGHT = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;
const HOUR_MARKS = Array.from(
  { length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 },
  (_, i) => DAY_START_MIN + i * 60
);

const AUTO_REFRESH_MS = 45_000;

interface Session {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  activity: string;
  coach: string;
  capacity: number;
  currentBookings: number;
  location: string;
  description: string | null;
  coachPhotoUrl?: string | null;
  isBookedByUser: boolean;
  isFull: boolean;
  spotsLeft: number;
  /** Calendar day of the session (added client-side from its week's Monday + `day`). */
  date?: IsoDate;
  // Reservation cutoff (server-computed, additive — absent on an older server → treated as open).
  startsAt?: string;
  reservationClosesAt?: string;
  reservationOpen?: boolean;
  reservationStatus?: "OPEN" | "CLOSED_CUTOFF" | "STARTED";
}

interface ReservationPolicy {
  cutoffMinutes: number;
  timeZone: string;
  message: string;
  serverNow: string;
}

interface ScheduleData {
  weeklyPlan: { id: string; weekStart: string; weekEnd: string } | null;
  sessions: Session[];
  reservationPolicy?: ReservationPolicy;
}

const DEFAULT_POLICY_MESSAGE = "Les réservations ferment 20 minutes avant le début de la séance.";

/** Client-side view of the cutoff. The booking endpoint stays the authority; this only drives the UI. */
function reservationUi(s: Session, nowMs: number, timeZone: string) {
  const closesMs = s.reservationClosesAt ? Date.parse(s.reservationClosesAt) : NaN;
  if (Number.isNaN(closesMs)) return { closed: false, started: false, closesLabel: null as string | null };
  const startMs = s.startsAt ? Date.parse(s.startsAt) : NaN;
  return {
    closed: nowMs >= closesMs,
    started: !Number.isNaN(startMs) && nowMs >= startMs,
    closesLabel: clockTime(closesMs, timeZone),
  };
}

function toMinutes(time: string): number | null {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatHourLabel(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  return `${String(h).padStart(2, "0")}:00`;
}

// Capacity status helpers
function getCapacityStatus(currentBookings: number, capacity: number) {
  const pct = capacity > 0 ? currentBookings / capacity : 1;
  if (pct >= 1) return { label: "Complet", color: "text-red-500", barColor: "bg-red-500" };
  if (pct >= 0.8) return { label: "Presque complet", color: "text-amber-500", barColor: "bg-amber-500" };
  if (pct >= 0.5) return { label: "Disponible", color: "text-emerald-500", barColor: "bg-emerald-500" };
  return { label: "Disponible", color: "text-emerald-500", barColor: "bg-emerald-500" };
}

// ─── Capacity Bar ──────────────────────────────────────────────────────────

function CapacityBar({
  currentBookings,
  capacity,
  showLabel = true,
}: {
  currentBookings: number;
  capacity: number;
  showLabel?: boolean;
}) {
  const pct = capacity > 0 ? Math.min(currentBookings / capacity, 1) : 1;
  const status = getCapacityStatus(currentBookings, capacity);
  const spotsLeft = Math.max(0, capacity - currentBookings);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted flex items-center gap-1">
          <Users size={11} />
          {currentBookings}/{capacity} participants
        </span>
        {showLabel && (
          <span className={`font-medium ${status.color}`}>
            {pct >= 1 ? "Complet" : `${spotsLeft} place${spotsLeft > 1 ? "s" : ""} restante${spotsLeft > 1 ? "s" : ""}`}
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${status.barColor}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium animate-fade-in max-w-sm
        ${type === "success"
          ? "bg-card border-green-500/30 text-green-600 dark:text-green-400"
          : "bg-card border-red-500/30 text-red-600 dark:text-red-400"
        }`}
    >
      {type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-50 hover:opacity-100 transition-opacity" aria-label="Fermer">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Session Card (list view) ───────────────────────────────────────────────

function SessionCard({
  session,
  onBook,
  onCancel,
  pending,
  nowMs,
  policy,
}: {
  session: Session;
  onBook: (id: string) => void;
  onCancel: (id: string) => void;
  pending: boolean;
  nowMs: number;
  policy: ReservationPolicy | null;
}) {
  const color = ACTIVITY_COLORS[session.activity] ?? DEFAULT_COLOR;
  const isBooked = session.isBookedByUser;
  const isFull = session.isFull && !isBooked;
  const ui = reservationUi(session, nowMs, policy?.timeZone ?? "Africa/Tunis");
  const closedForMe = ui.closed && !isBooked;

  return (
    <div className={`rounded-xl border p-4 transition-all ${color.border} ${color.bg} ${isBooked ? "ring-2 ring-[var(--primary)]/30" : ""}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-card ${color.text}`}>
            {ACTIVITY_LABELS[session.activity] ?? session.activity}
          </span>
          {isBooked && (
            <span className="flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)] bg-[var(--primary)]/10 px-2 py-0.5 rounded-full">
              <BookCheck size={10} />
              Réservé
            </span>
          )}
        </div>
        {/* Action button */}
        {isBooked ? (
          <button
            onClick={() => onCancel(session.id)}
            disabled={pending}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 border border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            Annuler
          </button>
        ) : (
          <button
            onClick={() => onBook(session.id)}
            disabled={pending || isFull || closedForMe}
            aria-disabled={pending || isFull || closedForMe}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${isFull || closedForMe
                ? "bg-muted text-muted cursor-not-allowed opacity-60"
                : "bg-[var(--primary)] text-[var(--brand-contrast)] hover:bg-[var(--primary-dark)] disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : closedForMe ? <Lock size={12} /> : isFull ? null : <Check size={12} />}
            {closedForMe ? (ui.started ? "Commencée" : "Fermé") : isFull ? "Complet" : "Réserver"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted mb-3">
        <span className="col-span-2 flex items-center gap-2 font-medium text-primary">
          <CoachAvatar name={session.coach} photoUrl={session.coachPhotoUrl} size={24} />
          {session.coach}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {session.startTime}–{session.endTime}
        </span>
        <span className="flex items-center gap-1">
          <MapPin size={11} />
          {session.location}
        </span>
      </div>

      <CapacityBar currentBookings={session.currentBookings} capacity={session.capacity} />

      {ui.closesLabel && !isBooked && (
        <p className={`mt-2.5 flex items-start gap-1.5 text-[11px] ${closedForMe ? "text-amber-600 dark:text-amber-400" : "text-muted"}`}>
          <Lock size={11} className="mt-px flex-shrink-0" />
          {closedForMe
            ? ui.started ? "Cette séance a déjà commencé." : (policy?.message ?? DEFAULT_POLICY_MESSAGE)
            : `Réservations jusqu'à ${ui.closesLabel}`}
        </p>
      )}

      {session.description && (
        <p className="text-xs text-muted mt-2.5 leading-relaxed">{session.description}</p>
      )}
    </div>
  );
}

// ─── Session Detail Modal ───────────────────────────────────────────────────

function SessionModal({
  session,
  onClose,
  onBook,
  onCancel,
  pending,
  nowMs,
  policy,
}: {
  session: Session;
  onClose: () => void;
  onBook: (id: string) => void;
  onCancel: (id: string) => void;
  pending: boolean;
  nowMs: number;
  policy: ReservationPolicy | null;
}) {
  const color = ACTIVITY_COLORS[session.activity] ?? DEFAULT_COLOR;
  const isBooked = session.isBookedByUser;
  const isFull = session.isFull && !isBooked;
  const ui = reservationUi(session, nowMs, policy?.timeZone ?? "Africa/Tunis");
  const closedForMe = ui.closed && !isBooked;
  const pct = session.capacity > 0 ? Math.min(session.currentBookings / session.capacity, 1) : 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Colored header strip */}
        <div className={`px-5 pt-5 pb-4 ${color.bg} border-b ${color.border}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full bg-card ${color.text}`}>
                {ACTIVITY_LABELS[session.activity] ?? session.activity}
              </span>
              <p className="text-base font-bold text-primary mt-2">{session.coach}</p>
              <p className="text-sm text-muted capitalize">{session.date ? formatDayLong(session.date) : DAY_LABELS_FULL[session.day]}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-muted transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Meta info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xs text-muted mb-0.5">Horaire</p>
              <p className="text-sm font-semibold text-primary flex items-center gap-1.5">
                <Clock size={13} className="text-muted" />
                {session.startTime}–{session.endTime}
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xs text-muted mb-0.5">Salle</p>
              <p className="text-sm font-semibold text-primary flex items-center gap-1.5">
                <MapPin size={13} className="text-muted" />
                {session.location}
              </p>
            </div>
          </div>

          {/* Capacity section — the main focus of the modal */}
          <div className="bg-muted/50 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <Users size={13} />
                Capacité
              </p>
              <p className={`text-xs font-bold ${pct >= 1 ? "text-red-500" : pct >= 0.8 ? "text-amber-500" : "text-emerald-500"}`}>
                {pct >= 1
                  ? "Complet"
                  : `${session.spotsLeft} place${session.spotsLeft > 1 ? "s" : ""} disponible${session.spotsLeft > 1 ? "s" : ""}`}
              </p>
            </div>
            {/* Detailed capacity bar */}
            <div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    pct >= 1 ? "bg-red-500" : pct >= 0.8 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted mt-1.5">
                <span>{session.currentBookings} inscrits</span>
                <span>{session.capacity} max</span>
              </div>
            </div>

            {/* Seat pills: show individual spots for small classes */}
            {session.capacity <= 20 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {Array.from({ length: session.capacity }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-5 h-5 rounded-md transition-colors ${
                      i < session.currentBookings
                        ? isBooked && i === session.currentBookings - 1
                          ? "bg-[var(--primary)]"
                          : pct >= 1 ? "bg-red-400" : pct >= 0.8 ? "bg-amber-400" : "bg-emerald-400"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Status badge */}
          {isBooked && (
            <div className="flex items-center gap-2 bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded-xl px-3.5 py-2.5">
              <BookCheck size={15} className="text-[var(--primary)]" />
              <p className="text-sm font-semibold text-[var(--primary)]">Vous êtes inscrit à cette session</p>
            </div>
          )}

          {session.description && (
            <p className="text-sm text-muted leading-relaxed">{session.description}</p>
          )}

          {/* Reservation cutoff */}
          {ui.closesLabel && !isBooked && (
            <div
              className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${
                closedForMe ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-border text-primary"
              }`}
              role={closedForMe ? "alert" : undefined}
            >
              <Lock size={15} className="mt-0.5 flex-shrink-0" />
              <p>
                {closedForMe ? (
                  <>
                    {ui.started ? "Cette séance a déjà commencé." : (policy?.message ?? DEFAULT_POLICY_MESSAGE)}
                    {!ui.started && <span className="block text-xs opacity-80">Fermées depuis {ui.closesLabel}.</span>}
                  </>
                ) : (
                  <>
                    Réservations jusqu&apos;à <strong>{ui.closesLabel}</strong>
                    <span className="block text-xs text-muted">{policy?.message ?? DEFAULT_POLICY_MESSAGE}</span>
                  </>
                )}
              </p>
            </div>
          )}

          {/* CTA */}
          {isBooked ? (
            <button
              onClick={() => onCancel(session.id)}
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-red-500 border-2 border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {pending ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
              Annuler ma réservation
            </button>
          ) : (
            <button
              onClick={() => onBook(session.id)}
              disabled={pending || isFull || closedForMe}
              aria-disabled={pending || isFull || closedForMe}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors
                ${isFull || closedForMe
                  ? "bg-muted text-muted cursor-not-allowed opacity-60"
                  : "bg-[var(--primary)] text-[var(--brand-contrast)] hover:bg-[var(--primary-dark)] disabled:opacity-40"
                }`}
            >
              {pending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : closedForMe ? (
                <Lock size={16} />
              ) : isFull ? (
                <Users size={16} />
              ) : (
                <Zap size={16} />
              )}
              {closedForMe ? (ui.started ? "Séance commencée" : "Réservations fermées") : isFull ? "Session complète" : "Réserver cette session"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Week Grid ───────────────────────────────────────────────────────────────

function WeekGrid({
  sessions,
  onSelect,
  weekAnchor,
  today,
  nowMs,
  timeZone,
}: {
  sessions: Session[];
  onSelect: (s: Session) => void;
  weekAnchor: IsoDate;
  today: IsoDate;
  nowMs: number;
  timeZone: string;
}) {
  const dates = weekDates(weekAnchor);
  const byDay = useMemo(() => {
    const map: Record<string, Session[]> = {};
    for (const day of DAYS) {
      map[day] = sessions
        .filter((s) => s.day === day)
        .slice()
        .sort((a, b) => (toMinutes(a.startTime) ?? 0) - (toMinutes(b.startTime) ?? 0));
    }
    return map;
  }, [sessions]);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <div className="grid grid-cols-[56px_repeat(7,minmax(120px,1fr))] min-w-[820px]">
          {/* Header */}
          <div className="border-b border-border" />
          {DAYS.map((day, i) => (
            <div key={day} className={`border-b border-l border-border px-2 py-2.5 text-center ${dates[i] === today ? "bg-[var(--primary)]/10" : ""}`}>
              <p className="text-xs font-semibold text-primary">{DAY_LABELS_SHORT[day]}</p>
              <p className={`text-[11px] ${dates[i] === today ? "font-bold text-[var(--primary)]" : "text-muted"}`}>{parseIso(dates[i])!.d}</p>
            </div>
          ))}

          {/* Time axis */}
          <div className="relative" style={{ height: GRID_HEIGHT }}>
            {HOUR_MARKS.map((m) => (
              <div key={m} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted" style={{ top: (m - DAY_START_MIN) * PX_PER_MIN }}>
                {formatHourLabel(m)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((day) => (
            <div key={day} className="relative border-l border-border" style={{ height: GRID_HEIGHT }}>
              {HOUR_MARKS.map((m) => (
                <div key={m} className="absolute left-0 right-0 border-t border-border/50" style={{ top: (m - DAY_START_MIN) * PX_PER_MIN }} />
              ))}

              {byDay[day].map((s) => {
                const start = toMinutes(s.startTime);
                const end = toMinutes(s.endTime);
                if (start === null || end === null) return null;

                const clampedStart = Math.max(start, DAY_START_MIN);
                const clampedEnd = Math.min(Math.max(end, clampedStart + 15), DAY_END_MIN);
                const top = (clampedStart - DAY_START_MIN) * PX_PER_MIN;
                const height = Math.max((clampedEnd - clampedStart) * PX_PER_MIN, 28);
                const color = ACTIVITY_COLORS[s.activity] ?? DEFAULT_COLOR;
                const pct = s.capacity > 0 ? Math.min(s.currentBookings / s.capacity, 1) : 1;
                const closedForMe = !s.isBookedByUser && reservationUi(s, nowMs, timeZone).closed;

                return (
                  <button
                    key={s.id}
                    onClick={() => onSelect(s)}
                    title={closedForMe ? "Réservations fermées" : undefined}
                    style={{ top, height }}
                    className={`absolute left-1 right-1 rounded-lg border ${color.border} ${color.bg} px-1.5 py-1 text-left overflow-hidden hover:brightness-95 dark:hover:brightness-110 transition-all
                      ${s.isBookedByUser ? "ring-2 ring-[var(--primary)]/50" : ""}`}
                  >
                    <p className={`text-[11px] font-bold truncate ${color.text} ${closedForMe ? "opacity-70" : ""}`}>
                      {closedForMe && <Lock size={9} className="mr-0.5 inline -mt-0.5" aria-label="Réservations fermées" />}
                      {ACTIVITY_LABELS[s.activity] ?? s.activity}
                    </p>
                    <p className="text-[10px] text-muted truncate">{s.startTime}–{s.endTime}</p>
                    {/* Tiny capacity bar in week block */}
                    {height > 36 && (
                      <div className="absolute bottom-1 left-1.5 right-1.5 h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 1 ? "bg-red-500" : pct >= 0.8 ? "bg-amber-400" : "bg-emerald-400"}`}
                          style={{ width: `${pct * 100}%` }}
                        />
                      </div>
                    )}
                    {s.isBookedByUser && (
                      <div className="absolute top-1 right-1">
                        <div className="w-2 h-2 rounded-full bg-[var(--primary)]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Month Grid ──────────────────────────────────────────────────────────────

function MonthGrid({
  anchor,
  today,
  sessionsByDate,
  selectedDate,
  onSelectDate,
}: {
  anchor: IsoDate;
  today: IsoDate;
  sessionsByDate: Record<string, Session[]>;
  selectedDate: string | null;
  onSelectDate: (iso: string) => void;
}) {
  const grid = monthGrid(anchor);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {DAYS.map((day) => (
          <div key={day} className="px-2 py-2.5 text-center">
            <p className="text-xs font-semibold text-muted">{DAY_LABELS_SHORT[day]}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.flat().map((cell) => {
          const iso = cell.iso;
          const inMonth = cell.inMonth;
          const daySessions = sessionsByDate[iso] ?? [];
          const isToday = iso === today;
          const isSelected = iso === selectedDate;
          const bookedCount = daySessions.filter((s) => s.isBookedByUser).length;

          return (
            <button
              key={iso}
              onClick={() => onSelectDate(iso)}
              aria-label={`${formatDayLong(iso)} — ${daySessions.length} session${daySessions.length !== 1 ? "s" : ""}`}
              className={`relative flex flex-col items-start gap-1 p-2 h-20 sm:h-24 border-b border-r border-border text-left transition-colors
                ${inMonth ? "bg-card" : "bg-muted/30"}
                ${isSelected ? "bg-[var(--primary)]/10 ring-2 ring-inset ring-[var(--primary)]/30" : "hover:bg-muted/50"}`}
            >
              <span
                className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                  ${isToday ? "bg-[var(--primary)] text-[var(--brand-contrast)]" : inMonth ? "text-primary" : "text-muted"}`}
              >
                {parseIso(iso)!.d}
              </span>
              {daySessions.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {daySessions.slice(0, 3).map((s) => {
                    const color = ACTIVITY_COLORS[s.activity] ?? DEFAULT_COLOR;
                    return (
                      <span
                        key={s.id}
                        className={`w-1.5 h-1.5 rounded-full ${color.dot} ${s.isBookedByUser ? "ring-2 ring-[var(--primary)]/60 ring-offset-1" : ""}`}
                      />
                    );
                  })}
                  {daySessions.length > 3 && (
                    <span className="text-[10px] text-muted">+{daySessions.length - 3}</span>
                  )}
                </div>
              )}
              {bookedCount > 0 && (
                <span className="absolute bottom-1 right-1.5 text-[10px] font-bold text-[var(--primary)] bg-[var(--primary)]/10 rounded px-1">
                  {bookedCount}✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const byStart = (a: Session, b: Session) => (toMinutes(a.startTime) ?? 0) - (toMinutes(b.startTime) ?? 0);

export default function SchedulePage() {
  // Phones start on the agenda (a 7-column grid is unreadable there); everyone else on the week.
  const cal = useCalendarState({
    storageKey: "clubx.member.schedule.view",
    defaultView: typeof window !== "undefined" && window.innerWidth < 640 ? "agenda" : "week",
  });
  const { view, anchor, today, range } = cal;

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sessionsByDate, setSessionsByDate] = useState<Record<string, Session[]>>({});
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<ReservationPolicy | null>(null);
  const [skewMs, setSkewMs] = useState(0); // serverNow − browser clock, so a wrong device clock cannot unlock a closed session
  const [nowTick, setNowTick] = useState(() => Date.now());

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activityFilter, setActivityFilter] = useState<string | null>(null);
  // Client-side refinements (the activity filter stays server-side, as before).
  const [search, setSearch] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") ?? "" : ""));
  const [coachFilter, setCoachFilter] = useState("ALL");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const requestSeq = useRef(0);
  const nowMs = nowTick + skewMs;
  const currentKey = `${range.start}|${range.end}|${activityFilter ?? ""}`;
  const settled = loadedKey === currentKey;

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
  }, []);

  // Re-evaluate "is this session still bookable?" every 15 s without hitting the server.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  /**
   * Loads every week the current view touches (week/day → 1, agenda → 2-3, month → 5-6) in parallel.
   * Only the most recent request may write state, so rapid Prev/Next clicks can never show an older
   * period's data under a newer label.
   */
  const fetchRange = useCallback(
    async (silent: boolean) => {
      const seq = ++requestSeq.current;
      const key = `${range.start}|${range.end}|${activityFilter ?? ""}`;
      const mondays = mondaysInRange(range.start, range.end);
      setIsRefreshing(true);
      if (!silent) setLoadError(null);
      try {
        const results = await Promise.all(
          mondays.map(async (monday) => {
            const params = new URLSearchParams({ weekStart: monday });
            if (activityFilter) params.set("activity", activityFilter);
            try {
              const res = await fetch(`/api/dashboard/schedule?${params.toString()}`, { credentials: "include" });
              const json = (await res.json().catch(() => null)) as (ScheduleData & { error?: string }) | null;
              return { monday, ok: res.ok, json };
            } catch {
              return { monday, ok: false, json: null };
            }
          })
        );
        if (seq !== requestSeq.current) return; // superseded by a newer navigation

        const failed = results.find((r) => !r.ok);
        if (failed && results.every((r) => !r.ok)) {
          const message = failed.json?.error || "Impossible de charger le planning";
          if (!silent) setLoadError(message);
          else showToast(message, "error");
          return;
        }

        const byDate: Record<string, Session[]> = {};
        for (const { monday, ok, json } of results) {
          if (!ok || !json?.weeklyPlan) continue;
          for (const s of json.sessions) {
            const date = addDays(monday, DAY_INDEX[s.day] ?? 0);
            (byDate[date] ??= []).push({ ...s, date });
          }
          if (json.reservationPolicy) {
            setPolicy(json.reservationPolicy);
            const server = Date.parse(json.reservationPolicy.serverNow);
            if (!Number.isNaN(server)) setSkewMs(server - Date.now());
          }
        }
        for (const iso in byDate) byDate[iso].sort(byStart);
        setSessionsByDate(byDate);
        setLoadedKey(key);
        setLoadError(null);
        setNowTick(Date.now());
      } finally {
        if (seq === requestSeq.current) setIsRefreshing(false);
      }
    },
    [range.start, range.end, activityFilter, showToast]
  );

  // Fetch on every navigation (data synchronisation with the server, not derived state).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    fetchRange(false);
  }, [fetchRange]);

  useEffect(() => {
    const id = setInterval(() => fetchRange(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchRange]);

  // Optimistic update helper — reflects booking state immediately in UI
  // so there's no visual lag between click and server response.
  const optimisticUpdate = useCallback((sessionId: string, booked: boolean) => {
    const patch = (s: Session): Session => {
      if (s.id !== sessionId) return s;
      const delta = booked ? 1 : -1;
      const newBookings = s.currentBookings + delta;
      return {
        ...s,
        isBookedByUser: booked,
        currentBookings: newBookings,
        isFull: newBookings >= s.capacity,
        spotsLeft: Math.max(0, s.capacity - newBookings),
      };
    };
    setSessionsByDate((prev) => {
      const next: Record<string, Session[]> = {};
      for (const iso in prev) next[iso] = prev[iso].map(patch);
      return next;
    });
  }, []);

  const handleBook = async (sessionId: string) => {
    setPendingId(sessionId);
    optimisticUpdate(sessionId, true);
    try {
      const res = await fetch("/api/dashboard/schedule/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast("Session réservée !", "success");
        fetchRange(true);
      } else {
        // Roll back optimistic update on error; the server is the authority (full, closed, plan limit…)
        optimisticUpdate(sessionId, false);
        showToast(json.error || "Erreur de réservation", "error");
        if (json.code === "RESERVATION_CLOSED") fetchRange(true); // resync closing state
      }
    } catch {
      optimisticUpdate(sessionId, false);
      showToast("Erreur serveur", "error");
    } finally {
      setPendingId(null);
    }
  };

  const handleCancel = async (sessionId: string) => {
    setPendingId(sessionId);
    optimisticUpdate(sessionId, false);
    try {
      const res = await fetch("/api/dashboard/schedule/book", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast("Réservation annulée", "success");
        fetchRange(true);
      } else {
        optimisticUpdate(sessionId, true);
        showToast(json.error || "Erreur d'annulation", "error");
      }
    } catch {
      optimisticUpdate(sessionId, true);
      showToast("Erreur serveur", "error");
    } finally {
      setPendingId(null);
    }
  };

  const changeDay = (iso: string) => setSelectedDate((cur) => (cur === iso ? null : iso));

  // Sessions inside what the current view shows
  const visibleDates = useMemo(() => {
    const out: string[] = [];
    for (let d = range.start; compareIso(d, range.end) <= 0; d = addDays(d, 1)) out.push(d);
    return out;
  }, [range.start, range.end]);
  const allSessions = useMemo(() => Object.values(sessionsByDate).flat(), [sessionsByDate]);
  const coaches = useMemo(() => Array.from(new Set(allSessions.map((s) => s.coach))).sort((a, b) => a.localeCompare(b, "fr")), [allSessions]);
  const filtersActive = search.trim() !== "" || coachFilter !== "ALL" || availability !== "all";
  // Everything rendered below reads `filteredByDate`; booking/optimistic logic keeps using the full data.
  const filteredByDate = useMemo(() => {
    const out: Record<string, Session[]> = {};
    for (const [date, list] of Object.entries(sessionsByDate)) {
      const kept = filterSessions(list, { query: search, coach: coachFilter, availability, nowMs: nowTick + skewMs, activityLabels: ACTIVITY_LABELS });
      if (kept.length) out[date] = kept;
    }
    return out;
  }, [sessionsByDate, search, coachFilter, availability, nowTick, skewMs]);
  const visibleSessions = useMemo(() => visibleDates.flatMap((d) => filteredByDate[d] ?? []), [visibleDates, filteredByDate]);
  const selectedSession = selectedSessionId ? allSessions.find((s) => s.id === selectedSessionId) ?? null : null;

  const stats = useMemo(() => {
    const booked = visibleSessions.filter((s) => s.isBookedByUser).length;
    const available = visibleSessions.filter(
      (s) => !s.isFull && !s.isBookedByUser && !reservationUi(s, nowMs, policy?.timeZone ?? "Africa/Tunis").closed
    ).length;
    return { booked, available, total: visibleSessions.length };
  }, [visibleSessions, nowMs, policy]);

  const timeZone = policy?.timeZone ?? "Africa/Tunis";
  const monthSelected = view === "month" && selectedDate && compareIso(selectedDate, range.start) >= 0 && compareIso(selectedDate, range.end) <= 0 ? selectedDate : null;

  const card = (s: Session) => (
    <SessionCard
      key={s.id}
      session={s}
      onBook={handleBook}
      onCancel={handleCancel}
      pending={pendingId === s.id}
      nowMs={nowMs}
      policy={policy}
    />
  );

  const emptyPeriod = (
    <EmptyState
      icon={CalendarX}
      title={filtersActive || activityFilter ? "Aucune session ne correspond" : "Aucune session sur cette période"}
      description={filtersActive ? "Modifiez ou effacez vos filtres pour voir plus de séances." : "Essayez une autre période ou revenez plus tard."}
      action={
        <button onClick={cal.goToday} className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--brand-contrast)] hover:bg-[var(--primary-dark)]">
          Revenir à aujourd&apos;hui
        </button>
      }
    />
  );

  const skeleton = (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement du planning">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );

  const renderBody = () => {
    if (loadError && !settled) {
      return (
        <EmptyState
          icon={AlertCircle}
          title="Impossible de charger le planning"
          description={loadError}
          action={
            <button onClick={() => fetchRange(false)} className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--brand-contrast)]">
              Réessayer
            </button>
          }
        />
      );
    }
    if (!settled) return skeleton;

    if (view === "week") {
      return visibleSessions.length === 0 ? emptyPeriod : (
        <WeekGrid
          sessions={visibleSessions}
          onSelect={(s) => setSelectedSessionId(s.id)}
          weekAnchor={anchor}
          today={today}
          nowMs={nowMs}
          timeZone={timeZone}
        />
      );
    }

    if (view === "month") {
      const daySessions = monthSelected ? filteredByDate[monthSelected] ?? [] : [];
      return (
        <div className="space-y-4">
          <MonthGrid anchor={anchor} today={today} sessionsByDate={filteredByDate} selectedDate={monthSelected} onSelectDate={changeDay} />
          {monthSelected && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <p className="text-sm font-semibold text-primary mb-3 capitalize">{formatDayLong(monthSelected)}</p>
              {daySessions.length === 0 ? (
                <div className="flex items-center gap-3 text-sm text-muted py-4">
                  <CalendarX size={16} />
                  Aucune session ce jour-là.
                </div>
              ) : (
                <div className="space-y-3">{daySessions.map(card)}</div>
              )}
            </div>
          )}
        </div>
      );
    }

    // day + agenda ("À venir"): a list of cards grouped by calendar day
    const days = visibleDates.filter((d) => (filteredByDate[d] ?? []).length > 0);
    if (days.length === 0) return emptyPeriod;
    return (
      <div className="space-y-5">
        {days.map((d) => (
          <section key={d} aria-label={formatDayLong(d)}>
            <h3 className={`mb-2 text-sm font-bold capitalize ${d === today ? "text-[var(--primary)]" : "text-primary"}`}>
              {formatDayLong(d)}
              {d === today && <span className="ml-2 rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-[11px] font-semibold">Aujourd&apos;hui</span>}
            </h3>
            <div className="space-y-3">{(filteredByDate[d] ?? []).map(card)}</div>
          </section>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-primary">Planning</h1>
          <p className="mt-1 text-muted">Parcourez les séances de votre club et réservez votre place.</p>
        </div>
      </div>

      {/* Prev / Next / Today / date picker / view — always mounted, never disabled while loading */}
      <CalendarToolbar
        cal={cal}
        right={
          <button
            onClick={() => fetchRange(false)}
            className="p-2.5 rounded-xl bg-muted hover:bg-muted/70 transition-colors"
            title="Actualiser"
            aria-label="Actualiser"
          >
            <RefreshCw size={16} className={`text-muted ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        }
      />

      {/* Stats bar */}
      {settled && stats.total > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3.5 py-2 bg-[var(--primary)]/10 rounded-xl">
            <BookCheck size={13} className="text-[var(--primary)]" />
            <span className="text-xs font-semibold text-[var(--primary)]">
              {stats.booked} réservée{stats.booked > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500/10 rounded-xl">
            <Zap size={13} className="text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {stats.available} disponible{stats.available > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-2 bg-muted rounded-xl">
            <CalendarDays size={13} className="text-muted" />
            <span className="text-xs font-semibold text-muted">
              {stats.total} session{stats.total > 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <section className="mx-card space-y-3 p-3 sm:p-4" aria-label="Recherche et filtres">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <label htmlFor="planning-search" className="sr-only">Rechercher une séance</label>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input id="planning-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une activité, un coach, une salle…" className="mx-input pl-9" autoComplete="off" />
          </div>
          <div>
            <label htmlFor="planning-coach" className="sr-only">Filtrer par coach</label>
            <select id="planning-coach" value={coachFilter} onChange={(e) => setCoachFilter(e.target.value)} className="mx-input lg:w-52">
              <option value="ALL">Tous les coachs</option>
              {coaches.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-muted/60 p-1" role="group" aria-label="Disponibilité">
            {([["all", "Toutes"], ["available", "Disponibles"], ["booked", "Réservées"], ["full", "Complètes"]] as [AvailabilityFilter, string][]).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setAvailability(key)} aria-pressed={availability === key} className="mx-chip whitespace-nowrap">{label}</button>
            ))}
          </div>
        </div>

        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Activité">
          <button onClick={() => setActivityFilter(null)} aria-pressed={!activityFilter} className="mx-chip flex-shrink-0 whitespace-nowrap">Toutes les activités</button>
          {ACTIVITIES.map((a) => (
            <button key={a} onClick={() => setActivityFilter(a)} aria-pressed={activityFilter === a} className="mx-chip flex-shrink-0 whitespace-nowrap">{ACTIVITY_LABELS[a]}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Légende">
            <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Disponible</li>
            <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Presque complet</li>
            <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Complet</li>
            <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--primary)]" />Réservé</li>
            <li className="flex items-center gap-1.5"><Lock size={10} aria-hidden />Réservations fermées</li>
          </ul>
          {filtersActive && (
            <button type="button" onClick={() => { setSearch(""); setCoachFilter("ALL"); setAvailability("all"); }} className="inline-flex items-center gap-1 font-semibold text-[var(--primary)] hover:underline">
              <Ban size={11} aria-hidden />Effacer la recherche et les filtres
            </button>
          )}
        </div>
      </section>

      {/* Reservation rule, always visible so members know why a button is disabled */}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Lock size={12} /> {policy?.message ?? DEFAULT_POLICY_MESSAGE}
      </p>

      <div className={isRefreshing && settled ? "opacity-70 transition-opacity" : "transition-opacity"}>{renderBody()}</div>

      {/* Session detail modal */}
      {selectedSession && (
        <SessionModal
          session={selectedSession}
          onClose={() => setSelectedSessionId(null)}
          onBook={handleBook}
          onCancel={handleCancel}
          pending={pendingId === selectedSession.id}
          nowMs={nowMs}
          policy={policy}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
