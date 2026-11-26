// lib/theme-example-images.ts
//
// Example hero imagery shipped with each of the nine website themes. It is shown on the
// club's home page ONLY until the owner sets their own "bannière d'accueil" photo in the
// Image Studio (upload or AI generation). It is decorative theme artwork — never club data.
//
//   /themes/<id>.jpg  photo-style example (create it once with `npm run themes:photos`)
//   /themes/<id>.svg  vector fallback that always ships with the app
//
// The photo is tried first; if the file does not exist the SVG is used (HeroPhoto handles onError).
import { THEME_IDS, getTheme } from "@/lib/website-themes";

export interface ThemeExampleImage {
  photo: string;
  art: string;
}

export function themeExampleImage(themeId: string | null | undefined): ThemeExampleImage {
  const id = getTheme(themeId).id;
  return { photo: `/themes/${id}.jpg`, art: `/themes/${id}.svg` };
}

export const THEME_EXAMPLE_IMAGE_IDS = THEME_IDS;

/** Prompts used by scripts/generate-theme-photos.ts (and good starting points in the Image Studio). */
export const THEME_EXAMPLE_PROMPTS: Record<(typeof THEME_IDS)[number], string> = {
  // Musculation
  "modern-fitness": "A muscular bodybuilder in a black industrial gym lifting a heavy dumbbell, emerald green accent lighting, dramatic side light, chrome plates, cinematic.",
  // Fitness Moderne
  "premium-glass": "A fit woman in sportswear holding a water bottle in a bright modern fitness club, deep blue and cyan lighting, clean contemporary interior, confident pose.",
  // CrossFit
  "energetic-red": "A strong woman climbing a rope in a CrossFit box with red lighting, dark gym, chalk dust, intense motion, powerful and dynamic.",
  // Minimal Elite
  "clean-minimal": "Profile portrait of a toned woman in black sportswear against a pure white studio background, high-key minimalist photography, elegant and sophisticated.",
  // Boxing & MMA
  "boxing-mma": "A shirtless boxer in red boxing gloves in a spotlit ring with red lighting and smoke, dark background, fierce expression, cinematic combat sports poster.",
  // Yoga & Bien-être
  "nature-wellness": "A woman meditating in lotus position on a yoga mat in a bright airy studio, large plants, warm natural light, olive green and cream tones, calm and peaceful.",
  // Neon Performance
  "neon-purple": "A fit athlete crouching with headphones and a shaker in a futuristic gym lit by violet and magenta neon, dark background, high-tech atmosphere.",
  // Luxury Club
  "classic-elegant": "A luxurious dark private fitness club interior with gold accent lighting, polished equipment, warm amber glow, marble and dark wood, premium and exclusive.",
  // Urban Street
  "bold-black-yellow": "A man in a hoodie with a gym bag in front of a concrete graffiti wall with bold yellow paint, urban street workout vibe, gritty and energetic.",
};
