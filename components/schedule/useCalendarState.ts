"use client";

// Navigation state for every calendar (admin planning, member schedule, coach).
//
// Why this exists — the old week navigation broke because (1) month "prev/next" used Date#setMonth
// (31 Mar − 1 month = 3 Mar, the same month, so the button seemed dead), (2) the page replaced itself
// with a skeleton while loading, unmounting the buttons mid-click, (3) late responses of an earlier
// week overwrote the current one. Here every move is a pure calendar-date computation applied through a
// functional state update, so any number of fast clicks lands exactly N periods away, whatever the
// month, year, DST or browser timezone.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CALENDAR_VIEWS, buildCalendarSearch, parseCalendarSearch, parseView, periodLabel, rangeForView, shiftAnchor,
  todayIso, viewContains, type CalendarView, type IsoDate,
} from "@/lib/calendar-nav";

interface Options {
  /** localStorage key to remember the last used view (per viewer, best effort). */
  storageKey: string;
  /** Club IANA timezone (defines "today"). Falls back to the default club zone. */
  timeZone?: string;
  defaultView?: CalendarView;
  views?: readonly CalendarView[];
}

function readStoredView(key: string): CalendarView | null {
  try {
    return parseView(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function useCalendarState({ storageKey, timeZone, defaultView = "week", views = CALENDAR_VIEWS }: Options) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ view: CalendarView; anchor: IsoDate }>(() => {
    const fromUrl = typeof window === "undefined" ? { view: null, date: null } : parseCalendarSearch(window.location.search);
    const stored = typeof window === "undefined" ? null : readStoredView(storageKey);
    const wanted = fromUrl.view ?? stored ?? defaultView;
    return { view: views.includes(wanted) ? wanted : defaultView, anchor: fromUrl.date ?? todayIso(timeZone) };
  });

  // "Today" must roll over at the club's midnight even if the tab stays open: re-evaluate every minute.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is the deliberate re-evaluation trigger
  const today = useMemo<IsoDate>(() => todayIso(timeZone), [timeZone, tick]);

  // Reflect the state in the URL (shareable / reload-safe) and remember the view.
  useEffect(() => {
    try {
      const search = buildCalendarSearch(window.location.search, state.view, state.anchor);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    } catch {
      /* non-browser / sandboxed iframe: navigation still works, only the URL is not updated */
    }
    try {
      window.localStorage.setItem(storageKey, state.view);
    } catch {
      /* storage unavailable */
    }
  }, [state, storageKey]);

  const prev = useCallback(() => setState((s) => ({ ...s, anchor: shiftAnchor(s.view, s.anchor, -1) })), []);
  const next = useCallback(() => setState((s) => ({ ...s, anchor: shiftAnchor(s.view, s.anchor, 1) })), []);
  const goToday = useCallback(() => setState((s) => ({ ...s, anchor: todayIso(timeZone) })), [timeZone]);
  const setAnchor = useCallback((anchor: IsoDate) => setState((s) => ({ ...s, anchor })), []);
  /** Changing the view keeps the date the person was looking at. */
  const setView = useCallback((view: CalendarView) => setState((s) => ({ ...s, view })), []);
  const openDay = useCallback((anchor: IsoDate) => setState({ view: "day", anchor }), []);

  const range = useMemo(() => rangeForView(state.view, state.anchor), [state]);
  const label = useMemo(() => periodLabel(state.view, state.anchor), [state]);
  const isCurrent = useMemo(() => viewContains(state.view, state.anchor, today), [state, today]);

  return { ...state, today, range, label, isCurrent, views, prev, next, goToday, setAnchor, setView, openDay };
}

export type CalendarState = ReturnType<typeof useCalendarState>;
