import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireUserMock = vi.fn();
const upsertMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireUser: (...args: unknown[]) => requireUserMock(...args),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    userPreferences: {
      upsert: (...args: unknown[]) => upsertMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));

const { GET, PUT } = await import("../settings/route");

const preferences = {
  userId: "u1",
  language: "FR",
  darkMode: false,
  emailNotifications: true,
  pushNotifications: true,
  smsNotifications: false,
};

const request = (method: "GET" | "PUT", body?: unknown) =>
  new NextRequest("https://club-a.example.test/api/dashboard/settings", {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({
    ok: true,
    user: { id: "u1", clubId: "club_A", role: "MEMBER" },
  });
  upsertMock.mockResolvedValue(preferences);
  updateMock.mockResolvedValue({ ...preferences, language: "EN", pushNotifications: false });
});

describe("/api/dashboard/settings", () => {
  it("requires authentication before reading preferences", async () => {
    requireUserMock.mockResolvedValue({ ok: false, status: 401 });

    const response = await GET(request("GET"));

    expect(response.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("loads or creates preferences for the authenticated account", async () => {
    const response = await GET(request("GET"));

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith({
      where: { userId: "u1" },
      update: {},
      create: { userId: "u1" },
    });
    expect(await response.json()).toEqual({ preferences });
  });

  it("updates only validated preferences for the authenticated account", async () => {
    const response = await PUT(request("PUT", {
      language: "EN",
      pushNotifications: false,
      clubId: "club_B",
    }));

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith({
      where: { userId: "u1" },
      update: {},
      create: { userId: "u1" },
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { language: "EN", pushNotifications: false },
    });
  });

  it("rejects invalid preference values without writing", async () => {
    const response = await PUT(request("PUT", { language: "DE" }));

    expect(response.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
