// POST /api/billing/manual-request — logged-in OWNER asks to pay the SaaS plan
// by bank transfer / D17 / Flouci / cash (for countries Stripe cannot serve).
// GET returns the club's latest requests.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { verifyOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatZodError } from "@/lib/validation";
import { createManualPaymentRequest, manualPaymentInstructions, manualRequestSchema } from "@/lib/manual-payment";
import { getClubAccessState } from "@/lib/tenant";
import { findPublicPlan } from "@/lib/saas-plan-access";
import { areSaasPlanUpgradesEnabled, SAAS_UPGRADES_DISABLED_MESSAGE } from "@/lib/saas-upgrades";

export async function GET(request: NextRequest) {
  const auth = await requireOwner(request, { allowLockedOwner: true });
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
  const clubId = auth.user.clubId;
  if (!clubId) return NextResponse.json({ error: "Aucun club associé" }, { status: 400 });
  const requests = await prisma.manualPaymentRequest.findMany({
    where: { clubId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, planId: true, billingPeriod: true, method: true, amount: true, currency: true, status: true, reviewNote: true, createdAt: true, reviewedAt: true },
  });
  return NextResponse.json({ requests, instructions: manualPaymentInstructions() });
}

export async function POST(request: NextRequest) {
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;
  const auth = await requireOwner(request, { allowLockedOwner: true });
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
  const clubId = auth.user.clubId;
  if (!clubId) return NextResponse.json({ error: "Aucun club associé" }, { status: 400 });
  if (!areSaasPlanUpgradesEnabled()) {
    return NextResponse.json({ error: SAAS_UPGRADES_DISABLED_MESSAGE, code: "SAAS_PLAN_UPGRADES_DISABLED" }, { status: 503 });
  }

  const limit = await checkRateLimit(`manual-request:${clubId}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Trop de demandes, réessayez plus tard." }, { status: 429 });

  const parsed = manualRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });

  const accessState = await getClubAccessState(clubId);
  if (
    (accessState === "TRIAL_EXPIRED" || accessState === "SUSPENDED") &&
    !(await findPublicPlan(parsed.data.planId))
  ) {
    return NextResponse.json({ error: "Ce plan n'est plus disponible." }, { status: 404 });
  }

  const result = await createManualPaymentRequest({ clubId, userId: auth.user.id, ...parsed.data });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ request: result.request, duplicate: result.duplicate, instructions: manualPaymentInstructions() });
}
