import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireUserMock = vi.fn();
const findUniqueMock = vi.fn();
const userUpdateMock = vi.fn();
const transactionMock = vi.fn();
const transactionUserFindUniqueMock = vi.fn();
const storageSnapshotMock = vi.fn();
const storageAllowsMock = vi.fn();
const storageResponseMock = vi.fn();
const logActionMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireUser: (...args: unknown[]) => requireUserMock(...args),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      update: (...args: unknown[]) => userUpdateMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

vi.mock("@/lib/storage-quota", () => ({
  getLockedStorageSnapshot: (...args: unknown[]) => storageSnapshotMock(...args),
  storageQuotaAllows: (...args: unknown[]) => storageAllowsMock(...args),
  storageQuotaResponse: (...args: unknown[]) => storageResponseMock(...args),
}));

vi.mock("@/lib/activity-log", () => ({
  logAction: (...args: unknown[]) => logActionMock(...args),
}));

vi.mock("@/lib/membership-card", () => ({
  withSubscriptionExpiry: (card: unknown) => card,
}));

const { GET, PUT } = await import("../profile/route");

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({
    ok: true,
    user: { id: "u1", clubId: "club_A", role: "MEMBER" },
  });
  findUniqueMock.mockResolvedValue({
    id: "u1",
    name: "Fedi",
    email: "fedi@example.test",
    subscriptions: [],
    membershipCard: null,
  });
  transactionMock.mockImplementation((callback: (client: unknown) => Promise<unknown>) =>
    callback({ user: { findUnique: transactionUserFindUniqueMock, update: userUpdateMock } })
  );
  transactionUserFindUniqueMock.mockResolvedValue({ avatar: null });
  userUpdateMock.mockResolvedValue({
    id: "u1",
    name: "Fedi",
    email: "fedi@example.test",
    phone: null,
    avatar: null,
    role: "MEMBER",
    isActive: true,
    createdAt: new Date(),
  });
  storageSnapshotMock.mockResolvedValue({ ok: true, usedBytes: BigInt(0), limitBytes: BigInt(100) });
  storageAllowsMock.mockReturnValue(true);
  storageResponseMock.mockReturnValue({ status: 402, error: "Storage quota reached" });
});

describe("GET /api/dashboard/profile", () => {
  it("chooses the newest unexpired active subscription for the authenticated account", async () => {
    const request = new NextRequest("https://club-a.example.test/api/dashboard/profile?clubId=club_B");

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: expect.objectContaining({
        subscriptions: {
          where: {
            status: "ACTIVE",
            endDate: { gt: expect.any(Date) },
          },
          orderBy: { startDate: "desc" },
          take: 1,
          include: { plan: true },
        },
      }),
    });
    expect(JSON.stringify(findUniqueMock.mock.calls[0])).not.toContain("club_B");
  });
});

describe("PUT /api/dashboard/profile storage quota", () => {
  it("rejects a database-stored avatar when the tenant quota would be exceeded", async () => {
    storageSnapshotMock.mockResolvedValue({ ok: true, usedBytes: BigInt(100), limitBytes: BigInt(100) });
    storageAllowsMock.mockReturnValue(false);

    const response = await PUT(new NextRequest("https://club-a.example.test/api/dashboard/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ avatar: "data:image/png;base64,AAAA" }),
    }));

    expect(response.status).toBe(402);
    expect(storageSnapshotMock).toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });
});
