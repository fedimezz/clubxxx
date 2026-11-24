-- Removes the theme / 3D-model lock: owners can change theme, 3D model and site content freely.
-- Non-destructive: the design_change_requests table and its enum are kept (history stays readable).
-- Only the two blocking triggers are dropped, then existing locks are cleared.

DROP TRIGGER IF EXISTS "gym_settings_design_lock" ON "gym_settings";
DROP TRIGGER IF EXISTS "club_hero_models_design_lock" ON "club_hero_models";

UPDATE "gym_settings" SET "designLockedAt" = NULL WHERE "designLockedAt" IS NOT NULL;
UPDATE "gym_settings" SET "websiteCustomizationLocked" = false WHERE "websiteCustomizationLocked" = true;
