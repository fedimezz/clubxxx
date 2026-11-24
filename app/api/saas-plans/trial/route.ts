// GET /api/saas-plans/trial — the dedicated free-trial plan (name + limits + length), for the
// onboarding wizard. Public and unauthenticated; exposes only what the pricing UI needs.
import { NextResponse } from "next/server";
import { ensureTrialPlan, TRIAL_PLAN_LIMITS, TRIAL_PLAN_NAME } from "@/lib/trial-plan";
import { defaultTrialDays } from "@/lib/trial";

export async function GET() {
  const trialDays = defaultTrialDays();
  try {
    const plan = await ensureTrialPlan();
    return NextResponse.json(
      { plan: { id: plan.id, tier: plan.tier, name: plan.name, limits: plan.limits }, trialDays },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (error) {
    console.error("Trial plan GET error:", error);
    // Never block the wizard on this read: show the defaults (the real limits are applied server-side at signup).
    return NextResponse.json({ plan: { id: "", tier: "TRIAL", name: TRIAL_PLAN_NAME, limits: TRIAL_PLAN_LIMITS }, trialDays });
  }
}
