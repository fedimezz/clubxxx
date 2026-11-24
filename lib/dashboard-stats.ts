// lib/dashboard-stats.ts
//
// Pure helpers behind GET /api/admin/dashboard: time-range bucketing, cumulative growth,
// trend percentages, "which week / weekday is it at the club right now", subscription
// roll-ups, the merged activity feed and the club-health derivation.
//
// No Prisma, no env, no clock reads inside — everything takes `now` and the club's UTC offset
// as arguments so it is deterministic and unit-testable (see lib/__tests__/dashboard-stats.test.ts).
//
// Time zone: the app treats club wall-clock time as a fixed UTC offset (see lib/session-date.ts:
// Africa/Tunis has had no daylight-saving changes since 2005). `offsetHours` below defaults to the
// same constant. All "local" calendar math is done by shifting the instant by the offset and then
// reading UTC fields, which is exact for a fixed-offset zone and immune to the server's own TZ.

export const RANGE_KEYS = ["7d", "30d", "90d", "12m"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export const DEFAULT_RANGE: RangeKey = "30d";

/** Same fixed offset lib/session-date.ts uses for the club (Africa/Tunis, UTC+1, no DST). */
export const CLUB_UTC_OFFSET_HOURS = 1;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const WEEKDAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAY_ORDER = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
export type DayName = (typeof DAY_ORDER)[number];

export function parseRange(value: string | null | undefined): RangeKey {
  return (RANGE_KEYS as readonly string[]).includes(value ?? "") ? (value as RangeKey) : DEFAULT_RANGE;
}

// ─── Local calendar helpers ──────────────────────────────────────────────────

interface LocalParts {
  year: number;
  month: number; // 0-11
  day: number; // 1-31
  weekday: number; // 0 = Sunday
}

export function localParts(instant: Date, offsetHours = CLUB_UTC_OFFSET_HOURS): LocalParts {
  const shifted = new Date(instant.getTime() + offsetHours * HOUR_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** The instant at which the local calendar day (y, m, d) starts. Date.UTC normalizes overflow (day 0, month 12…). */
function localMidnight(year: number, month: number, day: number, offsetHours: number): Date {
  return new Date(Date.UTC(year, month, day) - offsetHours * HOUR_MS);
}

export function localDayStart(instant: Date, offsetHours = CLUB_UTC_OFFSET_HOURS): Date {
  const p = localParts(instant, offsetHours);
  return localMidnight(p.year, p.month, p.day, offsetHours);
}

/** Instant at which the club-local month containing `instant` (shifted by `monthsBack`) starts. */
export function localMonthStart(instant: Date, monthsBack = 0, offsetHours = CLUB_UTC_OFFSET_HOURS): Date {
  const p = localParts(instant, offsetHours);
  return localMidnight(p.year, p.month - monthsBack, 1, offsetHours);
}

/** Club-local weekday name for `instant` (matches the Prisma DayOfWeek enum values). */
export function localDayOfWeek(instant: Date, offsetHours = CLUB_UTC_OFFSET_HOURS): DayName {
  return DAY_ORDER[localParts(instant, offsetHours).weekday];
}

/**
 * The Monday (as a UTC-midnight calendar date, which is how WeeklyPlan.weekStart is stored)
 * of the club-local week containing `instant`.
 */
export function localWeekMonday(instant: Date, offsetHours = CLUB_UTC_OFFSET_HOURS): Date {
  const p = localParts(instant, offsetHours);
  const back = p.weekday === 0 ? 6 : p.weekday - 1;
  return new Date(Date.UTC(p.year, p.month, p.day - back));
}

// ─── Buckets ─────────────────────────────────────────────────────────────────

export interface Bucket {
  key: string;
  /** Short axis label. */
  label: string;
  /** Long label for tooltips. */
  fullLabel: string;
  /** Inclusive start instant. */
  start: Date;
  /** Exclusive end instant. */
  end: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");

function dayBucket(range: "7d" | "30d", year: number, month: number, day: number, offsetHours: number): Bucket {
  const start = localMidnight(year, month, day, offsetHours);
  const end = localMidnight(year, month, day + 1, offsetHours);
  const p = localParts(start, offsetHours);
  const full = `${WEEKDAYS_FR[p.weekday]} ${p.day} ${MONTHS_FR[p.month]}`;
  return {
    key: `${p.year}-${pad(p.month + 1)}-${pad(p.day)}`,
    label: range === "7d" ? WEEKDAYS_FR[p.weekday] : `${p.day}/${pad(p.month + 1)}`,
    fullLabel: full,
    start,
    end,
  };
}

/**
 * Contiguous, ascending buckets ending with the current one:
 *  - 7d  → 7 daily buckets
 *  - 30d → 30 daily buckets
 *  - 90d → 13 weekly buckets (91 days: whole weeks keep the bars comparable)
 *  - 12m → 12 calendar-month buckets
 */
export function buildBuckets(range: RangeKey, now: Date, offsetHours = CLUB_UTC_OFFSET_HOURS): Bucket[] {
  const today = localParts(now, offsetHours);

  if (range === "7d" || range === "30d") {
    const n = range === "7d" ? 7 : 30;
    return Array.from({ length: n }, (_, i) =>
      dayBucket(range, today.year, today.month, today.day - (n - 1 - i), offsetHours)
    );
  }

  if (range === "90d") {
    const weeks = 13;
    return Array.from({ length: weeks }, (_, i) => {
      const firstDay = today.day + 1 - (weeks - i) * 7; // last bucket ends with today
      const start = localMidnight(today.year, today.month, firstDay, offsetHours);
      const end = localMidnight(today.year, today.month, firstDay + 7, offsetHours);
      const last = new Date(end.getTime() - DAY_MS);
      const sp = localParts(start, offsetHours);
      const lp = localParts(last, offsetHours);
      return {
        key: `${sp.year}-${pad(sp.month + 1)}-${pad(sp.day)}`,
        label: `${sp.day} ${MONTHS_FR[sp.month]}`,
        fullLabel: `Du ${sp.day} ${MONTHS_FR[sp.month]} au ${lp.day} ${MONTHS_FR[lp.month]}`,
        start,
        end,
      };
    });
  }

  return Array.from({ length: 12 }, (_, i) => {
    const monthIndex = today.month - (11 - i);
    const start = localMidnight(today.year, monthIndex, 1, offsetHours);
    const end = localMidnight(today.year, monthIndex + 1, 1, offsetHours);
    const p = localParts(start, offsetHours);
    return {
      key: `${p.year}-${pad(p.month + 1)}`,
      label: MONTHS_FR[p.month],
      fullLabel: `${MONTHS_FR[p.month]} ${p.year}`,
      start,
      end,
    };
  });
}

/** Index of the bucket containing `instant`, or -1 when outside the range (binary search). */
export function bucketIndex(instant: Date, buckets: Bucket[]): number {
  const t = instant.getTime();
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < buckets[mid].start.getTime()) hi = mid - 1;
    else if (t >= buckets[mid].end.getTime()) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Number of dates falling in each bucket. Null / out-of-range dates are ignored. */
export function countByBucket(dates: Array<Date | null | undefined>, buckets: Bucket[]): number[] {
  const out = new Array<number>(buckets.length).fill(0);
  for (const d of dates) {
    if (!d) continue;
    const i = bucketIndex(d, buckets);
    if (i >= 0) out[i] += 1;
  }
  return out;
}

/** Sum of `amount` per bucket. Null / out-of-range dates are ignored. */
export function sumByBucket(items: Array<{ date: Date | null | undefined; amount: number }>, buckets: Bucket[]): number[] {
  const out = new Array<number>(buckets.length).fill(0);
  for (const it of items) {
    if (!it.date) continue;
    const i = bucketIndex(it.date, buckets);
    if (i >= 0) out[i] += it.amount;
  }
  return out;
}

/** Running total: `baseline` + the cumulative sum of `perBucket`. */
export function cumulativeSeries(baseline: number, perBucket: number[]): number[] {
  let total = baseline;
  return perBucket.map((n) => (total += n));
}

/** Percentage change current vs previous, rounded to an integer. null when there is no meaningful base. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ─── Money ───────────────────────────────────────────────────────────────────

export interface CurrencyAmount {
  currency: string;
  amount: number;
}

export const PRIMARY_CURRENCY = "TND";

/**
 * Charts plot a single currency (one axis, never mixed). TND unless the club only has money in
 * another currency, in which case that currency wins; ties/none fall back to TND.
 */
export function pickPrimaryCurrency(sums: CurrencyAmount[]): string {
  const positive = sums.filter((s) => s.amount > 0);
  if (positive.length === 0 || positive.some((s) => s.currency === PRIMARY_CURRENCY)) return PRIMARY_CURRENCY;
  return positive.reduce((best, s) => (s.amount > best.amount ? s : best)).currency;
}

export function sumCurrency(rows: CurrencyAmount[], currency: string): number {
  return rows.filter((r) => r.currency === currency).reduce((acc, r) => acc + r.amount, 0);
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export interface SubscriptionRef {
  id: string;
  userId: string;
  createdAt: Date;
}

/** A subscription is a renewal when the same member already had an earlier one. */
export function classifySubscriptions(
  recent: SubscriptionRef[],
  allOfThoseUsers: SubscriptionRef[]
): Map<string, "new" | "renewal"> {
  const byUser = new Map<string, SubscriptionRef[]>();
  for (const s of allOfThoseUsers) {
    const list = byUser.get(s.userId) ?? [];
    list.push(s);
    byUser.set(s.userId, list);
  }
  const out = new Map<string, "new" | "renewal">();
  for (const s of recent) {
    const earlier = (byUser.get(s.userId) ?? []).some(
      (o) => o.id !== s.id && (o.createdAt.getTime() < s.createdAt.getTime() ||
        (o.createdAt.getTime() === s.createdAt.getTime() && o.id < s.id))
    );
    out.set(s.id, earlier ? "renewal" : "new");
  }
  return out;
}

export interface PlanPerformance {
  planId: string;
  name: string;
  /** Subscriptions created inside the selected range. */
  sold: number;
  /** Subscriptions active right now (not limited to the range). */
  active: number;
  /** Paid revenue in the range, primary currency. Omitted for ADMIN. */
  revenue?: number;
}

export function buildPlanPerformance(input: {
  plans: Array<{ id: string; name: string }>;
  sold: Array<{ planId: string; count: number }>;
  active: Array<{ planId: string; count: number }>;
  revenueByPlan?: Map<string, number>;
}): PlanPerformance[] {
  const soldMap = new Map(input.sold.map((r) => [r.planId, r.count]));
  const activeMap = new Map(input.active.map((r) => [r.planId, r.count]));
  const rows = input.plans.map<PlanPerformance>((p) => ({
    planId: p.id,
    name: p.name,
    sold: soldMap.get(p.id) ?? 0,
    active: activeMap.get(p.id) ?? 0,
    ...(input.revenueByPlan ? { revenue: input.revenueByPlan.get(p.id) ?? 0 } : {}),
  }));
  // Plans with no activity at all are noise on a performance chart.
  return rows
    .filter((r) => r.sold > 0 || r.active > 0 || (r.revenue ?? 0) > 0)
    .sort((a, b) => b.sold - a.sold || b.active - a.active || a.name.localeCompare(b.name));
}

// ─── Activity feed ───────────────────────────────────────────────────────────

export type ActivityKind = "registration" | "booking" | "subscription" | "renewal" | "payment" | "notification";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  subtitle: string;
  /** ISO timestamp. */
  at: string;
}

export function mergeActivity(items: ActivityItem[], limit = 10): ActivityItem[] {
  return [...items]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? -1 : 1))
    .slice(0, limit);
}

export const ACTIVITY_LABELS_FR: Record<string, string> = {
  BODYBUILDING: "Musculation", FITNESS: "Fitness", CARDIO: "Cardio", CROSSFIT: "CrossFit",
  YOGA: "Yoga", PILATES: "Pilates", BOXE: "Boxe", MMA: "MMA", AQUAGYM: "Aquagym",
  PADEL: "Padel", ZUMBA: "Zumba", SPINNING: "Spinning",
};

export const DAY_LABELS_FR: Record<string, string> = {
  MONDAY: "lun.", TUESDAY: "mar.", WEDNESDAY: "mer.", THURSDAY: "jeu.",
  FRIDAY: "ven.", SATURDAY: "sam.", SUNDAY: "dim.",
};

// ─── Club health ─────────────────────────────────────────────────────────────

export type HealthStatus = "ok" | "warn" | "error";
export type HealthKey = "website" | "mobile" | "payments" | "email" | "domain";

export interface HealthItem {
  key: HealthKey;
  label: string;
  status: HealthStatus;
  detail: string;
}

export interface HealthInput {
  slug: string;
  clubStatus: string;
  websiteSetupCompleted: boolean;
  activeDevices: number;
  apkAvailable: boolean;
  paymentsConfigured: boolean;
  emailConfigured: boolean;
  customDomain: string | null;
  domainRequestStatus: string | null;
}

export function deriveHealth(i: HealthInput): { overall: HealthStatus; items: HealthItem[] } {
  const website: HealthItem =
    i.clubStatus === "SUSPENDED" || i.clubStatus === "CANCELLED"
      ? { key: "website", label: "Site web", status: "error", detail: "Club suspendu" }
      : !i.websiteSetupCompleted
        ? { key: "website", label: "Site web", status: "warn", detail: "À finaliser" }
        : { key: "website", label: "Site web", status: "ok", detail: "En ligne" };

  const mobile: HealthItem =
    i.activeDevices > 0
      ? { key: "mobile", label: "Application mobile", status: "ok", detail: `${i.activeDevices} appareil${i.activeDevices > 1 ? "s" : ""}` }
      : i.apkAvailable
        ? { key: "mobile", label: "Application mobile", status: "ok", detail: "Disponible" }
        : { key: "mobile", label: "Application mobile", status: "warn", detail: "Aucun appareil connecté" };

  const payments: HealthItem = i.paymentsConfigured
    ? { key: "payments", label: "Paiements", status: "ok", detail: "Activés" }
    : { key: "payments", label: "Paiements", status: "warn", detail: "Non configurés" };

  const email: HealthItem = i.emailConfigured
    ? { key: "email", label: "Notifications e-mail", status: "ok", detail: "Activées" }
    : { key: "email", label: "Notifications e-mail", status: "warn", detail: "Non configurées" };

  let domain: HealthItem;
  const req = i.domainRequestStatus;
  if (i.customDomain) domain = { key: "domain", label: "Domaine", status: "ok", detail: i.customDomain };
  else if (req === "ACTIVE") domain = { key: "domain", label: "Domaine", status: "ok", detail: "Domaine actif" };
  else if (req === "PENDING" || req === "APPROVED" || req === "CONFIGURING")
    domain = { key: "domain", label: "Domaine", status: "warn", detail: "Configuration en cours" };
  else if (req === "REJECTED") domain = { key: "domain", label: "Domaine", status: "warn", detail: "Demande refusée" };
  else domain = { key: "domain", label: "Domaine", status: "ok", detail: i.slug ? `Sous-domaine ${i.slug}` : "Sous-domaine actif" };

  const items = [website, mobile, payments, email, domain];
  const overall: HealthStatus = items.some((x) => x.status === "error") ? "error" : items.some((x) => x.status === "warn") ? "warn" : "ok";
  return { overall, items };
}

// ─── Response shape (shared by the route and the UI) ─────────────────────────

export interface DashboardBucket {
  key: string;
  label: string;
  fullLabel: string;
}

export interface DashboardPayload {
  range: RangeKey;
  generatedAt: string;
  role: "OWNER" | "ADMIN";
  club: {
    name: string;
    slug: string;
    /** Owner only. */
    status?: string;
    trialEndsAt?: string | null;
  };
  stats: {
    activeMembers: number;
    totalMembers: number;
    membersWithActiveSubscription: number;
    todayReservations: number;
    todaySessions: number;
    todayCapacity: number;
    pendingSubscriptions: number;
    newMembersThisMonth: number;
    /** New members this month as a % of members registered before the month. null = no base. */
    newMembersGrowthPct: number | null;
    expiredMemberships: number;
    /** Owner only. */
    revenueMonth?: {
      currency: string;
      amount: number;
      /** vs. the previous calendar month. null = no base. */
      trendPct: number | null;
      /** Money received in other currencies this month (never summed into `amount`). */
      otherCurrencies: CurrencyAmount[];
    };
  };
  series: {
    buckets: DashboardBucket[];
    /** Cumulative registered members at the end of each bucket. */
    members: number[];
    newMembers: number[];
    reservations: number[];
    cancellations: number[];
    /** Owner only; primary currency. */
    revenue?: number[];
    revenueCurrency?: string;
  };
  subscriptionPerformance: PlanPerformance[];
  activity: ActivityItem[];
  notifications: { unread: number };
  health: { overall: HealthStatus; items: HealthItem[] };
  /** Owner only (same shape as the legacy /api/admin/stats widget). */
  saasPlan?: {
    tier: string;
    name: string;
    priceMonthly: number;
    limits: Record<string, number>;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    usage: { members: number; coaches: number; admins: number };
  } | null;
}
