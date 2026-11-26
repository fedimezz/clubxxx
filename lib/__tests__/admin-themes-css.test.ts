import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_IDS } from "@/lib/website-themes";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const adminCss = read("app/admin/admin-themes.css");
const identityCss = read("app/themes-identity.css");

describe("owner dashboard themes", () => {
  it.each(THEME_IDS)("gives %s a light and a dark dashboard palette", (id) => {
    expect(adminCss).toMatch(new RegExp(`\\.clubx-admin\\[data-admin-theme="${id}"\\]\\s*\\{[^}]*--primary:[^}]*--glow:|\\.clubx-admin\\[data-admin-theme="${id}"\\]\\s*\\{[^}]*--glow:[^}]*--primary:`));
    expect(adminCss).toMatch(new RegExp(`\\.dark \\.clubx-admin\\[data-admin-theme="${id}"\\]\\s*\\{[^}]*--primary:`));
  });

  it("gives every theme its own sidebar identity (background + active style)", () => {
    for (const id of THEME_IDS) {
      const block = adminCss.split(`.clubx-admin[data-admin-theme="${id}"] {`)[1]?.split("}")[0] ?? "";
      expect(block, id).toContain("--adm-side-bg:");
      expect(block, id).toContain("--adm-nav-active-bg:");
    }
    const sidebars = THEME_IDS.map((id) => (adminCss.split(`.clubx-admin[data-admin-theme="${id}"] {`)[1]?.split("}")[0] ?? "").match(/--adm-side-bg:([\s\S]*?);\n/)?.[1]?.trim());
    expect(new Set(sidebars).size).toBe(9);
  });

  it("is attached to the real admin shell and follows the club's resolved website theme", () => {
    const layout = read("app/admin/layout.tsx");
    expect(layout).toContain('import "./admin-themes.css"');
    expect(layout).toContain("useClubSettings");
    expect(layout).toContain("data-admin-theme={themeId}");
  });

  it("only restyles: no theme rule hides, replaces or disables admin modules", () => {
    // Decorative pseudo-elements (e.g. the ring rope under the header) may ignore pointer events.
    const withoutPseudo = adminCss.replace(/[^{}]*::(?:before|after)\s*\{[^}]*\}/g, "");
    expect(withoutPseudo).not.toMatch(/display:\s*none/);
    expect(withoutPseudo).not.toMatch(/pointer-events:\s*none/);
    expect(withoutPseudo).not.toMatch(/visibility:\s*hidden/);
  });
});

describe("public footer themes", () => {
  it.each(THEME_IDS)("styles the footer for %s", (id) => {
    expect(identityCss).toContain(`[data-site-theme="${id}"] .theme-footer`);
  });
  it("no longer hard-codes the emerald brand colour", () => {
    expect(read("components/layout/Footer.tsx")).not.toMatch(/emerald-/);
  });
});
