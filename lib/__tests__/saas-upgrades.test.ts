import { describe, expect, it } from "vitest";
import { areSaasPlanUpgradesEnabled } from "@/lib/saas-upgrades";

describe("SaaS plan upgrade availability", () => {
  it("defaults to disabled in production and enabled in development", () => {
    expect(areSaasPlanUpgradesEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(areSaasPlanUpgradesEnabled({ NODE_ENV: "development" })).toBe(true);
  });

  it("honors explicit production enablement and disablement", () => {
    expect(areSaasPlanUpgradesEnabled({ NODE_ENV: "production", SAAS_PLAN_UPGRADES_ENABLED: "true" })).toBe(true);
    expect(areSaasPlanUpgradesEnabled({ NODE_ENV: "production", SAAS_PLAN_UPGRADES_ENABLED: "false" })).toBe(false);
  });
});
