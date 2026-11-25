const RESOURCE_TYPES = ["image", "video", "raw"] as const;
const PAGE_SIZE = 500;
const BATCH_SIZE = 500;

export type StorageResourceType = (typeof RESOURCE_TYPES)[number];

export interface CloudinaryFolderResource {
  public_id?: string;
  bytes?: number;
}

export interface CloudinaryFolderPage {
  resources: CloudinaryFolderResource[];
  next_cursor?: string;
}

export type CloudinaryFolderLister = (
  assetFolder: string,
  options: { resource_type: StorageResourceType; max_results: number; next_cursor?: string }
) => Promise<CloudinaryFolderPage>;

export interface CloudinaryAssetRecord {
  clubId: string;
  resourceType: StorageResourceType;
  publicId: string;
  byteSize: bigint;
  createdAt: Date;
  updatedAt: Date;
}

export async function backfillCloudinaryFolder(
  clubId: string,
  listPage: CloudinaryFolderLister,
  persistBatch: (assets: CloudinaryAssetRecord[]) => Promise<void>
): Promise<void> {
  const assetFolder = `clubs/${clubId}`;
  for (const resourceType of RESOURCE_TYPES) {
    let nextCursor: string | undefined;
    const seenCursors = new Set<string>();
    do {
      const page = await listPage(assetFolder, {
        resource_type: resourceType,
        max_results: PAGE_SIZE,
        ...(nextCursor ? { next_cursor: nextCursor } : {}),
      });
      const now = new Date();
      const batch = page.resources.map((resource): CloudinaryAssetRecord => {
        if (!resource.public_id || !Number.isSafeInteger(resource.bytes) || resource.bytes === undefined || resource.bytes < 0) {
          throw new Error(`Cloudinary returned an invalid resource while scanning ${assetFolder}.`);
        }
        return {
          clubId,
          resourceType,
          publicId: resource.public_id,
          byteSize: BigInt(resource.bytes),
          createdAt: now,
          updatedAt: now,
        };
      });

      for (let offset = 0; offset < batch.length; offset += BATCH_SIZE) {
        await persistBatch(batch.slice(offset, offset + BATCH_SIZE));
      }

      nextCursor = page.next_cursor;
      if (nextCursor && seenCursors.has(nextCursor)) {
        throw new Error(`Cloudinary repeated a pagination cursor while scanning ${assetFolder}.`);
      }
      if (nextCursor) seenCursors.add(nextCursor);
    } while (nextCursor);
  }
}
