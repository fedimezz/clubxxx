// Shared labels + colours for sessions (admin calendar, member schedule, coach dashboard).
export const ACTIVITY_LABELS: Record<string, string> = {
  BODYBUILDING: "Musculation", FITNESS: "Fitness", CARDIO: "Cardio", CROSSFIT: "CrossFit", YOGA: "Yoga",
  PILATES: "Pilates", BOXE: "Boxe", MMA: "MMA", AQUAGYM: "Aquagym", PADEL: "Padel", ZUMBA: "Zumba", SPINNING: "Spinning",
};

// Colour is never the only signal (the label is always printed too).
export const ACTIVITY_HEX: Record<string, string> = {
  BODYBUILDING: "#f97316", FITNESS: "#3b82f6", CARDIO: "#ef4444", CROSSFIT: "#f59e0b", YOGA: "#10b981",
  PILATES: "#14b8a6", BOXE: "#f43f5e", MMA: "#be123c", AQUAGYM: "#06b6d4", PADEL: "#84cc16", ZUMBA: "#ec4899", SPINNING: "#8b5cf6",
};

export const activityLabel = (a: string) => ACTIVITY_LABELS[a] ?? a;
export const activityColor = (a: string) => ACTIVITY_HEX[a] ?? "#64748b";

export function fillRatio(booked: number, capacity: number): number {
  return capacity > 0 ? Math.min(booked / capacity, 1) : 1;
}

/** Tailwind classes for a capacity bar / text depending on how full the session is. */
export function fillTone(ratio: number): { bar: string; text: string; label: string } {
  if (ratio >= 1) return { bar: "bg-red-500", text: "text-red-500", label: "Complet" };
  if (ratio >= 0.8) return { bar: "bg-amber-500", text: "text-amber-500", label: "Presque complet" };
  return { bar: "bg-emerald-500", text: "text-emerald-500", label: "Disponible" };
}
