import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export const BYTES_PER_GB = BigInt(1_000_000_000);
const RESERVATION_TTL_MS = 15 * 60 * 1000;

export type StorageQuotaErrorCode =
  | "INVENTORY_REQUIRED"
  | "NO_ACTIVE_PLAN"
  | "QUOTA_EXCEEDED"
  | "RESERVATION_MISSING";

export type StorageQuotaOperation =
  | { ok: true; reservationId: string }
  | { ok: false; code: StorageQuotaErrorCode };

export type LockedStorageSnapshot =
  | { ok: true; usedBytes: bigint; limitBytes: bigint | null }
  | { ok: false; code: "INVENTORY_REQUIRED" | "NO_ACTIVE_PLAN" };

function getStorageLimitBytes(limits: Prisma.JsonValue): bigint | null {
  if (typeof limits !== "object" || limits === null || Array.isArray(limits)) {
    throw new Error("SaaS plan limits must be a JSON object");
  }
  const storageGB = (limits as Prisma.JsonObject).storageGB;
  if (storageGB === null) return null;
  if (typeof storageGB !== "number" || !Number.isFinite(storageGB) || storageGB < 0) {
    throw new Error("SaaS plan has an invalid storageGB limit");
  }
  const byteLimit = Math.floor(storageGB * Number(BYTES_PER_GB));
  if (!Number.isSafeInteger(byteLimit)) throw new Error("SaaS plan storageGB limit is too large");
  return BigInt(byteLimit);
}

/** Acquires the tenant storage row lock and reads the quota inputs in the same transaction. */
export async function getLockedStorageSnapshot(
  tx: Prisma.TransactionClient,
  clubId: string
): Promise<LockedStorageSnapshot> {
  const storageRows = await tx.$queryRaw<Array<{ cloudinaryBytes: bigint; inventoryCompletedAt: Date | null }>>`
    SELECT "cloudinaryBytes", "inventoryCompletedAt"
    FROM "club_storage"
    WHERE "clubId" = ${clubId}
    FOR UPDATE
  `;
  const storage = storageRows[0];
  if (!storage?.inventoryCompletedAt) return { ok: false, code: "INVENTORY_REQUIRED" };

  const subscription = await tx.clubSubscription.findUnique({
    where: { clubId },
    select: { status: true, plan: { select: { limits: true } } },
  });
  if (!subscription || subscription.status === "CANCELED" || subscription.status === "SUSPENDED") {
    return { ok: false, code: "NO_ACTIVE_PLAN" };
  }

  const now = new Date();
  const [reservationTotal, avatarRows, modelRows] = await Promise.all([
    tx.storageReservation.aggregate({
      where: { clubId, expiresAt: { gt: now } },
      _sum: { reservedBytes: true },
    }),
    tx.$queryRaw<Array<{ bytes: bigint }>>`
      SELECT COALESCE(SUM(octet_length("avatar")), 0)::bigint AS "bytes"
      FROM "users"
      WHERE "clubId" = ${clubId} AND "avatar" LIKE 'data:image/%'
    `,
    tx.$queryRaw<Array<{ bytes: bigint }>>`
      SELECT COALESCE(SUM("byteSize"), 0)::bigint AS "bytes"
      FROM "club_hero_models"
      WHERE "clubId" = ${clubId}
    `,
  ]);
  const databaseAssetBytes = (avatarRows[0]?.bytes ?? BigInt(0)) + (modelRows[0]?.bytes ?? BigInt(0));
  const reservedBytes = reservationTotal._sum.reservedBytes ?? BigInt(0);

  return {
    ok: true,
    usedBytes: storage.cloudinaryBytes + databaseAssetBytes + reservedBytes,
    limitBytes: getStorageLimitBytes(subscription.plan.limits),
  };
}

export function storageQuotaAllows(
  snapshot: Extract<LockedStorageSnapshot, { ok: true }>,
  addedBytes: bigint,
  replacedBytes: bigint = BigInt(0)
): boolean {
  if (addedBytes < BigInt(0) || replacedBytes < BigInt(0) || replacedBytes > snapshot.usedBytes) return false;
  return snapshot.limitBytes === null || snapshot.usedBytes - replacedBytes + addedBytes <= snapshot.limitBytes;
}

export async function reserveCloudinaryUpload(clubId: string, byteSize: number): Promise<StorageQuotaOperation> {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw new Error("Storage reservations require a positive safe-integer byte size");
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.storageReservation.deleteMany({ where: { clubId, expiresAt: { lte: now } } });
    const snapshot = await getLockedStorageSnapshot(tx, clubId);
    if (!snapshot.ok) return snapshot;

    const reservedBytes = BigInt(byteSize);
    if (!storageQuotaAllows(snapshot, reservedBytes)) return { ok: false, code: "QUOTA_EXCEEDED" };

    const reservation = await tx.storageReservation.create({
      data: {
        clubId,
        reservedBytes,
        expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
      },
      select: { id: true },
    });
    return { ok: true, reservationId: reservation.id };
  });
}

export async function completeCloudinaryUpload(input: {
  clubId: string;
  reservationId: string;
  resourceType: string;
  publicId: string;
  byteSize: number;
}): Promise<StorageQuotaOperation> {
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0) {
    throw new Error("Cloudinary asset byte size must be a positive safe integer");
  }

  return prisma.$transaction(async (tx) => {
    const snapshot = await getLockedStorageSnapshot(tx, input.clubId);
    if (!snapshot.ok) return snapshot;

    const reservation = await tx.storageReservation.findFirst({
      where: { id: input.reservationId, clubId: input.clubId },
      select: { reservedBytes: true, expiresAt: true },
    });
    if (!reservation) return { ok: false, code: "RESERVATION_MISSING" };

    const asset = await tx.cloudinaryAsset.findUnique({
      where: {
        clubId_resourceType_publicId: {
          clubId: input.clubId,
          resourceType: input.resourceType,
          publicId: input.publicId,
        },
      },
      select: { byteSize: true },
    });
    const existingBytes = asset?.byteSize ?? BigInt(0);
    const ownReservationBytes = reservation.expiresAt > new Date() ? reservation.reservedBytes : BigInt(0);
    const currentWithoutReservation = snapshot.usedBytes - ownReservationBytes;
    const actualBytes = BigInt(input.byteSize);
    const adjustedSnapshot = {
      ok: true as const,
      usedBytes: currentWithoutReservation,
      limitBytes: snapshot.limitBytes,
    };
    if (!storageQuotaAllows(adjustedSnapshot, actualBytes, existingBytes)) {
      return { ok: false, code: "QUOTA_EXCEEDED" };
    }

    await tx.cloudinaryAsset.upsert({
      where: {
        clubId_resourceType_publicId: {
          clubId: input.clubId,
          resourceType: input.resourceType,
          publicId: input.publicId,
        },
      },
      create: {
        clubId: input.clubId,
        resourceType: input.resourceType,
        publicId: input.publicId,
        byteSize: actualBytes,
      },
      update: { byteSize: actualBytes },
    });
    await tx.clubStorage.update({
      where: { clubId: input.clubId },
      data: { cloudinaryBytes: { increment: actualBytes - existingBytes } },
    });
    await tx.storageReservation.deleteMany({ where: { id: input.reservationId, clubId: input.clubId } });
    return { ok: true, reservationId: input.reservationId };
  });
}

export async function releaseStorageReservation(clubId: string, reservationId: string): Promise<void> {
  await prisma.storageReservation.deleteMany({ where: { id: reservationId, clubId } });
}

export async function markStorageInventoryIncomplete(clubId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "clubId"
      FROM "club_storage"
      WHERE "clubId" = ${clubId}
      FOR UPDATE
    `;
    await tx.clubStorage.updateMany({
      where: { clubId },
      data: { inventoryCompletedAt: null },
    });
  });
}

export function storageQuotaResponse(code: StorageQuotaErrorCode): {
  status: number;
  error: string;
} {
  if (code === "INVENTORY_REQUIRED") {
    return { status: 503, error: "Le relevé du stockage du club doit être terminé avant les téléversements." };
  }
  if (code === "NO_ACTIVE_PLAN") {
    return { status: 402, error: "Aucun abonnement actif ne permet de téléverser des fichiers." };
  }
  if (code === "RESERVATION_MISSING") {
    return { status: 500, error: "La réservation de stockage a expiré. Réessayez le téléversement." };
  }
  return { status: 402, error: "La limite de stockage de votre forfait est atteinte. Supprimez des fichiers ou changez de forfait." };
}
