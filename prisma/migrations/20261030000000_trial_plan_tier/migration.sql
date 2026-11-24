-- Dedicated free-trial plan tier. Purely additive.
-- The TRIAL plan row itself is created idempotently by the app (lib/trial-plan.ts ensureTrialPlan,
-- called at signup) and by prisma/seed.ts: a new enum value cannot be used in the same transaction
-- that adds it, so no INSERT here.
ALTER TYPE "SaasPlanTier" ADD VALUE IF NOT EXISTS 'TRIAL';
