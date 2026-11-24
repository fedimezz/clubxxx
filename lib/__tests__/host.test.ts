import { describe, it, expect, afterEach } from "vitest";
import { extractSlugFromHost, isTenantHost } from "../host";

describe("extractSlugFromHost", () => {
  it("treats bare localhost as the platform host (no tenant)", () => {
    expect(extractSlugFromHost("localhost")).toBeNull();
    expect(extractSlugFromHost("localhost:3000")).toBeNull();
    expect(extractSlugFromHost("127.0.0.1:3000")).toBeNull();
  });

  it("resolves a *.localhost host to its tenant slug", () => {
    expect(extractSlugFromHost("club-a.localhost")).toBe("club-a");
    expect(extractSlugFromHost("club-a.localhost:3000")).toBe("club-a");
    expect(extractSlugFromHost("Club-A.Localhost:3000")).toBe("club-a");
  });

  it("does not treat www.<slug>.localhost as a tenant", () => {
    expect(extractSlugFromHost("www.club-a.localhost:3000")).toBeNull();
  });

  it("treats a bare production apex domain as the platform host", () => {
    expect(extractSlugFromHost("clubx.com")).toBeNull();
    expect(extractSlugFromHost("www.clubx.com")).toBeNull();
  });

  it("resolves a production subdomain to its tenant slug", () => {
    expect(extractSlugFromHost("club-a.clubx.com")).toBe("club-a");
    expect(extractSlugFromHost("club-a.clubx.com:443")).toBe("club-a");
  });
});

describe("isTenantHost", () => {
  it("mirrors extractSlugFromHost's null/non-null result", () => {
    expect(isTenantHost("localhost:3000")).toBe(false);
    expect(isTenantHost("club-a.localhost:3000")).toBe(true);
    expect(isTenantHost("clubx.com")).toBe(false);
    expect(isTenantHost("club-a.clubx.com")).toBe(true);
  });
});

describe("extractSlugFromHost with APP_URL set", () => {
  const original = { app: process.env.APP_URL, pub: process.env.NEXT_PUBLIC_APP_URL };
  afterEach(() => {
    if (original.app === undefined) delete process.env.APP_URL; else process.env.APP_URL = original.app;
    if (original.pub === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = original.pub;
  });

  it("treats a *.vercel.app APP_URL host as the platform, not as a tenant", () => {
    process.env.APP_URL = "https://clubxx-lovat.vercel.app";
    expect(extractSlugFromHost("clubxx-lovat.vercel.app")).toBeNull();
    expect(isTenantHost("clubxx-lovat.vercel.app")).toBe(false);
  });

  it("still resolves club subdomains of that apex", () => {
    process.env.APP_URL = "https://clubxx-lovat.vercel.app";
    expect(extractSlugFromHost("club-a.clubxx-lovat.vercel.app")).toBe("club-a");
    expect(extractSlugFromHost("a.b.clubxx-lovat.vercel.app")).toBeNull();
  });

  it("handles multi-part apexes such as clubx.com.tn", () => {
    process.env.APP_URL = "https://clubx.com.tn";
    expect(extractSlugFromHost("clubx.com.tn")).toBeNull();
    expect(extractSlugFromHost("www.clubx.com.tn")).toBeNull();
    expect(extractSlugFromHost("club-a.clubx.com.tn")).toBe("club-a");
  });

  it("keeps localhost behaviour unchanged", () => {
    process.env.APP_URL = "http://localhost:3000";
    expect(extractSlugFromHost("localhost:3000")).toBeNull();
    expect(extractSlugFromHost("club-a.localhost:3000")).toBe("club-a");
    expect(extractSlugFromHost("www.club-a.localhost:3000")).toBeNull();
  });
});

describe("single-address mode helpers", () => {
  const saved = { app: process.env.APP_URL, pub: process.env.NEXT_PUBLIC_APP_URL, flag: process.env.NEXT_PUBLIC_SINGLE_HOST_MODE };
  afterEach(() => {
    for (const [k, v] of [["APP_URL", saved.app], ["NEXT_PUBLIC_APP_URL", saved.pub], ["NEXT_PUBLIC_SINGLE_HOST_MODE", saved.flag]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it("turns on for a *.vercel.app APP_URL and off for a real domain", async () => {
    const { isSingleHostMode, isSingleHostApex } = await import("../host");
    process.env.APP_URL = "https://clubxx-lovat.vercel.app";
    expect(isSingleHostMode()).toBe(true);
    expect(isSingleHostApex("clubxx-lovat.vercel.app")).toBe(true);
    expect(isSingleHostApex("custom.example.com")).toBe(false);
    process.env.APP_URL = "https://clubx.tn";
    expect(isSingleHostMode()).toBe(false);
    process.env.NEXT_PUBLIC_SINGLE_HOST_MODE = "true";
    expect(isSingleHostMode()).toBe(true);
    process.env.APP_URL = "https://clubxx-lovat.vercel.app";
    process.env.NEXT_PUBLIC_SINGLE_HOST_MODE = "false";
    expect(isSingleHostMode()).toBe(false);
  });

  it("parses /c prefixes", async () => {
    const { parseClubPrefix, isPlatformOnlyPath } = await import("../host");
    expect(parseClubPrefix("/c")).toEqual({ slug: "", rest: "/" });
    expect(parseClubPrefix("/c/Club-A")).toEqual({ slug: "club-a", rest: "/" });
    expect(parseClubPrefix("/c/club-a/api/x")).toEqual({ slug: "club-a", rest: "/api/x" });
    expect(parseClubPrefix("/clubs")).toBeNull();
    expect(parseClubPrefix("/coaches")).toBeNull();
    expect(isPlatformOnlyPath("/platform/clubs")).toBe(true);
    expect(isPlatformOnlyPath("/api/onboarding/complete")).toBe(true);
    expect(isPlatformOnlyPath("/platformer")).toBe(false);
    expect(isPlatformOnlyPath("/admin")).toBe(false);
  });
});
