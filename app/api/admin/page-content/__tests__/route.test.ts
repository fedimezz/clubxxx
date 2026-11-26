import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const pageContentFindMany = vi.fn();
const pageContentUpsert = vi.fn();
const requireAdmin = vi.fn();
const denyUnlessPermitted = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    pageContent: {
      findMany: (...args: unknown[]) => pageContentFindMany(...args),
      upsert: (...args: unknown[]) => pageContentUpsert(...args),
    },
  },
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: (...args: unknown[]) => requireAdmin(...args) }));
vi.mock("@/lib/permission-guard", () => ({ denyUnlessPermitted: (...args: unknown[]) => denyUnlessPermitted(...args) }));
vi.mock("@/lib/website-setup", () => ({ denyIfWebsiteLocked: vi.fn().mockResolvedValue(null) }));

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({
    ok: true,
    user: { id: "owner-a", role: "OWNER", clubId: "club-a" },
  });
  denyUnlessPermitted.mockResolvedValue(null);
  pageContentFindMany.mockResolvedValue([]);
  pageContentUpsert.mockImplementation(async ({ create }: { create: object }) => ({
    pageKey: "home",
    content: (create as { content: unknown }).content,
  }));
});

describe("/api/admin/page-content image metadata", () => {
  it("writes crop metadata only to the authenticated tenant's page record", async () => {
    const { PUT } = await import("@/app/api/admin/page-content/route");
    const content = {
      introImage: "https://res.cloudinary.com/demo/image/upload/club-intro.jpg",
      homeGallery: JSON.stringify(["https://res.cloudinary.com/demo/image/upload/gym.jpg"]),
      __imagePositions: JSON.stringify({
        introImage: { x: 25.4, y: 80, zoom: 1.55 },
        "homeGallery:0": { x: 65, y: 35, zoom: 1.2 },
        "homeGallery:12": { x: 10, y: 10, zoom: 1 },
        heroImage: { x: 30, y: 60, zoom: 1.4 },
        bogusImage: { x: 50, y: 50, zoom: 1 },
      }),
    };
    const response = await PUT(new NextRequest("https://club-a.example.test/api/admin/page-content", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clubId: "club-b", pageKey: "home", content }),
    }));

    expect(response.status).toBe(200);
    const call = pageContentUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ clubId_pageKey: { clubId: "club-a", pageKey: "home" } });
    expect(call.create).toMatchObject({ clubId: "club-a", pageKey: "home", updatedBy: "owner-a" });
    expect(call.create).not.toHaveProperty("clubId", "club-b");
    expect(JSON.parse(call.create.content.__imagePositions)).toEqual({
      introImage: { x: 25, y: 80, zoom: 1.55 },
      heroImage: { x: 30, y: 60, zoom: 1.4 }, // the home hero photo slot is a real image field
      "homeGallery:0": { x: 65, y: 35, zoom: 1.2 },
    });
  });

  it("scopes page-content reads to the authenticated club", async () => {
    const { GET } = await import("@/app/api/admin/page-content/route");
    const response = await GET(new NextRequest("https://club-a.example.test/api/admin/page-content"));

    expect(response.status).toBe(200);
    expect(pageContentFindMany.mock.calls[0][0].where).toMatchObject({ clubId: "club-a" });
  });
});
