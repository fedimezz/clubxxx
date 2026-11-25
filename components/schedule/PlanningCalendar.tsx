"use client";

// Pro planning calendar for staff (OWNER / ADMIN; read-only for coaches): day / week / month views,
// prev / next / Today / date picker, coach + activity filters, colour-coded sessions, capacity bars,
// side panel with details, double-booking warnings and the reservation closing time.
// Pure presentation: data and mutations come from the page (so club isolation stays server-side).
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, Clock, Edit, MapPin, Trash2, User, Users, X, CalendarX2, Lock } from "lucide-react";
import {
  WEEKDAYS_FR, WEEKDAYS_SHORT_FR, clockTime, compareIso, conflictingIds, findSlotConflicts,
  formatDayLong, monthGrid, parseIso, reservationClosesAt, sessionStartInstant, timeToMinutes, weekDates,
  type CalendarView, type IsoDate,
} from "@/lib/calendar-nav";
import CalendarToolbar from "./CalendarToolbar";
import { useCalendarState } from "./useCalendarState";
import { ACTIVITY_LABELS, activityColor, activityLabel, fillRatio, fillTone } from "./activity-style";
import EmptyState from "@/components/ui/EmptyState";
import Tooltip from "@/components/ui/Tooltip";

export interface PlanningSession {
  id: string;
  date: IsoDate;
  startTime: string;
  endTime: string;
  activity: string;
  coach: string;
  coachId: string | null;
  location: string;
  capacity: number;
  currentBookings: number;
  description?: string | null;
  planId: string;
  planActive?: boolean;
}

interface Props {
  sessions: PlanningSession[];
  storageKey: string;
  timeZone?: string;
  cutoffMinutes?: number;
  /** Shows the add / edit / delete actions (OWNER / ADMIN). Coaches get a read-only calendar. */
  canManage?: boolean;
  onAdd?: (date: IsoDate) => void;
  onEdit?: (session: PlanningSession) => void;
  onDelete?: (session: PlanningSession) => void;
  loading?: boolean;
}

const byTime = (a: PlanningSession, b: PlanningSession) =>
  (timeToMinutes(a.startTime) ?? 0) - (timeToMinutes(b.startTime) ?? 0) || a.id.localeCompare(b.id);

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function CapacityBar({ booked, capacity }: { booked: number; capacity: number }) {
  const ratio = fillRatio(booked, capacity);
  const tone = fillTone(ratio);
  return (
    <div className="flex items-center gap-2" title={`${booked}/${capacity} — ${tone.label}`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className={`whitespace-nowrap text-[11px] font-semibold ${tone.text}`}>
        {booked}/{capacity}
      </span>
    </div>
  );
}

function SessionCard({
  s, conflict, selected, onSelect, compact,
}: { s: PlanningSession; conflict: boolean; selected: boolean; onSelect: () => void; compact?: boolean }) {
  const color = activityColor(s.activity);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-session-id={s.id}
      className={`w-full rounded-xl border bg-card p-2.5 text-left transition-shadow hover:shadow-md ${
        selected ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/25" : "border-border"
      }`}
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-bold text-primary">
          {s.startTime}–{s.endTime}
        </p>
        {conflict && (
          <Tooltip label="Conflit : même coach ou même salle sur un créneau qui se chevauche">
            <AlertTriangle size={14} className="text-amber-500" aria-label="Conflit de planning" />
          </Tooltip>
        )}
      </div>
      <p className="mt-0.5 truncate text-sm font-semibold" style={{ color }}>
        {activityLabel(s.activity)}
      </p>
      {!compact && (
        <p className="truncate text-xs text-muted">
          {s.coach || "—"} · {s.location || "—"}
        </p>
      )}
      <div className="mt-1.5">
        <CapacityBar booked={s.currentBookings} capacity={s.capacity} />
      </div>
    </button>
  );
}

function SidePanel({
  s, conflicts, canManage, timeZone, cutoffMinutes, now, onClose, onEdit, onDelete,
}: {
  s: PlanningSession;
  conflicts: Array<{ kind: "coach" | "location"; other: PlanningSession }>;
  canManage: boolean;
  timeZone?: string;
  cutoffMinutes: number;
  now: number;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const start = sessionStartInstant(s.date, s.startTime, timeZone);
  const closesAt = start ? reservationClosesAt(start, cutoffMinutes) : null;
  const closed = closesAt ? now >= closesAt.getTime() : false;
  const ratio = fillRatio(s.currentBookings, s.capacity);
  const tone = fillTone(ratio);
  const spots = Math.max(0, s.capacity - s.currentBookings);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 xl:hidden" onClick={onClose} aria-hidden />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto border-l border-border bg-card shadow-2xl sm:w-[390px]"
        role="dialog"
        aria-label="Détails de la session"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5" style={{ borderTop: `4px solid ${activityColor(s.activity)}` }}>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Session</p>
            <h3 className="truncate text-xl font-bold" style={{ color: activityColor(s.activity) }}>
              {activityLabel(s.activity)}
            </h3>
            <p className="mt-0.5 text-sm capitalize text-primary">{formatDayLong(s.date)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-muted hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2.5 text-primary">
              <Clock size={15} className="text-muted" /> {s.startTime} – {s.endTime}
            </div>
            <div className="flex items-center gap-2.5 text-primary">
              <User size={15} className="text-muted" /> {s.coach || "Coach non défini"}
            </div>
            <div className="flex items-center gap-2.5 text-primary">
              <MapPin size={15} className="text-muted" /> {s.location || "Lieu non défini"}
            </div>
          </dl>

          <div className="space-y-2 rounded-xl bg-muted/50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-primary">
                <Users size={14} /> Remplissage
              </span>
              <span className={`font-bold ${tone.text}`}>
                {Math.round(ratio * 100)}% — {tone.label}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full transition-all ${tone.bar}`} style={{ width: `${ratio * 100}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted">
              <span>{s.currentBookings} inscrit{s.currentBookings !== 1 ? "s" : ""}</span>
              <span>{spots} place{spots !== 1 ? "s" : ""} libre{spots !== 1 ? "s" : ""}</span>
              <span>{s.capacity} max</span>
            </div>
          </div>

          {closesAt && (
            <div
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm ${
                closed ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-border text-primary"
              }`}
            >
              <Lock size={15} className="mt-0.5 flex-shrink-0" />
              <p>
                {closed ? "Réservations fermées" : "Réservations ouvertes"} — fermeture à{" "}
                <strong>{clockTime(closesAt, timeZone)}</strong>
                <span className="block text-xs text-muted">{cutoffMinutes} min avant le début. Les réservations existantes sont conservées.</span>
              </p>
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300" role="alert">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle size={15} /> Conflit de planning
              </p>
              {conflicts.map((c, i) => (
                <p key={`${c.other.id}-${c.kind}-${i}`} className="text-xs">
                  {c.kind === "coach" ? `Même coach (${c.other.coach})` : `Même salle (${c.other.location})`} : {activityLabel(c.other.activity)}{" "}
                  {c.other.startTime}–{c.other.endTime}
                </p>
              ))}
            </div>
          )}

          {s.description && <p className="whitespace-pre-line text-sm text-muted">{s.description}</p>}

          {canManage && (onEdit || onDelete) && (
            <div className="flex gap-2 pt-1">
              {onEdit && (
                <button type="button" onClick={onEdit} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] py-2.5 text-sm font-semibold text-[var(--brand-contrast)] hover:bg-[var(--primary-dark)]">
                  <Edit size={15} /> Modifier
                </button>
              )}
              {onDelete && (
                <button type="button" onClick={onDelete} className="flex items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-500/10">
                  <Trash2 size={15} /> Supprimer
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export default function PlanningCalendar({
  sessions, storageKey, timeZone, cutoffMinutes = 20, canManage = false, onAdd, onEdit, onDelete, loading = false,
}: Props) {
  const cal = useCalendarState({ storageKey, timeZone, views: ["day", "week", "month"] });
  const now = useNow(30_000);
  const [coachFilter, setCoachFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const coachOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) if (s.coach) m.set(s.coachId ?? `name:${s.coach}`, s.coach);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sessions]);
  const activityOptions = useMemo(() => [...new Set(sessions.map((s) => s.activity))].sort(), [sessions]);

  // Everything visible in the current period (before the person's filters) → used for conflicts.
  const inRange = useMemo(
    () => sessions.filter((s) => compareIso(s.date, cal.range.start) >= 0 && compareIso(s.date, cal.range.end) <= 0),
    [sessions, cal.range]
  );
  const conflictIds = useMemo(() => conflictingIds(inRange), [inRange]);

  const visible = useMemo(
    () =>
      inRange.filter(
        (s) =>
          (!coachFilter || (s.coachId ?? `name:${s.coach}`) === coachFilter) && (!activityFilter || s.activity === activityFilter)
      ),
    [inRange, coachFilter, activityFilter]
  );
  const byDate = useMemo(() => {
    const map = new Map<IsoDate, PlanningSession[]>();
    for (const s of visible) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    for (const list of map.values()) list.sort(byTime);
    return map;
  }, [visible]);

  const selected = selectedId ? sessions.find((s) => s.id === selectedId) ?? null : null;
  const selectedConflicts = useMemo(
    () => (selected ? findSlotConflicts(selected, sessions) : []),
    [selected, sessions]
  );

  const filtersActive = Boolean(coachFilter || activityFilter);
  const conflictCount = conflictIds.size;
  const card = (s: PlanningSession, compact = false) => (
    <SessionCard key={s.id} s={s} compact={compact} conflict={conflictIds.has(s.id)} selected={selectedId === s.id} onSelect={() => setSelectedId(s.id)} />
  );
  const addButton = (date: IsoDate, label = "Ajouter") =>
    canManage && onAdd ? (
      <button
        type="button"
        onClick={() => onAdd(date)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-1.5 text-xs font-medium text-muted transition-colors hover:border-[var(--primary)]/50 hover:text-primary"
      >
        <CalendarPlus size={13} /> {label}
      </button>
    ) : null;

  const renderDay = (date: IsoDate) => {
    const list = byDate.get(date) ?? [];
    return list.length === 0 ? (
      <EmptyState
        icon={CalendarX2}
        title="Aucune session ce jour"
        description={filtersActive ? "Aucun résultat avec ces filtres." : "Rien de prévu pour cette date."}
        action={addButton(date, "Ajouter une session")}
      />
    ) : (
      <div className="space-y-2.5">
        {list.map((s) => (
          <div key={s.id} className="flex gap-3">
            <p className="w-14 flex-shrink-0 pt-3 text-right text-xs font-semibold text-muted">{s.startTime}</p>
            <div className="min-w-0 flex-1">{card(s)}</div>
          </div>
        ))}
        {addButton(date, "Ajouter une session ce jour")}
      </div>
    );
  };

  const renderWeek = () => (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
      {weekDates(cal.anchor).map((date, i) => {
        const list = byDate.get(date) ?? [];
        const isToday = date === cal.today;
        const c = parseIso(date)!;
        return (
          <section
            key={date}
            aria-label={`${WEEKDAYS_FR[i]} ${c.d}`}
            className={`rounded-2xl border p-2.5 ${isToday ? "border-[var(--primary)]/60 bg-[var(--primary)]/5" : "border-border bg-card/60"}`}
          >
            <button type="button" onClick={() => cal.openDay(date)} className="mb-2 flex w-full items-baseline justify-between text-left" aria-label={`Ouvrir ${WEEKDAYS_FR[i]} ${c.d}`}>
              <span className="text-xs font-bold uppercase tracking-wide text-muted">{WEEKDAYS_SHORT_FR[i]}</span>
              <span className={`text-lg font-bold ${isToday ? "text-[var(--primary)]" : "text-primary"}`}>{c.d}</span>
            </button>
            <div className="space-y-2">
              {list.length === 0 ? <p className="py-3 text-center text-xs text-muted">—</p> : list.map((s) => card(s, true))}
              {addButton(date)}
            </div>
          </section>
        );
      })}
    </div>
  );

  const renderMonth = () => {
    const grid = monthGrid(cal.anchor);
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {WEEKDAYS_SHORT_FR.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wide text-muted">{d}</div>
          ))}
        </div>
        {grid.map((row, r) => (
          <div key={r} className="grid grid-cols-7">
            {row.map((cell) => {
              const list = byDate.get(cell.iso) ?? [];
              const isToday = cell.iso === cal.today;
              const dayNum = parseIso(cell.iso)!.d;
              return (
                <div
                  key={cell.iso}
                  className={`min-h-[84px] border-b border-r border-border p-1 last:border-r-0 sm:min-h-[112px] sm:p-1.5 ${cell.inMonth ? "" : "bg-muted/30 opacity-60"}`}
                >
                  <button
                    type="button"
                    onClick={() => cal.openDay(cell.iso)}
                    aria-label={`Ouvrir le ${formatDayLong(cell.iso)} (${list.length} session${list.length !== 1 ? "s" : ""})`}
                    className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isToday ? "bg-[var(--primary)] text-[var(--brand-contrast)]" : "text-primary hover:bg-muted"}`}
                  >
                    {dayNum}
                  </button>
                  {/* ≥ sm: readable chips; phones: colour dots (tap the day to see the list) */}
                  <div className="hidden space-y-1 sm:block">
                    {list.slice(0, 3).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] hover:bg-muted"
                        style={{ borderLeft: `3px solid ${activityColor(s.activity)}` }}
                      >
                        {conflictIds.has(s.id) && <AlertTriangle size={10} className="flex-shrink-0 text-amber-500" />}
                        <span className="font-semibold text-primary">{s.startTime}</span>
                        <span className="truncate text-muted">{activityLabel(s.activity)}</span>
                      </button>
                    ))}
                    {list.length > 3 && (
                      <button type="button" onClick={() => cal.openDay(cell.iso)} className="px-1 text-[11px] font-semibold text-[var(--primary)]">
                        +{list.length - 3} autre{list.length - 3 > 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-0.5 sm:hidden">
                    {list.slice(0, 6).map((s) => (
                      <span key={s.id} className="h-2 w-2 rounded-full" style={{ background: activityColor(s.activity) }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const views: Record<CalendarView, () => React.ReactNode> = {
    day: () => renderDay(cal.anchor),
    week: renderWeek,
    month: renderMonth,
    agenda: () => renderDay(cal.anchor),
  };

  return (
    <div className="space-y-4" data-testid="planning-calendar">
      <CalendarToolbar cal={cal} />

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filtrer par coach"
          value={coachFilter}
          onChange={(e) => setCoachFilter(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
        >
          <option value="">Tous les coachs</option>
          {coachOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select
          aria-label="Filtrer par activité"
          value={activityFilter}
          onChange={(e) => setActivityFilter(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
        >
          <option value="">Toutes les activités</option>
          {activityOptions.map((a) => (
            <option key={a} value={a}>{ACTIVITY_LABELS[a] ?? a}</option>
          ))}
        </select>
        {filtersActive && (
          <button type="button" onClick={() => { setCoachFilter(""); setActivityFilter(""); }} className="rounded-xl px-3 py-2 text-sm font-medium text-[var(--primary)] hover:bg-muted">
            Réinitialiser
          </button>
        )}
        <span className="ml-auto text-xs text-muted" aria-live="polite">
          {visible.length} session{visible.length !== 1 ? "s" : ""}
          {conflictCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
              <AlertTriangle size={12} /> {conflictCount} en conflit
            </span>
          )}
        </span>
      </div>

      {/* Legend (colour is never the only cue — every card also prints the activity name) */}
      {activityOptions.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted" aria-label="Légende">
          {activityOptions.map((a) => (
            <li key={a} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: activityColor(a) }} /> {activityLabel(a)}
            </li>
          ))}
        </ul>
      )}

      <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
        {views[cal.view]()}
      </div>

      {selected && (
        <SidePanel
          s={selected}
          conflicts={selectedConflicts}
          canManage={canManage}
          timeZone={timeZone}
          cutoffMinutes={cutoffMinutes}
          now={now}
          onClose={() => setSelectedId(null)}
          onEdit={onEdit ? () => onEdit(selected) : undefined}
          onDelete={onDelete ? () => onDelete(selected) : undefined}
        />
      )}
    </div>
  );
}
