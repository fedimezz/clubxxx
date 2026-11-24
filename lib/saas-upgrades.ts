export const SAAS_UPGRADES_DISABLED_MESSAGE =
  "Les changements de plan sont temporairement désactivés. Contactez le support ClubX.";

export function areSaasPlanUpgradesEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  const configured = env.SAAS_PLAN_UPGRADES_ENABLED?.trim().toLowerCase();
  if (configured !== undefined && configured !== "") {
    return ["true", "1", "yes", "on"].includes(configured);
  }
  return env.NODE_ENV !== "production";
}
