"use client";

import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { isIsoDate, type CalendarView } from "@/lib/calendar-nav";
import type { CalendarState } from "./useCalendarState";

const VIEW_LABELS: Record<CalendarView, string> = { day: "Jour", week: "Semaine", month: "Mois", agenda: "À venir" };
const UNIT: Record<CalendarView, string> = { day: "jour", week: "semaine", month: "mois", agenda: "période" };

/**
 * Prev / Next / Today / date picker / view switch. The buttons are never disabled or unmounted while
 * data is loading — navigation is instant and the data catches up.
 */
export default function CalendarToolbar({ cal, right }: { cal: CalendarState; right?: React.ReactNode }) {
  const unit = UNIT[cal.view];
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" data-testid="calendar-toolbar">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-xl border border-border bg-card">
          <button
            type="button"
            onClick={cal.prev}
            aria-label={`${unit.charAt(0).toUpperCase()}${unit.slice(1)} précédent${unit === "semaine" ? "e" : ""}`}
            className="rounded-l-xl p-2.5 text-muted transition-colors hover:bg-muted hover:text-primary"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={cal.goToday}
            aria-pressed={cal.isCurrent}
            className={`border-x border-border px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-muted ${
              cal.isCurrent ? "text-[var(--primary)]" : "text-primary"
            }`}
          >
            Aujourd&apos;hui
          </button>
          <button
            type="button"
            onClick={cal.next}
            aria-label={`${unit.charAt(0).toUpperCase()}${unit.slice(1)} suivant${unit === "semaine" ? "e" : ""}`}
            className="rounded-r-xl p-2.5 text-muted transition-colors hover:bg-muted hover:text-primary"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <h2 className="min-w-[10rem] text-base font-bold capitalize text-primary sm:text-lg" aria-live="polite">
          {cal.label}
        </h2>

        <label className="relative inline-flex cursor-pointer items-center" title="Aller à une date">
          <span className="sr-only">Choisir une date</span>
          <CalendarDays size={16} className="pointer-events-none absolute left-2.5 text-muted" />
          <input
            type="date"
            value={cal.anchor}
            onChange={(e) => isIsoDate(e.target.value) && cal.setAnchor(e.target.value)}
            className="rounded-xl border border-border bg-card py-2 pl-8 pr-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Affichage" className="inline-flex rounded-xl border border-border bg-card p-1">
          {cal.views.map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={cal.view === v}
              onClick={() => cal.setView(v)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                cal.view === v ? "bg-[var(--primary)] text-[var(--brand-contrast)]" : "text-muted hover:text-primary"
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        {right}
      </div>
    </div>
  );
}
