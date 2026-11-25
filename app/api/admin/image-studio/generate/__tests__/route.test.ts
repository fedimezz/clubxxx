import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { requireOwnerMock, checkRateLimitMock } = vi.hoisted(() => ({
  requireOwnerMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner: requireOwnerMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));

import { POST } from "../route";

const OWNER = { id: "owner-private-id", clubId: "club-private-id", role: "OWNER" };
const originalApiKey = process.env.OPENAI_API_KEY;

function request(body: unknown) {
  return new NextRequest("https://club.example.test/api/admin/image-studio/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/image-studio/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOwnerMock.mockResolvedValue({ ok: true, user: OWNER });
    checkRateLimitMock.mockResolvedValue({ allowed: true });
    process.env.OPENAI_API_KEY = "server-test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });

  it("denies non-owners before spending provider credits", async () => {
    requireOwnerMock.mockResolvedValue({ ok: false, status: 403 });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request({ prompt: "A bright modern gym" }));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("validates the prompt and enforces the per-owner rate limit", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request({ prompt: "no" }))).status).toBe(400);

    checkRateLimitMock.mockResolvedValueOnce({ allowed: false });
    const limited = await POST(request({ prompt: "A bright modern gym" }));

    expect(limited.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).toHaveBeenCalledWith("image-generation:club-private-id:owner-private-id", 6, 60 * 60 * 1000);
  });

  it("calls the server-side Images API with a privacy-preserving identifier", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ b64_json: "encoded-image" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request({ prompt: "A bright modern gym" }));
    const json = await response.json();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json).toEqual({ image: "encoded-image", mimeType: "image/jpeg" });
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer server-test-key");
    expect(body).toMatchObject({ model: "gpt-image-2.5-flare", output_format: "jpeg", quality: "medium" });
    expect(body.safety_identifier).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(body)).not.toContain(OWNER.id);
    expect(JSON.stringify(body)).not.toContain(OWNER.clubId);
  });

  it("reports missing configuration and provider failures without returning a false success", async () => {
    delete process.env.OPENAI_API_KEY;
    expect((await POST(request({ prompt: "A bright modern gym" }))).status).toBe(503);

    process.env.OPENAI_API_KEY = "server-test-key";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "provider_error" } }), { status: 500 })));
    const response = await POST(request({ prompt: "A bright modern gym" }));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });
});
