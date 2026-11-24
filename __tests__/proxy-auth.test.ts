import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const getClubAccessStateMock = vi.fn();
const resolveTenantFromRequestMock = vi.fn();
const getAuthenticatedAccountMock = vi.fn();
vi.mock("@/lib/tenant", () => ({
  getClubAccessState: (...args: unknown[]) => getClubAccessStateMock(...args),
  resolveTenantFromRequest: (...args: unknown[]) => resolveTenantFromRequestMock(...args),
}));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedAccount: (...args: unknown[]) => getAuthenticatedAccountMock(...args),
}));

const SECRET = "proxy-test-secret-with-at-least-32-chars";
const TENANT = { id: "club-1", slug: "club-a", name: "Club A", status: "SUSPENDED" };
let account: { id: string; role: string; clubId: string | null };

async function token(role: string) {
  return new SignJWT({ id: "user-1", email: "user@example.test", role, name: "Test", clubId: "club-1" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(SECRET));
}

async function runProxy(path: string, authorization?: string, host = "club-a.yoursaas.test", method = "GET") {
  process.env.JWT_SECRET = SECRET;
  process.env.APP_URL = "https://yoursaas.test";
  vi.resetModules();
  const { proxy } = await import("@/proxy");
  return proxy(new NextRequest(`https://${host}${path}`, {
    method,
    headers: {
      host,
      origin: `https://${host}`,
      ...(authorization ? { authorization } : {}),
    },
  }));
}

async function runProxyWithCookie(path: string, role: string) {
  process.env.JWT_SECRET = SECRET;
  process.env.APP_URL = "https://yoursaas.test";
  vi.resetModules();
  const { proxy } = await import("@/proxy");
  return proxy(new NextRequest(`https://club-a.yoursaas.test${path}`, {
    headers: {
      host: "club-a.yoursaas.test",
      cookie: `token=${await token(role)}`,
    },
  }));
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  getClubAccessStateMock.mockResolvedValue("ACTIVE");
  resolveTenantFromRequestMock.mockResolvedValue(TENANT);
  account = { id: "user-1", role: "OWNER", clubId: "club-1" };
  getAuthenticatedAccountMock.mockImplementation(async () => account);
});
afterEach(() => vi.unstubAllEnvs());

describe("proxy protected API bearer authentication", () => {
  it("allows a valid MEMBER bearer token through to the dashboard handler", async () => {
    const response = await runProxy("/api/dashboard/notifications", `Bearer ${await token("MEMBER")}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  describe("locked club access", () => {
    beforeEach(() => getClubAccessStateMock.mockResolvedValue("TRIAL_EXPIRED"));

    it("allows the owner to reach the reactivation page and redirects their public landing page there", async () => {
      const reactivation = await runProxyWithCookie("/admin/reactivate", "OWNER");
      expect(reactivation.headers.get("x-middleware-next")).toBe("1");

      const landing = await runProxyWithCookie("/", "OWNER");
      expect(landing.status).toBe(307);
      expect(landing.headers.get("location")).toContain("/admin/reactivate");
    });

    it("returns the exact CLUB_LOCKED response for owner and non-owner dashboard APIs", async () => {
      const ownerResponse = await runProxy("/api/admin/members", `Bearer ${await token("OWNER")}`);
      expect(ownerResponse.status).toBe(402);
      expect(await ownerResponse.json()).toMatchObject({ code: "CLUB_LOCKED", reason: "TRIAL_EXPIRED" });

      for (const role of ["ADMIN", "COACH", "MEMBER"]) {
        account = { id: `${role.toLowerCase()}-1`, role, clubId: "club-1" };
        const response = await runProxy("/api/dashboard/schedule", `Bearer ${await token(role)}`);
        expect(response.status).toBe(402);
        expect(await response.json()).toMatchObject({ code: "CLUB_LOCKED", reason: "TRIAL_EXPIRED" });
      }
    });

    it("allows only the owner's own profile GET/PUT, not nested or destructive profile APIs", async () => {
      account = { id: "owner-1", role: "OWNER", clubId: "club-1" };
      const profile = await runProxy("/api/dashboard/profile", `Bearer ${await token("OWNER")}`);
      expect(profile.headers.get("x-middleware-next")).toBe("1");

      const nested = await runProxy("/api/dashboard/profile/password", `Bearer ${await token("OWNER")}`);
      expect(nested.status).toBe(402);
      expect(await nested.json()).toMatchObject({ code: "CLUB_LOCKED", reason: "TRIAL_EXPIRED" });

      const deletion = await runProxy("/api/dashboard/profile", `Bearer ${await token("OWNER")}`, "club-a.yoursaas.test", "DELETE");
      expect(deletion.status).toBe(402);
      expect(await deletion.json()).toMatchObject({ code: "CLUB_LOCKED", reason: "TRIAL_EXPIRED" });
    });

    it("serves a neutral suspended page to non-owner visitors and keeps plans public", async () => {
      account = { id: "member-1", role: "MEMBER", clubId: "club-1" };
      const suspended = await runProxyWithCookie("/", "MEMBER");
      expect(suspended.status).toBe(307);
      expect(suspended.headers.get("location")).toContain("/club-suspended");

      const plans = await runProxy("/api/saas-plans");
      expect(plans.status).toBe(200);
      expect(plans.headers.get("x-middleware-next")).toBe("1");
    });

    it("does not grant locked access when the authenticated account belongs to another tenant", async () => {
      account = { id: "owner-a", role: "OWNER", clubId: "club-other" };
      const response = await runProxy("/api/admin/members", `Bearer ${await token("OWNER")}`);
      expect(response.status).toBe(402);
      expect(await response.json()).toMatchObject({ code: "CLUB_LOCKED", reason: "TRIAL_EXPIRED" });
    });

    it("does not apply the tenant lock to SUPER_ADMIN platform routes", async () => {
      account = { id: "root", role: "SUPER_ADMIN", clubId: null };
      const response = await runProxy("/api/platform/clubs", `Bearer ${await token("SUPER_ADMIN")}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    it("does not let a locked Club A affect an active Club B", async () => {
      const clubB = { ...TENANT, id: "club-b", slug: "club-b", status: "ACTIVE" };
      resolveTenantFromRequestMock.mockImplementation(async (request: Request) =>
        request.headers.get("host")?.startsWith("club-b.") ? clubB : TENANT
      );
      getClubAccessStateMock.mockImplementation(async (clubId: string) =>
        clubId === "club-1" ? "TRIAL_EXPIRED" : "ACTIVE"
      );
      const response = await runProxy(
        "/api/admin/members",
        `Bearer ${await token("ADMIN")}`,
        "club-b.yoursaas.test"
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });
  });

  it("sets a nonce-based page CSP without unsafe-inline scripts", async () => {
    const response = await runProxy("/");
    const csp = response.headers.get("content-security-policy") ?? "";
    const scriptPolicy = csp.split(";").find((directive) => directive.trim().startsWith("script-src")) ?? "";
    expect(scriptPolicy).toContain("'nonce-");
    expect(scriptPolicy).not.toContain("'unsafe-inline'");
  });

  it("applies role gates to bearer-authenticated API requests", async () => {
    const response = await runProxy("/api/admin/members", `Bearer ${await token("MEMBER")}`);
    expect(response.status).toBe(403);
  });

  it("continues rejecting protected requests without either credential", async () => {
    const response = await runProxy("/api/dashboard/notifications");
    expect(response.status).toBe(401);
  });
});