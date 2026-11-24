import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTenantOrigin } from "../tenant-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildTenantOrigin in single-address mode", () => {
  it("puts the club under /c/<slug> on the one platform host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://clubxx-lovat.vercel.app");
    expect(buildTenantOrigin({ slug: "club-a" })).toBe("https://clubxx-lovat.vercel.app/c/club-a");
  });

  it("still honours a club's own custom domain", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://clubxx-lovat.vercel.app");
    expect(buildTenantOrigin({ slug: "club-a", customDomain: "gym.example.tn" })).toBe("https://gym.example.tn");
  });

  it("keeps per-club subdomains with a real domain", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://clubx.tn");
    expect(buildTenantOrigin({ slug: "club-a" })).toBe("https://club-a.clubx.tn");
  });
});
