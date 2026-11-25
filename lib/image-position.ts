import { MAX_GALLERY_IMAGES } from "@/lib/page-content-schema";

export const IMAGE_POSITION_MAP_KEY = "__imagePositions";

export interface ImagePosition {
  x: number;
  y: number;
  zoom: number;
}

export const DEFAULT_IMAGE_POSITION: ImagePosition = { x: 50, y: 50, zoom: 1 };

export function imagePositionKey(fieldKey: string, index?: number): string {
  return index === undefined ? fieldKey : `${fieldKey}:${index}`;
}

export function parseImagePositionMap(value: unknown): Record<string, ImagePosition> {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const positions: Record<string, ImagePosition> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*(?::\d+)?$/.test(key) || key === "__proto__") continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const position = value as Partial<ImagePosition>;
    if (
      typeof position.x !== "number" || !Number.isFinite(position.x) || position.x < 0 || position.x > 100 ||
      typeof position.y !== "number" || !Number.isFinite(position.y) || position.y < 0 || position.y > 100 ||
      typeof position.zoom !== "number" || !Number.isFinite(position.zoom) || position.zoom < 1 || position.zoom > 2
    ) continue;
    positions[key] = {
      x: Math.round(position.x),
      y: Math.round(position.y),
      zoom: Math.round(position.zoom * 100) / 100,
    };
  }
  return positions;
}

export function sanitizeImagePositionMap(
  value: unknown,
  imageKeys: ReadonlySet<string>,
  galleryKeys: ReadonlySet<string>,
): string {
  const positions = parseImagePositionMap(value);
  const allowed: Record<string, ImagePosition> = {};
  for (const [key, position] of Object.entries(positions)) {
    if (imageKeys.has(key)) {
      allowed[key] = position;
      continue;
    }
    const separator = key.lastIndexOf(":");
    if (separator < 0 || !galleryKeys.has(key.slice(0, separator))) continue;
    const index = Number(key.slice(separator + 1));
    if (Number.isInteger(index) && index >= 0 && index < MAX_GALLERY_IMAGES) {
      allowed[key] = position;
    }
  }
  return JSON.stringify(allowed);
}
