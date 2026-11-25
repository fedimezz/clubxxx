import prisma from "../lib/prisma";
import cloudinary, { isCloudinaryConfigured } from "../lib/cloudinary";
import { backfillCloudinaryFolder } from "../lib/storage-backfill";

async function backfillClub(clubId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const storage = await tx.clubStorage.upsert({
      where: { clubId },
      create: { clubId, inventoryCompletedAt: null },
      update: { inventoryCompletedAt: null },
      select: { clubId: true },
    });
    await tx.$queryRaw`SELECT "clubId" FROM "club_storage" WHERE "clubId" = ${storage.clubId} FOR UPDATE`;

    const activeReservations = await tx.storageReservation.count({
      where: { clubId, expiresAt: { gt: now } },
    });
    if (activeReservations > 0) {
      throw new Error(`Club ${clubId} has active uploads; retry its backfill after they finish.`);
    }

    await tx.storageReservation.deleteMany({ where: { clubId, expiresAt: { lte: now } } });
    await tx.cloudinaryAsset.deleteMany({ where: { clubId } });
    await tx.clubStorage.update({
      where: { clubId },
      data: { cloudinaryBytes: BigInt(0), inventoryCompletedAt: null },
    });
  });

  await backfillCloudinaryFolder(
    clubId,
    (folder, options) => cloudinary.api.resources_by_asset_folder(folder, options),
    async (assets) => {
      await prisma.cloudinaryAsset.createMany({ data: assets, skipDuplicates: true });
    }
  );

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.$queryRaw`SELECT "clubId" FROM "club_storage" WHERE "clubId" = ${clubId} FOR UPDATE`;
    const activeReservations = await tx.storageReservation.count({
      where: { clubId, expiresAt: { gt: now } },
    });
    if (activeReservations > 0) {
      throw new Error(`Club ${clubId} received an upload during backfill; rerun the backfill.`);
    }

    const inventory = await tx.cloudinaryAsset.aggregate({
      where: { clubId },
      _sum: { byteSize: true },
    });
    await tx.clubStorage.update({
      where: { clubId },
      data: {
        cloudinaryBytes: inventory._sum.byteSize ?? BigInt(0),
        inventoryCompletedAt: now,
      },
    });
  });
}

async function main(): Promise<void> {
  if (!isCloudinaryConfigured) {
    throw new Error("Cloudinary is not configured; storage backfill cannot start.");
  }

  const clubs = await prisma.club.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  for (const club of clubs) {
    process.stdout.write(`Backfilling storage for club ${club.id}...\n`);
    await backfillClub(club.id);
  }
  process.stdout.write(`Storage backfill completed for ${clubs.length} club(s).\n`);
}

main()
  .catch((error: unknown) => {
    console.error("Storage backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
