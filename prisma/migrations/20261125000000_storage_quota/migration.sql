CREATE TABLE "club_storage" (
    "clubId" TEXT NOT NULL,
    "cloudinaryBytes" BIGINT NOT NULL DEFAULT 0,
    "inventoryCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_storage_pkey" PRIMARY KEY ("clubId")
);

CREATE TABLE "cloudinary_assets" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cloudinary_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "storage_reservations" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "reservedBytes" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_reservations_pkey" PRIMARY KEY ("id")
);

INSERT INTO "club_storage" ("clubId", "cloudinaryBytes", "inventoryCompletedAt", "updatedAt")
SELECT "id", 0, NULL, CURRENT_TIMESTAMP
FROM "clubs";

CREATE UNIQUE INDEX "cloudinary_assets_clubId_resourceType_publicId_key"
ON "cloudinary_assets"("clubId", "resourceType", "publicId");
CREATE INDEX "cloudinary_assets_clubId_idx" ON "cloudinary_assets"("clubId");
CREATE INDEX "storage_reservations_clubId_expiresAt_idx"
ON "storage_reservations"("clubId", "expiresAt");

ALTER TABLE "club_storage"
ADD CONSTRAINT "club_storage_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cloudinary_assets"
ADD CONSTRAINT "cloudinary_assets_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "club_storage"("clubId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "storage_reservations"
ADD CONSTRAINT "storage_reservations_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "club_storage"("clubId") ON DELETE CASCADE ON UPDATE CASCADE;
