-- Club timezone + reservation cutoff. Purely additive: two columns with defaults, no data rewritten.
-- Existing clubs get Africa/Tunis (the timezone the app already assumed) and the 20-minute default policy.
ALTER TABLE "gym_settings" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Africa/Tunis';
ALTER TABLE "gym_settings" ADD COLUMN IF NOT EXISTS "reservationCutoffMinutes" INTEGER NOT NULL DEFAULT 20;
