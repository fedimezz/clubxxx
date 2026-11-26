import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_IDS } from "@/lib/website-themes";
import { THEME_EXAMPLE_PROMPTS, themeExampleImage } from "@/lib/theme-example-images";
import { PAGE_CONTENT_SCHEMA } from "@/lib/page-content-schema";

describe("theme example images", () => {
  it("ships a vector example for every one of the nine themes", () => {
    expect(THEME_IDS).toHaveLength(9);
    for (const id of THEME_IDS) {
      expect(existsSync(join(process.cwd(), "public", "themes", `${id}.svg`)), id).toBe(true);
      expect(THEME_EXAMPLE_PROMPTS[id].length).toBeGreaterThan(20);
    }
  });

  it("resolves the example for the current theme id and for legacy ids", () => {
    expect(themeExampleImage("neon-purple")).toEqual({ photo: "/themes/neon-purple.jpg", art: "/themes/neon-purple.svg" });
    expect(themeExampleImage("boxing").art).toBe("/themes/boxing-mma.svg");
    expect(themeExampleImage(null).art).toMatch(/^\/themes\/[a-z-]+\.svg$/);
  });

  it("exposes the home hero photo as an owner-editable image slot (Image Studio target)", () => {
    const home = PAGE_CONTENT_SCHEMA.find((page) => page.pageKey === "home");
    const field = home?.fields.find((item) => item.key === "heroImage");
    expect(field?.type).toBe("image");
  });
});
