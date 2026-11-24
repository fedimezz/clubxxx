// Which SaaS plans a customer may pick. One definition, used by every route that accepts a
// planId from a client, so "Starter is no longer offered" cannot be bypassed by posting an id.
//
//  - NEW customers (onboarding, public catalogue): active AND public only.
//  - EXISTING clubs (checkout / reactivation / manual payment): active AND (public OR the plan
//    the club is already on), so a club on a withdrawn plan can still pay to keep it.
//  - SUPER_ADMIN assignment (/api/platform/*) is deliberately not restricted here.
import prisma from "@/lib/prisma";

// The dedicated trial plan (tier TRIAL) is excluded here even if someone flips isPublic on it: it is
// assigned automatically to free-trial signups and can never be chosen or bought.
export const PUBLIC_PLAN_WHERE = { isActive: true, isPublic: true, tier: { not: "TRIAL" } } as const;

export function findPublicPlan(planId: string) {
  return prisma.saasPlan.findFirst({ where: { id: planId, ...PUBLIC_PLAN_WHERE } });
}

export function findPlanForClub(planId: string, currentPlanId?: string | null) {
  return prisma.saasPlan.findFirst({
    where: {
      id: planId,
      isActive: true,
      // A club that is on the trial plan must not be able to "buy" it (price 0) via checkout,
      // reactivation or a manual-payment request: it has to pick a real paid plan.
      tier: { not: "TRIAL" },
      OR: [{ isPublic: true }, ...(currentPlanId ? [{ id: currentPlanId }] : [])],
    },
  });
}
