import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const TENANT = { id: "club-1", slug: "club-a", name: "Club A", status: "ACTIVE" };
const resolveClubBySlugMock = vi.fn();
const resolveTenantFromRequestMock = vi.fn();
vi.mock("@/lib/tenant", () => ({
  getClubAccessState: vi.fn().mockResolvedValue("ACTIVE"),
  resolveClubBySlug: (...args: unknown[]) => resolveClubBySlugMock(...args),
  resolveTenantFromRequest: (...args: unknown[]) => resolveTenantFromRequestMock(...args),
}));
vi.mock("@/lib/auth", () => ({ getAuthenticatedAccount: vi.fn().mockResolvedValue(null) }));

const HOST = "clubxx-lovat.vercel.app";

async function run(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  process.env.JWT_SECRET = "proxy-test-secret-with-at-least-32-chars";
  process.env.APP_URL = `https://${HOST}`;
  process.env.NEXT_PUBLIC_APP_URL = `https://${HOST}`;
  vi.resetModules();
  const { proxy } = await import("@/proxy");
  return proxy(new NextRequest(`https://${HOST}${path}`, {
    method: init.method ?? "GET",
    headers: { host: HOST, origin: `https://${HOST}`, ...(init.headers ?? {}) },
  }));
}

const forwardedSlug = (r: Response) => r.headers.get("x-middleware-request-x-club-slug");

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  resolveClubBySlugMock.mockImplementation(async (slug: string) => (slug === "club-a" ? TENANT : null));
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("proxy single-address mode (*.vercel.app)", () => {
  it("/c/<slug>/page remembers the club in a cookie and redirects to the plain page", async () => {
    const res = await run("/c/club-a/coaches?x=1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`https://${HOST}/coaches?x=1`);
    expect(res.headers.get("set-cookie")).toMatch(/club_slug=club-a/);
  });

  it("an unknown club goes back to the platform landing page and clears the cookie", async () => {
    const res = await run("/c/nope/coaches");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`https://${HOST}/`);
    expect(res.headers.get("set-cookie")).toMatch(/club_slug=;/);
  });

  it("/c alone leaves the club", async () => {
    const res = await run("/c");
    expect(res.headers.get("location")).toBe(`https://${HOST}/`);
    expect(res.headers.get("set-cookie")).toMatch(/club_slug=;/);
  });

  it("serves /c/<slug>/api/... as the real API path for that club (mobile app base URL)", async () => {
    const res = await run("/c/club-a/api/settings/public");
    expect(res.headers.get("x-middleware-rewrite")).toBe(`https://${HOST}/api/settings/public`);
    expect(forwardedSlug(res)).toBe("club-a");
  });

  it("the /c prefix does not bypass the CSRF origin check", async () => {
    const res = await run("/c/club-a/api/bookings", { method: "POST", headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("the /c prefix does not bypass authentication on protected APIs", async () => {
    const res = await run("/c/club-a/api/admin/members");
    expect(res.status).toBe(401);
  });

  it("the club cookie selects the club for ordinary pages", async () => {
    const res = await run("/", { headers: { cookie: "club_slug=club-a" } });
    expect(forwardedSlug(res)).toBe("club-a");
  });

  it("no cookie = the platform landing page (no club forwarded)", async () => {
    const res = await run("/");
    expect(forwardedSlug(res)).toBeNull();
  });

  it("platform-only paths ignore the club cookie", async () => {
    for (const path of ["/platform/login", "/onboarding", "/api/onboarding/check-slug?slug=abc"]) {
      const res = await run(path, { headers: { cookie: "club_slug=club-a" } });
      expect(forwardedSlug(res)).toBeNull();
    }
  });

  it("a client-supplied x-club-slug header is never trusted in production", async () => {
    const res = await run("/api/settings/public", { headers: { "x-club-slug": "club-a" } });
    expect(forwardedSlug(res)).toBeNull();
  });

  it("a garbage cookie value is ignored", async () => {
    const res = await run("/", { headers: { cookie: "club_slug=../../etc" } });
    expect(forwardedSlug(res)).toBeNull();
  });
});

describe("proxy with single-address mode off (custom domain / wildcard DNS)", () => {
  it("leaves /c/... alone on a normal apex", async () => {
    process.env.JWT_SECRET = "proxy-test-secret-with-at-least-32-chars";
    process.env.APP_URL = "https://yoursaas.test";
    delete process.env.NEXT_PUBLIC_APP_URL;
    resolveTenantFromRequestMock.mockResolvedValue(null);
    vi.resetModules();
    const { proxy } = await import("@/proxy");
    const res = await proxy(new NextRequest("https://yoursaas.test/c/club-a", { headers: { host: "yoursaas.test" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
