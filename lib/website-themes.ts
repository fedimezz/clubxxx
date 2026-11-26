// lib/website-themes.ts
//
// The nine website themes a club owner can pick (website wizard + /admin/appearance),
// and the 3D hero objects they can choose from. Old saved theme IDs remain supported
// through aliases. A theme is NOT just a color
// pair: it selects a complete visual identity — layout, navigation, typography, section
// styling, motion and a default 3D hero object — implemented by
// components/themes/* and app/themes.css (keyed by `data-site-theme`).
// Picking one also stages its default primary/secondary colors, which the owner
// can then override (branding) — the chosen colors always win over the preset.
//
// Pure data, no server-only imports — safe to import from client components,
// API routes and the validation layer.

export const THEME_IDS = [
  "modern-fitness",
  "premium-glass",
  "energetic-red",
  "clean-minimal",
  "boxing-mma",
  "nature-wellness",
  "neon-purple",
  "classic-elegant",
  "bold-black-yellow",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const HERO_MODEL_IDS = [
  "dumbbell",
  "kettlebell",
  "barbell",
  "boxing-glove",
  "weight-plate",
  "medicine-ball",
  "punching-bag",
  "zen-stones",
  // second batch
  "trophy",
  "stopwatch",
  "protein-shaker",
  "yoga-mat",
  "plyo-box",
  "jump-rope",
  "lotus",
  "gym-rings",
  // third batch: the club's original 3D dumbbell (public/models/dumbbell.glb)
  "dumbbell-classic",
  // formerly "premium": now included in every plan
  "crown",
  "diamond",
  "gold-dumbbell",
] as const;
export type HeroModelId = (typeof HERO_MODEL_IDS)[number];

export interface HeroModelInfo {
  id: HeroModelId;
  name: string;
  description: string;
}

export const HERO_MODELS: HeroModelInfo[] = [
  { id: "dumbbell", name: "Haltère", description: "Le classique du fitness." },
  { id: "kettlebell", name: "Kettlebell", description: "Force et explosivité." },
  { id: "barbell", name: "Barre olympique", description: "Barre chargée de disques." },
  { id: "boxing-glove", name: "Gant de boxe", description: "Pour les clubs de combat." },
  { id: "weight-plate", name: "Disque de musculation", description: "Fonte brute, look atelier." },
  { id: "medicine-ball", name: "Médecine-ball", description: "Cross-training et cardio." },
  { id: "punching-bag", name: "Sac de frappe", description: "Boxe, MMA, cardio-boxe." },
  { id: "zen-stones", name: "Pierres zen", description: "Yoga, pilates, bien-être." },
  { id: "trophy", name: "Trophée", description: "Compétition, club premium." },
  { id: "stopwatch", name: "Chronomètre", description: "Performance et haute intensité." },
  { id: "protein-shaker", name: "Shaker protéiné", description: "Nutrition et musculation." },
  { id: "yoga-mat", name: "Tapis de yoga", description: "Yoga, pilates, stretching." },
  { id: "plyo-box", name: "Box de pliométrie", description: "Cross-training et jumps." },
  { id: "jump-rope", name: "Corde à sauter", description: "Cardio et boxe." },
  { id: "lotus", name: "Fleur de lotus", description: "Bien-être et sérénité." },
  { id: "gym-rings", name: "Anneaux de gym", description: "Street workout, calisthénie." },
  { id: "dumbbell-classic", name: "Haltère d'origine", description: "Le modèle 3D historique de ClubX, tel qu'il était." },
  { id: "crown", name: "Couronne dorée", description: "club d'élite, champions." },
  { id: "diamond", name: "Diamant", description: "facettes brillantes, club haut de gamme." },
  { id: "gold-dumbbell", name: "Haltère en or", description: "l'haltère signature, finition or." },
];

export type ThemeLayout =
  | "forge"
  | "arena"
  | "ring"
  | "studio"
  | "bento"
  | "salon"
  | "grid"
  | "platform"
  | "street"
  | "editorial"
  | "private";

export const THEME_CATEGORIES = [
  { id: "force", label: "Sport de force" },
  { id: "combat", label: "Combat" },
  { id: "bienetre", label: "Bien-être" },
  { id: "moderne", label: "Moderne" },
  { id: "luxe", label: "Luxe" },
  { id: "urbain", label: "Urbain" },
] as const;
export type ThemeCategory = (typeof THEME_CATEGORIES)[number]["id"];

export interface ThemePreset {
  id: ThemeId;
  name: string;
  description: string;
  /** Which page layout (components/themes) renders the club's home. */
  layout: ThemeLayout;
  primaryColor: string;
  secondaryColor: string;
  // Used for the picker's mini "browser" preview background, so a light
  // theme doesn't render dark text on a dark card and vice versa.
  previewBg: string;
  previewText: string;
  defaultHeroModel: HeroModelId;
  /** Display typography (loaded from self-hosted @fontsource files in app/themes.css). */
  headingFont: string;
  bodyFont: string;
  /** One of the nine themes offered in the picker. */
  flagship: boolean;
  /** Filter chip in the theme picker. */
  category: ThemeCategory;
  /** Extra search words (French, lower-case) for the picker's search box. */
  keywords: string[];
  /** Short mood line shown on the big preview card ("Industriel · Acier · Rouge"). */
  mood: string;
  /** How the public navigation bar is built for this theme (components/layout/Navbar.tsx + app/themes-identity.css). */
  nav: string;
  /** How the formulas / prices are presented on the home page (components/home/PricingVariants.tsx). */
  pricing: string;
  /**
   * Retired from NEW choices (near-duplicate of another theme). Clubs already using it keep it —
   * it still renders, resolves and passes validation when unchanged — but pickers hide it and
   * onboarding / design-change requests refuse it.
   */
  retired?: boolean;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "modern-fitness",
    name: "Musculation",
    description: "Fonte, acier et puissance brute : un club de musculation industriel et moderne.",
    layout: "forge",
    primaryColor: "#22c55e",
    secondaryColor: "#15803d",
    previewBg: "#0b120d",
    previewText: "#f0fdf4",
    defaultHeroModel: "dumbbell",
    headingFont: "Oswald",
    bodyFont: "Inter",
    flagship: true,
    category: "force",
    keywords: ["musculation","fitness","force","powerlifting","fonte","vert","emeraude","moderne"],
    mood: "Industriel · Puissant · Moderne",
    nav: "steel-bar",
    pricing: "plates",
  },
  {
    id: "premium-glass",
    name: "Fitness Moderne",
    description: "Moderne, universel et épuré : verre dépoli, bleu vif et repères de progression pour tous les clubs.",
    layout: "bento",
    primaryColor: "#2563eb",
    secondaryColor: "#38bdf8",
    previewBg: "#f4f8ff",
    previewText: "#101c33",
    defaultHeroModel: "diamond",
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
    flagship: true,
    category: "moderne",
    keywords: ["moderne","fitness","universel","epure","bleu","verre","glass","personal training"],
    mood: "Moderne · Universel · Épuré",
    nav: "glass-pill",
    pricing: "bento-tiles",
  },
  {
    id: "energetic-red",
    name: "CrossFit",
    description: "Athlétique, dynamique et intense : WOD, chrono et énergie de box pour un club de cross-training.",
    layout: "arena",
    primaryColor: "#dc2626",
    secondaryColor: "#f97316",
    previewBg: "#1b1011",
    previewText: "#fff7f7",
    defaultHeroModel: "stopwatch",
    headingFont: "Bebas Neue",
    bodyFont: "Barlow",
    flagship: true,
    category: "force",
    keywords: ["crossfit","wod","cross-training","hiit","rouge","intense","fonctionnel"],
    mood: "Athlétique · Dynamique · Intense",
    nav: "wod-ticker",
    pricing: "scoreboard",
  },
  {
    id: "clean-minimal",
    name: "Minimal Elite",
    description: "Minimal, sophistiqué et élégant : noir, blanc et typographie nette pour un club haut de gamme discret.",
    layout: "editorial",
    primaryColor: "#18181b",
    secondaryColor: "#a1a1aa",
    previewBg: "#ffffff",
    previewText: "#0a0a0a",
    defaultHeroModel: "dumbbell-classic",
    headingFont: "Inter",
    bodyFont: "Inter",
    flagship: true,
    category: "moderne",
    keywords: ["minimal","elite","epure","blanc","noir","sobre","premium","sophistique"],
    mood: "Minimal · Sophistiqué · Élégant",
    nav: "editorial-line",
    pricing: "typographic",
  },
  {
    id: "boxing-mma",
    name: "Boxing & MMA",
    description: "Compétitif, énergique et audacieux : ring, projecteurs et cordes pour un club de boxe, MMA et sports de combat.",
    layout: "ring",
    primaryColor: "#d41f2d",
    secondaryColor: "#f5f5f4",
    previewBg: "#0a0807",
    previewText: "#fafaf9",
    defaultHeroModel: "boxing-glove",
    headingFont: "Barlow Condensed",
    bodyFont: "Barlow",
    flagship: true,
    category: "combat",
    keywords: ["boxe","boxing","mma","combat","ring","gant","rouge","self-defense"],
    mood: "Compétitif · Énergie · Audacieux",
    nav: "ring-center",
    pricing: "fight-card",
  },
  {
    id: "nature-wellness",
    name: "Yoga & Bien-être",
    description: "Naturel, paisible et élégant : arches douces, lumière calme et tons d'olive pour yoga, pilates et bien-être.",
    layout: "studio",
    primaryColor: "#6f8f4e",
    secondaryColor: "#c4a982",
    previewBg: "#f5f3e9",
    previewText: "#27342b",
    defaultHeroModel: "zen-stones",
    headingFont: "Nunito Sans",
    bodyFont: "Nunito Sans",
    flagship: true,
    category: "bienetre",
    keywords: ["yoga","pilates","bien-etre","meditation","nature","olive","zen","relaxation"],
    mood: "Naturel · Paisible · Élégant",
    nav: "floating-pill",
    pricing: "soft-cards",
  },
  {
    id: "neon-purple",
    name: "Neon Performance",
    description: "Futuriste et technologique : néons violets, grille HUD et lumière de club nocturne pour la performance.",
    layout: "grid",
    primaryColor: "#a855f7",
    secondaryColor: "#22d3ee",
    previewBg: "#10091f",
    previewText: "#f5edff",
    defaultHeroModel: "diamond",
    headingFont: "Orbitron",
    bodyFont: "Inter",
    flagship: true,
    category: "moderne",
    keywords: ["neon","futuriste","technologie","violet","cyber","performance","nuit"],
    mood: "Futuriste · Technologie · Performance",
    nav: "hud",
    pricing: "console-list",
  },
  {
    id: "classic-elegant",
    name: "Luxury Club",
    description: "Exclusif, premium et élégant : or champagne, serif et ornements pour un club de prestige.",
    layout: "salon",
    primaryColor: "#c9a24b",
    secondaryColor: "#5b4636",
    previewBg: "#17130f",
    previewText: "#f8f0df",
    defaultHeroModel: "trophy",
    headingFont: "Playfair Display",
    bodyFont: "Inter",
    flagship: true,
    category: "luxe",
    keywords: ["luxe","luxury","premium","or","prestige","exclusif","spa","elegant"],
    mood: "Exclusif · Premium · Élégant",
    nav: "centered-serif",
    pricing: "engraved",
  },
  {
    id: "bold-black-yellow",
    name: "Urban Street",
    description: "Street, énergique et jeune : noir, jaune et textures de béton pour un club urbain et communautaire.",
    layout: "street",
    primaryColor: "#facc15",
    secondaryColor: "#18181b",
    previewBg: "#111113",
    previewText: "#fafafa",
    defaultHeroModel: "punching-bag",
    headingFont: "Archivo Black",
    bodyFont: "Barlow",
    flagship: true,
    category: "urbain",
    keywords: ["urban","street","urbain","jaune","communaute","calisthenie","jeune"],
    mood: "Street · Énergique · Jeune",
    nav: "tape",
    pricing: "stickers",
  },
];

// Previous theme IDs remain valid in saved settings and design requests, but
// resolve to one of the nine current designs and are never offered as choices.
const LEGACY_THEME_ALIASES: Record<string, ThemeId> = {
  musculation: "modern-fitness",
  crossfit: "energetic-red",
  boxing: "boxing-mma",
  "sporty-dark-blue": "boxing-mma",
  yoga: "nature-wellness",
  modern: "premium-glass",
  luxury: "classic-elegant",
  neon: "neon-purple",
  powerlifting: "modern-fitness",
  urban: "bold-black-yellow",
  minimalist: "clean-minimal",
  monochrome: "clean-minimal",
  sunset: "energetic-red",
  ocean: "nature-wellness",
  royal: "classic-elegant",
  forest: "nature-wellness",
  gold: "classic-elegant",
  cyber: "neon-purple",
  aurora: "premium-glass",
  classic: "premium-glass",
  energetic: "energetic-red",
  nature: "nature-wellness",
  midnight: "premium-glass",
  minimal: "clean-minimal",
  custom: "premium-glass",
};

export const DEFAULT_THEME_ID: ThemeId = "premium-glass";

/** A current theme id OR a legacy id that still resolves (saved preferences keep working). */
export function isKnownThemeId(value: unknown): value is string {
  return typeof value === "string" && (isThemeId(value) || Object.prototype.hasOwnProperty.call(LEGACY_THEME_ALIASES, value));
}

/** Presets offered in pickers: everything except retired duplicates. */
export const SELECTABLE_THEME_PRESETS: ThemePreset[] = THEME_PRESETS.filter((t) => !t.retired);

/** For NEW choices (onboarding, design-change requests): a known theme that is not retired. */
export function isSelectableThemeId(value: unknown): value is string {
  return isKnownThemeId(value) && !THEME_PRESETS.some((t) => t.retired && t.id === resolveThemeId(value));
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

/**
 * What the owner picked for the homepage 3D slot: one of the built-in objects,
 * their own uploaded model ("custom"), or no 3D object at all ("none").
 * Stored in GymSettings.heroModel (null = the theme's default built-in object).
 */
export const HERO_SPECIAL_CHOICES = ["custom", "none"] as const;
export type HeroChoice = HeroModelId | (typeof HERO_SPECIAL_CHOICES)[number];

export function isHeroChoice(value: unknown): value is HeroChoice {
  return isHeroModelId(value) || (typeof value === "string" && (HERO_SPECIAL_CHOICES as readonly string[]).includes(value));
}

export function resolveHeroChoice(themeId: string | null | undefined, heroModel: string | null | undefined): HeroChoice {
  return isHeroChoice(heroModel) ? heroModel : getTheme(themeId).defaultHeroModel;
}

export function isHeroModelId(value: unknown): value is HeroModelId {
  return typeof value === "string" && (HERO_MODEL_IDS as readonly string[]).includes(value);
}

/** Any stored/unknown theme id → a valid ThemeId (legacy ids are mapped, unknown → default). */
export function resolveThemeId(themeId: string | null | undefined): ThemeId {
  if (isThemeId(themeId)) return themeId;
  if (themeId && LEGACY_THEME_ALIASES[themeId]) return LEGACY_THEME_ALIASES[themeId];
  return DEFAULT_THEME_ID;
}

export function getTheme(themeId: string | null | undefined): ThemePreset {
  const id = resolveThemeId(themeId);
  return THEME_PRESETS.find((t) => t.id === id) as ThemePreset;
}

export function findTheme(themeId: string | null | undefined): ThemePreset | null {
  if (!themeId) return null;
  return getTheme(themeId);
}

/** The owner's chosen model, or the theme's default when none (or an unknown one) is stored. */
export function resolveHeroModel(themeId: string | null | undefined, heroModel: string | null | undefined): HeroModelId {
  return isHeroModelId(heroModel) ? heroModel : getTheme(themeId).defaultHeroModel;
}

/** True when the given colors still match one of the presets exactly. */
export function matchingThemeId(primaryColor: string | null, secondaryColor: string | null): string {
  const match = THEME_PRESETS.find(
    (t) =>
      t.primaryColor.toLowerCase() === (primaryColor ?? "").toLowerCase() &&
      t.secondaryColor.toLowerCase() === (secondaryColor ?? "").toLowerCase()
  );
  return match?.id ?? "custom";
}
