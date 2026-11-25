import { describe, expect, it, vi } from "vitest";
import { backfillCloudinaryFolder, type CloudinaryFolderLister } from "@/lib/storage-backfill";

describe("Cloudinary storage backfill", () => {
  it("follows every page for all resource types and persists each asset", async () => {
    const listPage = vi.fn<CloudinaryFolderLister>()
      .mockResolvedValueOnce({
        resources: [{ public_id: "image/one", bytes: 10 }],
        next_cursor: "image-page-2",
      })
      .mockResolvedValueOnce({
        resources: [{ public_id: "image/two", bytes: 20 }],
      })
      .mockResolvedValueOnce({
        resources: [{ public_id: "video/one", bytes: 30 }],
      })
      .mockResolvedValueOnce({
        resources: [{ public_id: "raw/one", bytes: 40 }],
      });
    const persistBatch = vi.fn().mockResolvedValue(undefined);

    await backfillCloudinaryFolder("club-1", listPage, persistBatch);

    expect(listPage).toHaveBeenNthCalledWith(1, "clubs/club-1", {
      resource_type: "image",
      max_results: 500,
    });
    expect(listPage).toHaveBeenNthCalledWith(2, "clubs/club-1", {
      resource_type: "image",
      max_results: 500,
      next_cursor: "image-page-2",
    });
    expect(listPage).toHaveBeenNthCalledWith(3, "clubs/club-1", {
      resource_type: "video",
      max_results: 500,
    });
    expect(listPage).toHaveBeenNthCalledWith(4, "clubs/club-1", {
      resource_type: "raw",
      max_results: 500,
    });
    expect(persistBatch).toHaveBeenCalledTimes(4);
    expect(persistBatch.mock.calls.map(([batch]) => batch[0])).toEqual([
      expect.objectContaining({ publicId: "image/one", byteSize: BigInt(10) }),
      expect.objectContaining({ publicId: "image/two", byteSize: BigInt(20) }),
      expect.objectContaining({ publicId: "video/one", byteSize: BigInt(30) }),
      expect.objectContaining({ publicId: "raw/one", byteSize: BigInt(40) }),
    ]);
  });

  it("fails instead of marking an invalid Cloudinary resource as imported", async () => {
    const listPage = vi.fn<CloudinaryFolderLister>().mockResolvedValue({
      resources: [{ public_id: "bad/image", bytes: Number.NaN }],
    });
    const persistBatch = vi.fn().mockResolvedValue(undefined);

    await expect(backfillCloudinaryFolder("club-1", listPage, persistBatch)).rejects.toThrow(
      "Cloudinary returned an invalid resource"
    );
    expect(persistBatch).not.toHaveBeenCalled();
  });

  it("stops a provider that repeats a pagination cursor", async () => {
    const listPage = vi.fn<CloudinaryFolderLister>()
      .mockResolvedValue({
        resources: [],
        next_cursor: "repeat",
      });
    const persistBatch = vi.fn().mockResolvedValue(undefined);

    await expect(backfillCloudinaryFolder("club-1", listPage, persistBatch)).rejects.toThrow(
      "Cloudinary repeated a pagination cursor"
    );
    expect(listPage).toHaveBeenCalledTimes(2);
  });
});
