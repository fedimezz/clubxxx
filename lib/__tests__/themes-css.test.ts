// Static guard: all nine selectable themes define tokens and unique navigation.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { THEME_IDS, THEME_PRESETS } from "../website-themes";

const css = readFileSync(path.resolve(import.meta.dirname, "../../app/themes.css"), "utf8");
const identity = readFileSync(path.resolve(import.meta.dirname, "../../app/themes-identity.css"), "utf8");

describe("themes.css", () => {
  it.each(THEME_IDS)("defines tokens for theme %s", (id) => {
    expect(css).toMatch(new RegExp(`\\[data-site-theme="${id}"\\]\\s*\\{[^}]*--t-heading-font`));
  });

  it("has a hero backdrop class for every layout", () => {
    for (const layout of new Set(THEME_PRESETS.map((t) => t.layout))) {
      expect(css, layout).toContain(`.hero-${layout}`);
    }
  });

  it("uses a distinct entrance animation for every theme", () => {
    const currentThemesCss = css.slice(css.indexOf("/* ── Current nine selectable identities"));
    const animations = THEME_PRESETS.map((theme) => {
      const start = currentThemesCss.indexOf(`[data-site-theme="${theme.id}"]`);
      const end = currentThemesCss.indexOf("}", start);
      const rule = start >= 0 && end >= 0 ? currentThemesCss.slice(start, end) : "";
      return rule.split("--t-reveal:")[1]?.split(";")[0].trim();
    });
    expect(animations.every(Boolean)).toBe(true);
    expect(new Set(animations).size).toBe(9);
  });

  it("defines unique public navigation variants for all nine themes", () => {
    expect(new Set(THEME_PRESETS.map((theme) => theme.nav)).size).toBe(9);
    for (const theme of THEME_PRESETS) expect(identity).toContain(`[data-nav="${theme.nav}"]`);
  });

  it("provides a desktop sidebar and a responsive mobile navigation for every theme", () => {
    for (const theme of THEME_PRESETS) {
      expect(identity).toContain(`[data-site-theme="${theme.id}"] .nav-links`);
      expect(identity).toContain(`[data-mobile-navigation="${theme.id}"]`);
    }
  });

  it("imports a font file for every added heading font", () => {
    for (const pkg of ["playfair-display", "orbitron", "oswald", "archivo-black"]) expect(css).toContain(`@fontsource/${pkg}/`);
  });

  it("switches off the new looping animations for prefers-reduced-motion", () => {
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    for (const cls of [".neon-floor", ".neon-glow", ".salon-gold"]) expect(reduced).toContain(cls);
  });
});
