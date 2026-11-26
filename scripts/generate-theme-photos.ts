// scripts/generate-theme-photos.ts
//
// One-time helper: creates a photo-style example hero image for each of the nine website
// themes with the OpenAI Images API and saves them as public/themes/<theme-id>.jpg.
// The app falls back to the bundled public/themes/<theme-id>.svg for any missing file.
//
//   OPENAI_API_KEY=sk-...  npm run themes:photos            # all nine (skips existing files)
//   OPENAI_API_KEY=sk-...  npm run themes:photos -- --force # regenerate all
//   OPENAI_API_KEY=sk-...  npm run themes:photos -- neon-purple clean-minimal
//
// Cost: nine "medium" 1536x1024 images (a few cents each). Commit the resulting .jpg files.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { THEME_EXAMPLE_PROMPTS } from "../lib/theme-example-images";

const OUT_DIR = join(process.cwd(), "public", "themes");
const MODEL = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.5-flare";
const BASE = "Realistic professional photo for a sports club website hero banner, wide composition with empty space on the left for a headline. No text, no logos, no watermarks.";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set. Export it in this shell first (never commit it).");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const wanted = args.filter((a) => !a.startsWith("--"));
  const ids = (Object.keys(THEME_EXAMPLE_PROMPTS) as (keyof typeof THEME_EXAMPLE_PROMPTS)[])
    .filter((id) => wanted.length === 0 || wanted.includes(id));
  if (ids.length === 0) {
    console.error(`Unknown theme id. Valid: ${Object.keys(THEME_EXAMPLE_PROMPTS).join(", ")}`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  for (const id of ids) {
    const file = join(OUT_DIR, `${id}.jpg`);
    if (!force && existsSync(file)) {
      console.log(`skip   ${id} (exists — use --force to regenerate)`);
      continue;
    }
    process.stdout.write(`create ${id} ... `);
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        prompt: `${BASE} ${THEME_EXAMPLE_PROMPTS[id]}`,
        size: "1536x1024",
        quality: "medium",
        output_format: "jpeg",
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`failed (${response.status}) ${detail.slice(0, 300)}`);
      process.exitCode = 1;
      continue;
    }
    const json = (await response.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) {
      console.error("failed (no image returned)");
      process.exitCode = 1;
      continue;
    }
    writeFileSync(file, Buffer.from(b64, "base64"));
    console.log("ok");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
