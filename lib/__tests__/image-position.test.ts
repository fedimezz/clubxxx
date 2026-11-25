import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_POSITION,
  IMAGE_POSITION_MAP_KEY,
  imagePositionKey,
  parseImagePositionMap,
  sanitizeImagePositionMap,
} from "../image-position";

describe("image placement metadata", () => {
  it("uses a stable key for single images and gallery entries", () => {
    expect(IMAGE_POSITION_MAP_KEY).toBe("__imagePositions");
    expect(imagePositionKey("heroImage")).toBe("heroImage");
    expect(imagePositionKey("homeGallery", 2)).toBe("homeGallery:2");
  });

  it("rounds valid positions and drops malformed or out-of-range values", () => {
    expect(parseImagePositionMap(JSON.stringify({
      heroImage: { x: 31.7, y: 62.2, zoom: 1.35 },
      badX: { x: 101, y: 50, zoom: 1 },
      badZoom: { x: 50, y: 50, zoom: 2.1 },
    }))).toEqual({ heroImage: { x: 32, y: 62, zoom: 1.35 } });
    expect(parseImagePositionMap("invalid json")).toEqual({});
    expect(DEFAULT_IMAGE_POSITION).toEqual({ x: 50, y: 50, zoom: 1 });
  });

  it("only keeps placements for image fields and bounded gallery slots", () => {
    const raw = JSON.stringify({
      heroImage: { x: 10, y: 20, zoom: 1 },
      gallery: { x: 30, y: 40, zoom: 1.2 },
      "gallery:11": { x: 50, y: 50, zoom: 1 },
      "gallery:12": { x: 50, y: 50, zoom: 1 },
      unrecognized: { x: 50, y: 50, zoom: 1 },
    });
    expect(JSON.parse(sanitizeImagePositionMap(raw, new Set(["heroImage"]), new Set(["gallery"])))).toEqual({
      heroImage: { x: 10, y: 20, zoom: 1 },
      "gallery:11": { x: 50, y: 50, zoom: 1 },
    });
  });
});
