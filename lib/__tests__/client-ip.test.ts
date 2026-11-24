import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientIp } from "@/lib/rate-limit";

const req = (headers: Record<string, string>) => new Request("https://x.test/", { headers });

afterEach(() => vi.unstubAllEnvs());

describe("getClientIp", () => {
  it("default: first x-forwarded-for entry (legacy behaviour)", () => {
    expect(getClientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
  });
  it("falls back to x-real-ip then 'unknown'", () => {
    expect(getClientIp(req({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(getClientIp(req({}))).toBe("unknown");
  });
  it("TRUSTED_PROXY_HOPS=1 ignores a spoofed left-most entry and takes the one the proxy appended", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 9.9.9.9" }))).toBe("9.9.9.9");
  });
  it("TRUSTED_PROXY_HOPS=2 counts two proxies from the right", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
  });
  it("on Vercel the platform header wins over a client-supplied x-forwarded-for", () => {
    vi.stubEnv("VERCEL", "1");
    expect(getClientIp(req({ "x-vercel-forwarded-for": "4.4.4.4", "x-forwarded-for": "6.6.6.6" }))).toBe("4.4.4.4");
  });
  it("outside Vercel x-vercel-forwarded-for is NOT trusted", () => {
    expect(getClientIp(req({ "x-vercel-forwarded-for": "4.4.4.4", "x-forwarded-for": "1.1.1.1" }))).toBe("1.1.1.1");
  });
});
