"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Loader2, AlertCircle, Clock, MapPin, Users,
  Check, Undo2, ChevronDown, Dumbbell, TrendingUp, BarChart2, CalendarCheck, CalendarX,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import {
  formatDayLong, normalizeApiDate, sessionDateIso, sessionStartInstant, timeToMinutes, todayIso, clockTime,
  type IsoDate,
} from "@/lib/calendar-nav";

const DAY_LABEL: Record<string, string> = {
  MONDAY: "Lundi", TUESDAY: "Mardi", WEDNESDAY: "Mercredi", THURSDAY: "Jeudi",
  FRIDAY: "Vendredi", SATURDAY: "Samedi", SUNDAY: "Dimanche",
};
const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

const ACTIVITY_LABELS: Record<string, string> = {
  BODYBUILDING: "Musculation", FITNESS: "Fitness", CARDIO: "Cardio",
  CROSSFIT: "CrossFit", YOGA: "Yoga", PILATES: "Pilates",
  BOXE: "Boxe", MMA: "MMA", AQUAGYM: "Aquagym",
  PADEL: "Padel", ZUMBA: "Zumba", SPINNING: "Spinning",
};

interface CoachSession {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  activity: string;
  location: string;
  capacity: number;
  currentBookings: number;
  /** Monday of the session's plan (additive API field). */
  weekStart?: string;
}

type SessionPhase = "upcoming" | "live" | "done";

interface RosterMember {
  userId: string;
  name: string;
  avatar: string | null;
  checkedIn: boolean;
}

interface CoachStats {
  totalSessions: number;
  totalBookings: number;
  totalAttendances: number;
  fillRate: number;
}

function StatsBar({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-[var(--primary)]" />
      </div>
      <div>
        <p className="text-2xl font-bold text-primary">{value}</p>
        <p className="text-xs text-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function CoachDashboardPage() {
  const [coachName, setCoachName] = useState("");
  const [timeZone, setTimeZone] = useState<string | undefined>(undefined);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [coachStats, setCoachStats] = useState<CoachStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [roster, setRoster] = useState<Record<string, RosterMember[]>>({});
  const [loadingRoster, setLoadingRoster] = useState<string | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessRes, statsRes] = await Promise.all([
        fetch("/api/dashboard/coach/sessions", { credentials: "include" }),
        fetch("/api/dashboard/coach/stats", { credentials: "include" }),
      ]);
      const [sessData, statsData] = await Promise.all([sessRes.json(), statsRes.json()]);

      if (sessRes.ok) {
        setCoachName(sessData.coach?.name ?? "");
        if (typeof sessData.timeZone === "string") setTimeZone(sessData.timeZone);
        setSessions(sessData.sessions ?? []);
      } else {
        setError(sessData.error || "Erreur de chargement des séances");
      }

      if (statsRes.ok) setCoachStats(statsData);
    } catch {
      setError("Erreur serveur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Keep "En cours / Terminée" fresh without reloading.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const toggleExpand = async (sessionId: string) => {
    if (expanded === sessionId) { setExpanded(null); return; }
    setExpanded(sessionId);
    if (!roster[sessionId]) {
      setLoadingRoster(sessionId);
      try {
        const res = await fetch(`/api/dashboard/coach/sessions/${sessionId}/roster`, { credentials: "include" });
        const data = await res.json();
        if (res.ok) setRoster((r) => ({ ...r, [sessionId]: data.roster ?? [] }));
      } catch { /* roster stays empty */ } finally {
        setLoadingRoster(null);
      }
    }
  };

  const toggleCheckIn = async (sessionId: string, userId: string, currentlyCheckedIn: boolean) => {
    setTogglingUserId(userId);
    try {
      const res = await fetch("/api/dashboard/coach/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId, userId, undo: currentlyCheckedIn }),
      });
      if (res.ok) {
        setRoster((r) => ({
          ...r,
          [sessionId]: r[sessionId].map((m) =>
            m.userId === userId ? { ...m, checkedIn: !currentlyCheckedIn } : m
          ),
        }));
      }
    } catch { /* no-op */ } finally {
      setTogglingUserId(null);
    }
  };

  const today: IsoDate = todayIso(timeZone, nowTick);

  const dated = sessions
    .map((s) => {
      const monday = s.weekStart ? normalizeApiDate(s.weekStart) : null;
      const date = monday ? sessionDateIso(monday, s.day) : null;
      let phase: SessionPhase = "upcoming";
      if (date) {
        const start = sessionStartInstant(date, s.startTime, timeZone);
        const end = sessionStartInstant(date, s.endTime, timeZone);
        if (end && nowTick >= end.getTime()) phase = "done";
        else if (start && nowTick >= start.getTime()) phase = "live";
      }
      return { ...s, date, phase };
    })
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (timeToMinutes(a.startTime) ?? 0) - (timeToMinutes(b.startTime) ?? 0));

  const todaySessions = dated.filter((s) => s.date === today);
  const otherSessions = dated.filter((s) => s.date !== today);
  const sessionsByDay = DAY_ORDER.map((day) => ({
    day,
    sessions: otherSessions.filter((s) => s.day === day),
  })).filter((d) => d.sessions.length > 0);
  const nextSession = dated.find((s) => s.phase !== "done");

  const phaseBadge = (phase: SessionPhase) =>
    phase === "live"
      ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">En cours</span>
      : phase === "done"
        ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted">Terminée</span>
        : null;

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Chargement">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg p-4" role="alert">
        <AlertCircle size={18} /> {error}
        <button onClick={fetchAll} className="ml-auto rounded-lg border border-red-500/30 px-3 py-1 text-xs font-semibold hover:bg-red-500/10">Réessayer</button>
      </div>
    );
  }

  const renderSession = (s: (typeof dated)[number]) => {
    const fillPct = s.capacity > 0 ? Math.round((s.currentBookings / s.capacity) * 100) : 0;
    const members = roster[s.id];
    const present = members ? members.filter((m) => m.checkedIn).length : null;
    return (
      <div key={s.id} className={`bg-card border rounded-2xl overflow-hidden ${s.phase === "live" ? "border-emerald-500/50 ring-1 ring-emerald-500/20" : "border-border"}`}>
        <button
          onClick={() => toggleExpand(s.id)}
          aria-expanded={expanded === s.id}
          className="w-full flex items-center gap-4 p-4 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-primary">{ACTIVITY_LABELS[s.activity] ?? s.activity}</p>
              {phaseBadge(s.phase)}
              {present !== null && members && (
                <span className="text-[11px] font-semibold text-muted">{present}/{members.length} présents</span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap text-xs text-muted mt-1">
              <span className="flex items-center gap-1"><Clock size={12} />{s.startTime}–{s.endTime}</span>
              <span className="flex items-center gap-1"><MapPin size={12} />{s.location}</span>
              <span className="flex items-center gap-1"><Users size={12} />{s.currentBookings}/{s.capacity}</span>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
            fillPct >= 90 ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400" :
            fillPct >= 60 ? "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400" :
            "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
          }`}>
            {fillPct}%
          </span>
          <ChevronDown size={18} className={`text-muted transition-transform ${expanded === s.id ? "rotate-180" : ""}`} />
        </button>

        {expanded === s.id && (
          <div className="border-t border-border p-4">
            {loadingRoster === s.id ? (
              <div className="flex justify-center py-6">
                <Loader2 size={20} className="animate-spin text-[var(--primary)]" />
              </div>
            ) : !members || members.length === 0 ? (
              <p className="text-sm text-muted text-center py-2">Aucun membre inscrit pour l&apos;instant.</p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.userId} className="flex items-center gap-3">
                    {m.avatar ? (
                      <Image src={m.avatar} alt={m.name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-xs font-bold text-[var(--primary)]">
                        {m.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <span className="flex-1 text-sm text-primary truncate">{m.name}</span>
                    <button
                      onClick={() => toggleCheckIn(s.id, m.userId, m.checkedIn)}
                      disabled={togglingUserId === m.userId}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition disabled:opacity-50 ${
                        m.checkedIn
                          ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                          : "border border-border text-muted hover:bg-neutral-50 dark:hover:bg-neutral-900"
                      }`}
                    >
                      {m.checkedIn ? <Undo2 size={13} /> : <Check size={13} />}
                      {m.checkedIn ? "Annuler" : "Présent"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-primary">
          {coachName ? `Bonjour, ${coachName}` : "Mon planning"}
        </h1>
        <p className="text-muted mt-1">Vos séances de la semaine et le pointage des présences.</p>
      </div>

      {/* Stats overview */}
      {coachStats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsBar label="Séances assignées" value={coachStats.totalSessions} icon={Dumbbell} />
          <StatsBar label="Réservations totales" value={coachStats.totalBookings} icon={Users} />
          <StatsBar label="Présences validées" value={coachStats.totalAttendances} icon={Check} />
          <StatsBar label="Taux de remplissage" value={`${coachStats.fillRate}%`} icon={BarChart2} />
        </div>
      )}

      {/* Next session */}
      {nextSession && nextSession.date && (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 p-4">
          <CalendarCheck size={20} className="text-[var(--primary)] shrink-0" />
          <p className="text-sm text-primary">
            <span className="font-semibold">{nextSession.phase === "live" ? "En cours : " : "Prochaine séance : "}</span>
            {ACTIVITY_LABELS[nextSession.activity] ?? nextSession.activity} ·{" "}
            <span className="capitalize">{nextSession.date === today ? "aujourd’hui" : formatDayLong(nextSession.date)}</span> à {nextSession.startTime}
            {timeZone ? <span className="text-muted"> ({clockTime(sessionStartInstant(nextSession.date, nextSession.startTime, timeZone) ?? 0, timeZone)} heure du club)</span> : null}
          </p>
        </div>
      )}

      {/* Today */}
      <div>
        <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
          <CalendarCheck size={18} className="text-[var(--primary)]" />
          Aujourd&apos;hui
        </h2>
        {todaySessions.length === 0 ? (
          <EmptyState icon={CalendarX} title="Pas de séance aujourd’hui" description="Profitez-en : vos prochaines séances sont listées ci-dessous." />
        ) : (
          <div className="space-y-2">{todaySessions.map(renderSession)}</div>
        )}
      </div>

      {/* Rest of the week */}
      <div>
        <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
          <TrendingUp size={18} className="text-[var(--primary)]" />
          {todaySessions.length > 0 ? "Autres jours de la semaine" : "Planning cette semaine"}
        </h2>

        {sessions.length === 0 ? (
          <EmptyState icon={CalendarX} title="Aucune séance assignée" description="Aucune séance ne vous est assignée cette semaine." />
        ) : sessionsByDay.length === 0 ? (
          <p className="text-sm text-muted">Aucune autre séance cette semaine.</p>
        ) : (
          <div className="space-y-6">
            {sessionsByDay.map(({ day, sessions: daySessions }) => (
              <div key={day}>
                <h3 className="text-sm font-bold text-muted uppercase tracking-widest mb-2">
                  {DAY_LABEL[day]}
                  {daySessions[0].date && <span className="ml-2 normal-case font-medium">{formatDayLong(daySessions[0].date).replace(/^\S+\s/, "")}</span>}
                </h3>
                <div className="space-y-2">{daySessions.map(renderSession)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
