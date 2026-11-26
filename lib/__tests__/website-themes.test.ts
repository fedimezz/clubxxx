import { describe, it, expect } from "vitest";
import {
  THEME_IDS,
  THEME_PRESETS,
  SELECTABLE_THEME_PRESETS,
  HERO_MODELS,
  HERO_MODEL_IDS,
  DEFAULT_THEME_ID,
  resolveThemeId,
  resolveHeroModel,
  getTheme,
  matchingThemeId,
  isHeroModelId,
  isKnownThemeId,
  isSelectableThemeId,
} from "../website-themes";

const REQUESTED_THEME_IDS = [
  "modern-fitness",
  "premium-glass",
  "energetic-red",
  "clean-minimal",
  "boxing-mma",
  "nature-wellness",
  "neon-purple",
  "classic-elegant",
  "bold-black-yellow",
];

describe("website themes", () => {
  it("offers exactly the nine requested themes", () => {
    expect([...THEME_IDS]).toEqual(REQUESTED_THEME_IDS);
    expect(THEME_PRESETS.map((theme) => theme.id)).toEqual(REQUESTED_THEME_IDS);
    expect(SELECTABLE_THEME_PRESETS).toHaveLength(9);
    expect(THEME_PRESETS.every((theme) => theme.flagship)).toBe(true);
    expect(THEME_PRESETS.some((theme) => "premium" in theme)).toBe(false);
  });

  it("gives every theme a distinct layout, navigation, pricing style, font and color pair", () => {
    for (const key of ["layout", "nav", "pricing", "headingFont"] as const) {
      expect(new Set(THEME_PRESETS.map((theme) => theme[key])).size, key).toBe(9);
    }
    expect(new Set(THEME_PRESETS.map((theme) => `${theme.primaryColor}|${theme.secondaryColor}`)).size).toBe(9);
    for (const theme of THEME_PRESETS) {
      expect(theme.primaryColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.secondaryColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(HERO_MODEL_IDS).toContain(theme.defaultHeroModel);
    }
  });

  it("keeps every previous theme id valid as an alias to one of the nine current designs", () => {
    const legacyIds = [
      "musculation", "crossfit", "boxing", "yoga", "modern", "luxury", "neon", "powerlifting", "urban",
      "minimalist", "monochrome", "sunset", "ocean", "royal", "forest", "gold", "cyber", "aurora",
      "classic", "energetic", "nature", "midnight", "minimal", "custom",
    ];
    for (const id of legacyIds) {
      expect(isKnownThemeId(id), id).toBe(true);
      expect(REQUESTED_THEME_IDS).toContain(resolveThemeId(id));
    }
    for (const id of REQUESTED_THEME_IDS) expect(resolveThemeId(id)).toBe(id);
    expect(resolveThemeId(null)).toBe(DEFAULT_THEME_ID);
    expect(resolveThemeId("<script>")).toBe(DEFAULT_THEME_ID);
    expect(isSelectableThemeId("not-a-theme")).toBe(false);
    expect(getTheme("luxury").name).toBe("Luxury Club");
    expect(getTheme("neon").name).toBe("Neon Performance");
    // The nine identities follow the reference board (public site + owner dashboard).
    expect(THEME_PRESETS.map((t) => t.name)).toEqual([
      "Musculation", "Fitness Moderne", "CrossFit", "Minimal Elite", "Boxing & MMA",
      "Yoga & Bien-être", "Neon Performance", "Luxury Club", "Urban Street",
    ]);
    expect(resolveThemeId("sporty-dark-blue")).toBe("boxing-mma");
    expect(resolveThemeId("boxing")).toBe("boxing-mma");
  });

  it("keeps the built-in 3D model catalogue intact and independent of theme IDs", () => {
    expect(HERO_MODEL_IDS).toHaveLength(20);
    expect(HERO_MODELS.map((model) => model.id)).toEqual([...HERO_MODEL_IDS]);
    for (const required of ["dumbbell", "dumbbell-classic", "kettlebell", "barbell", "boxing-glove"]) {
      expect(HERO_MODEL_IDS).toContain(required);
    }
    expect(isHeroModelId("barbell")).toBe(true);
    expect(isHeroModelId("rocket")).toBe(false);
  });

  it("uses the chosen 3D model or the selected theme's default", () => {
    expect(resolveHeroModel("boxing-mma", "kettlebell")).toBe("kettlebell");
    expect(resolveHeroModel("energetic-red", null)).toBe("stopwatch");
    expect(resolveHeroModel("energetic-red", "not-a-model")).toBe("stopwatch");
  });

  it("matches the new preset colors", () => {
    const preset = THEME_PRESETS[0];
    expect(matchingThemeId(preset.primaryColor, preset.secondaryColor)).toBe(preset.id);
    expect(matchingThemeId("#000001", "#000002")).toBe("custom");
  });
});
