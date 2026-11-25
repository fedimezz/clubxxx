"use client";

import type { BookingTab } from "@/lib/booking-status";
export type { BookingTab } from "@/lib/booking-status";

interface Props {
  active: BookingTab;
  onChange: (tab: BookingTab) => void;
  counts: Record<BookingTab, number>;
}

const TABS: { key: BookingTab; label: string }[] = [
  { key: "upcoming", label: "À venir" },
  { key: "past", label: "Historique" },
  { key: "cancelled", label: "Annulées" },
];

export default function BookingTabs({ active, onChange, counts }: Props) {
  return (
    <div role="tablist" aria-label="Type de réservations" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-muted/60 p-1">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className="mx-chip flex items-center gap-2 whitespace-nowrap !px-4 !py-2 !text-sm"
        >
          {tab.label}
          <span className={`rounded-full px-1.5 py-0.5 text-xs ${active === tab.key ? "bg-black/15" : "bg-card text-muted"}`}>{counts[tab.key]}</span>
        </button>
      ))}
    </div>
  );
}
