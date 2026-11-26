import { describe, it, expect } from "vitest";
import { THEME_PRESETS, HERO_MODELS, SELECTABLE_THEME_PRESETS, isSelectableThemeId } from "@/lib/website-themes";

describe("themes and standard 3D models are included in every plan", () => {
  it("has no paid flag on any theme or model", () => {
    expect(THEME_PRESETS.some((t) => "premium" in t)).toBe(false);
    expect(HERO_MODELS.some((m) => "premium" in m)).toBe(false);
  });

  it("offers exactly the nine current designs and keeps previous IDs as aliases", () => {
    expect(SELECTABLE_THEME_PRESETS.map((theme) => theme.id)).toEqual([
      "modern-fitness", "premium-glass", "energetic-red", "clean-minimal", "boxing-mma",
      "nature-wellness", "neon-purple", "classic-elegant", "bold-black-yellow",
    ]);
    expect(SELECTABLE_THEME_PRESETS).toHaveLength(9);
    for (const id of ["gold", "cyber", "aurora"]) expect(isSelectableThemeId(id)).toBe(true);
  });

  it("still contains the formerly premium 3D models", () => {
    const ids = HERO_MODELS.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["crown", "diamond", "gold-dumbbell"]));
  });
});
