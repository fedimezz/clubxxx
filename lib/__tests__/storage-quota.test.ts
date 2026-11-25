import { beforeEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.fn();
const tx = {
  $queryRaw: vi.fn(),
  clubSubscription: { findUnique: vi.fn() },
  storageReservation: {
    aggregate: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
  },
  cloudinaryAsset: { findUnique: vi.fn(), upsert: vi.fn() },
  clubStorage: { update: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: (...args: unknown[]) => transactionMock(...args),
    storageReservation: { deleteMany: vi.fn() },
  },
}));

import {
  completeCloudinaryUpload,
  reserveCloudinaryUpload,
  storageQuotaAllows,
} from "@/lib/storage-quota";

let cloudinaryBytes = BigInt(0);
let inventoryCompletedAt: Date | null = new Date();
let avatarBytes = BigInt(0);
let modelBytes = BigInt(0);
let reservedBytes = BigInt(0);

beforeEach(() => {
  vi.clearAllMocks();
  cloudinaryBytes = BigInt(0);
  inventoryCompletedAt = new Date();
  avatarBytes = BigInt(0);
  modelBytes = BigInt(0);
  reservedBytes = BigInt(0);
  transactionMock.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  tx.$queryRaw.mockImplementation((parts: TemplateStringsArray) => {
    const query = parts.join(" ");
    if (query.includes("club_storage")) return [{ cloudinaryBytes, inventoryCompletedAt }];
    if (query.includes('"users"')) return [{ bytes: avatarBytes }];
    if (query.includes("club_hero_models")) return [{ bytes: modelBytes }];
    throw new Error(`Unexpected storage query: ${query}`);
  });
  tx.clubSubscription.findUnique.mockResolvedValue({
    status: "ACTIVE",
    plan: { limits: { storageGB: 1 } },
  });
  tx.storageReservation.aggregate.mockImplementation(() => Promise.resolve({ _sum: { reservedBytes } }));
  tx.storageReservation.create.mockResolvedValue({ id: "reservation-1" });
  tx.storageReservation.deleteMany.mockResolvedValue({ count: 0 });
  tx.storageReservation.findFirst.mockImplementation(() =>
    Promise.resolve({ reservedBytes, expiresAt: new Date(Date.now() + 60_000) })
  );
  tx.cloudinaryAsset.findUnique.mockResolvedValue(null);
  tx.cloudinaryAsset.upsert.mockResolvedValue({ id: "asset-1" });
  tx.clubStorage.update.mockResolvedValue({ clubId: "club-1" });
});

describe("storage quota", () => {
  it("includes Cloudinary assets, inline avatars, custom models, and reservations in usage", async () => {
    cloudinaryBytes = BigInt(600_000_000);
    avatarBytes = BigInt(200_000_000);
    modelBytes = BigInt(100_000_000);
    reservedBytes = BigInt(100_000_000);

    const result = await reserveCloudinaryUpload("club-1", 1);

    expect(result).toEqual({ ok: false, code: "QUOTA_EXCEEDED" });
    expect(tx.storageReservation.create).not.toHaveBeenCalled();
  });

  it("allows exact quota replacement but rejects a one-byte overage", () => {
    const snapshot = { ok: true as const, usedBytes: BigInt(95), limitBytes: BigInt(100) };

    expect(storageQuotaAllows(snapshot, BigInt(10), BigInt(5))).toBe(true);
    expect(storageQuotaAllows(snapshot, BigInt(11), BigInt(5))).toBe(false);
  });

  it("reserves capacity at the exact limit and includes concurrent reservations", async () => {
    cloudinaryBytes = BigInt(999_999_990);

    const exactFit = await reserveCloudinaryUpload("club-1", 10);
    expect(exactFit).toEqual({ ok: true, reservationId: "reservation-1" });

    reservedBytes = BigInt(10);
    const overLimit = await reserveCloudinaryUpload("club-1", 1);
    expect(overLimit).toEqual({ ok: false, code: "QUOTA_EXCEEDED" });
  });

  it("fails closed until the existing Cloudinary inventory is complete", async () => {
    inventoryCompletedAt = null;

    const result = await reserveCloudinaryUpload("club-1", 1);

    expect(result).toEqual({ ok: false, code: "INVENTORY_REQUIRED" });
    expect(tx.storageReservation.create).not.toHaveBeenCalled();
  });

  it("finalizes a successful Cloudinary upload into the asset ledger", async () => {
    cloudinaryBytes = BigInt(100);
    reservedBytes = BigInt(50);

    const result = await completeCloudinaryUpload({
      clubId: "club-1",
      reservationId: "reservation-1",
      resourceType: "image",
      publicId: "clubs/club-1/photo",
      byteSize: 40,
    });

    expect(result).toEqual({ ok: true, reservationId: "reservation-1" });
    expect(tx.cloudinaryAsset.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ clubId: "club-1", resourceType: "image", byteSize: BigInt(40) }),
    }));
    expect(tx.clubStorage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { cloudinaryBytes: { increment: BigInt(40) } },
    }));
    expect(tx.storageReservation.deleteMany).toHaveBeenCalledWith({
      where: { id: "reservation-1", clubId: "club-1" },
    });
  });

  it("does not finalize an asset larger than the remaining quota", async () => {
    cloudinaryBytes = BigInt(999_999_990);
    reservedBytes = BigInt(10);

    const result = await completeCloudinaryUpload({
      clubId: "club-1",
      reservationId: "reservation-1",
      resourceType: "image",
      publicId: "clubs/club-1/photo",
      byteSize: 20,
    });

    expect(result).toEqual({ ok: false, code: "QUOTA_EXCEEDED" });
    expect(tx.cloudinaryAsset.upsert).not.toHaveBeenCalled();
    expect(tx.storageReservation.deleteMany).not.toHaveBeenCalled();
  });
});
