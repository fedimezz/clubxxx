// The dedicated 14-day trial plan (SaasPlanTier.TRIAL).
//
// A free-trial signup no longer picks Starter/Pro/Business and uses it for free: the club is put on
// THIS limited plan. When the trial ends the club is suspended (lib/trial.ts) and the owner chooses a
// real paid plan on /reactivate. The row is never public (not in the onboarding / pricing catalogue)
// and can never be bought (lib/saas-plan-access.ts excludes it from every checkout path).
//
// Limits live in SaasPlan.limits like every other plan, so SUPER_ADMIN can tune them in
// /platform/plans. The values below are only the defaults used to create the row the first time.
import prisma from "@/lib/prisma";

export const TRIAL_PLAN_NAME = "Essai gratuit";

export const TRIAL_PLAN_LIMITS = {
  // maxAdmins counts the OWNER too (see lib/plan-limits.ts countAdmins): 2 = owner + 1 admin.
  maxMembers: 30,
  maxCoaches: 2,
  maxAdmins: 2,
  storageGB: 1,
  maxBookingsPerMonth: 100,
  maxCustomPages: 1,
  customDomain: false,
  advancedAnalytics: false,
  revenueAnalytics: false,
  apiAccess: false,
  whiteLabel: false,
  customHeroModel: false,
} as const;

const TRIAL_PLAN_SELECT = {
  id: true,
  tier: true,
  name: true,
  priceMonthly: true,
  priceYearly: true,
  currency: true,
  limits: true,
} as const;

/**
 * Returns the TRIAL plan row, creating it the first time (idempotent, race-safe: tier is unique,
 * so two signups at once cannot create two rows). An existing row is NEVER overwritten, so limits
 * edited by SUPER_ADMIN survive.
 */
export async function ensureTrialPlan() {
  return prisma.saasPlan.upsert({
    where: { tier: "TRIAL" },
    update: {},
    create: {
      tier: "TRIAL",
      name: TRIAL_PLAN_NAME,
      priceMonthly: 0,
      priceYearly: null,
      currency: "USD",
      limits: TRIAL_PLAN_LIMITS,
      isActive: true,
      isPublic: false,
    },
    select: TRIAL_PLAN_SELECT,
  });
}
