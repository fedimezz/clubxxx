// lib/website-themes.ts
//
// The 15 website themes a club owner can pick (website wizard + /admin/appearance),
// and the 3D hero objects they can choose from. The first five are the original
// themes (ids and saved preferences unchanged); the last five were added later. A theme is NOT just a color
// pair: it selects a complete visual identity — layout, typography, section
// styling, motion and a default 3D hero object — implemented by
// components/themes/* and app/themes.css (keyed by `data-site-theme`).
// Picking one also stages its default primary/secondary colors, which the owner
// can then override (branding) — the chosen colors always win over the preset.
//
// Pure data, no server-only imports — safe to import from client components,
// API routes and the validation layer.

export const THEME_IDS = [
  "musculation",
  "crossfit",
  "boxing",
  "yoga",
  "modern",
  // added themes
  "luxury",
  "neon",
  "powerlifting",
  "urban",
  "minimalist",
  // ClubX additions
  "monochrome",
  "sunset",
  "ocean",
  "royal",
  "forest",
  // formerly "premium": now included in every plan
  "gold",
  "cyber",
  "aurora",
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
  { id: "dumbbell-classic", name: "Haltère d'origine", description: "Le modèle 3D historique de ClubX, tel qu'il était." },
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
  /** One of the nine flagship themes shown first in the picker (the others live under "Autres thèmes"). */
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
    id: "musculation",
    name: "Musculation",
    description: "Industriel : acier brossé, fonte et typographie massive pour les salles de force et de bodybuilding.",
    layout: "forge",
    primaryColor: "#dc2626",
    secondaryColor: "#78716c",
    previewBg: "#111111",
    previewText: "#fafaf9",
    defaultHeroModel: "barbell",
    headingFont: "Anton",
    bodyFont: "Inter",
    flagship: true,
    category: "force",
    keywords: ["muscu","bodybuilding","fonte","haltères","force","industriel","acier"],
    mood: "Industriel · Acier · Rouge",
    nav: "steel-bar",
    pricing: "plates",
  },
  {
    id: "crossfit",
    name: "CrossFit",
    description: "Tableau WOD, diagonales et chronos : l'énergie brute d'une box de cross-training.",
    layout: "arena",
    primaryColor: "#f97316",
    secondaryColor: "#fbbf24",
    previewBg: "#1f1f23",
    previewText: "#fafafa",
    defaultHeroModel: "kettlebell",
    headingFont: "Barlow Condensed",
    bodyFont: "Barlow",
    flagship: true,
    category: "force",
    keywords: ["crossfit","wod","cross-training","box","hiit","orange"],
    mood: "WOD · Diagonales · Orange",
    nav: "wod-ticker",
    pricing: "scoreboard",
  },
  {
    id: "boxing",
    name: "Boxing & MMA",
    description: "Cinématique et sans compromis : noir profond, rouge sang et ambiance de combat.",
    layout: "ring",
    primaryColor: "#dc2626",
    secondaryColor: "#fafafa",
    previewBg: "#0c0a09",
    previewText: "#fafaf9",
    defaultHeroModel: "boxing-glove",
    headingFont: "Bebas Neue",
    bodyFont: "Inter",
    flagship: true,
    category: "combat",
    keywords: ["boxe","mma","combat","ring","fight","cinéma","rouge"],
    mood: "Cinématique · Noir · Rouge",
    nav: "ring-center",
    pricing: "fight-card",
  },
  {
    id: "yoga",
    name: "Yoga & Bien-être",
    description: "Calme et aéré : ivoire, vert sauge et typographie douce pour le yoga et le bien-être.",
    layout: "studio",
    primaryColor: "#5f8a6b",
    secondaryColor: "#c9b79c",
    previewBg: "#f8f4ec",
    previewText: "#2b2a28",
    defaultHeroModel: "zen-stones",
    headingFont: "Nunito Sans",
    bodyFont: "Nunito Sans",
    flagship: true,
    category: "bienetre",
    keywords: ["yoga","pilates","bien-être","zen","spa","sauge","calme"],
    mood: "Calme · Ivoire · Vert sauge",
    nav: "floating-pill",
    pricing: "soft-cards",
  },
  {
    id: "modern",
    name: "Fitness Moderne",
    description: "Premium et contemporain : blanc, bleu électrique, grille bento et verre dépoli.",
    layout: "bento",
    primaryColor: "#2563eb",
    secondaryColor: "#06b6d4",
    previewBg: "#f8fafc",
    previewText: "#0f172a",
    defaultHeroModel: "dumbbell",
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
    flagship: true,
    category: "moderne",
    keywords: ["moderne","fitness","premium","bleu","contemporain","bento"],
    mood: "Premium · Blanc · Bleu électrique",
    nav: "glass-pill",
    pricing: "bento-tiles",
  },
  {
    id: "luxury",
    name: "Luxury Club",
    description: "Exclusif : noir profond, or champagne, cadre gravé et rail vertical — un club privé.",
    layout: "private",
    primaryColor: "#cfae7b",
    secondaryColor: "#1c1917",
    previewBg: "#0b0a09",
    previewText: "#f6ecd2",
    defaultHeroModel: "trophy",
    headingFont: "Playfair Display",
    bodyFont: "Inter",
    // Luxury Club now has its own "private" layout (vertical gold rail, engraved frame), so it is no
    // longer a near-clone of "Gold Elite" and is selectable again.
    flagship: true,
    category: "luxe",
    keywords: ["luxe","luxury","privé","exclusif","champagne","or","noir"],
    mood: "Exclusif · Noir · Or champagne",
    nav: "private-rail",
    pricing: "engraved",
  },
  {
    id: "neon",
    name: "Neon Performance",
    description: "Futuriste : violet, rose et bleu néon sur fond nuit, grille et lueurs HUD.",
    layout: "grid",
    primaryColor: "#a855f7",
    secondaryColor: "#ec4899",
    previewBg: "#0a0618",
    previewText: "#f5ecff",
    defaultHeroModel: "stopwatch",
    headingFont: "Orbitron",
    bodyFont: "Inter",
    flagship: true,
    category: "moderne",
    keywords: ["néon","neon","futuriste","violet","rose","cyber","performance"],
    mood: "Futuriste · Violet · Rose · Bleu néon",
    nav: "hud",
    pricing: "hud-cards",
  },
  {
    id: "powerlifting",
    name: "Powerlifting",
    description: "Rouge profond, noir et acier — identité industrielle, force pure.",
    layout: "platform",
    primaryColor: "#b91c1c",
    secondaryColor: "#71717a",
    previewBg: "#0d0d0f",
    previewText: "#f4f4f5",
    defaultHeroModel: "weight-plate",
    headingFont: "Oswald",
    bodyFont: "Inter",
    flagship: false,
    category: "force",
    keywords: ["powerlifting","force","barre","acier","rouge"],
    mood: "Plateforme · Acier · Rouge profond",
    nav: "steel-bar",
    pricing: "plates",
  },
  {
    id: "urban",
    name: "Urban Street",
    description: "Rue et graffiti : jaune signal sur noir, rubans de chantier et stickers.",
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
    keywords: ["urbain","street","graffiti","rue","jaune","noir","calisthénie"],
    mood: "Graffiti · Jaune · Noir",
    nav: "tape",
    pricing: "stickers",
  },
  {
    id: "minimalist",
    name: "Minimal Elite",
    description: "Éditorial et raffiné : crème, beige, filets fins et serif élégant.",
    layout: "editorial",
    primaryColor: "#9a8466",
    secondaryColor: "#2f2b28",
    previewBg: "#f7f2e8",
    previewText: "#2b2825",
    defaultHeroModel: "kettlebell",
    headingFont: "Cormorant Garamond",
    bodyFont: "Inter",
    flagship: true,
    category: "luxe",
    keywords: ["minimal","élégant","éditorial","crème","beige","sobre","serif"],
    mood: "Éditorial · Crème · Beige",
    nav: "editorial-line",
    pricing: "typographic",
  },
  {
    id: "monochrome",
    name: "Noir & Blanc",
    description: "Contraste pur noir et blanc, typographie nette — l'identité ClubX.",
    layout: "editorial",
    primaryColor: "#18181b",
    secondaryColor: "#a1a1aa",
    previewBg: "#ffffff",
    previewText: "#09090b",
    defaultHeroModel: "dumbbell-classic",
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
    flagship: false,
    category: "moderne",
    keywords: ["noir et blanc","monochrome","contraste"],
    mood: "Contraste pur",
    nav: "editorial-line",
    pricing: "typographic",
  },
  {
    id: "sunset",
    name: "Sunset Energy",
    description: "Dégradé corail et orange, énergie chaude — cardio, zumba, cours collectifs.",
    layout: "bento",
    primaryColor: "#f43f5e",
    secondaryColor: "#fb923c",
    previewBg: "#fff7ed",
    previewText: "#2a1210",
    defaultHeroModel: "jump-rope",
    headingFont: "Barlow Condensed",
    bodyFont: "Barlow",
    flagship: false,
    category: "moderne",
    keywords: ["coucher de soleil","corail","orange","cardio","zumba"],
    mood: "Chaud · Corail · Orange",
    nav: "glass-pill",
    pricing: "bento-tiles",
  },
  {
    id: "ocean",
    name: "Ocean Aqua",
    description: "Bleus profonds et turquoise, formes fluides — natation, aqua-fitness, bien-être.",
    layout: "studio",
    primaryColor: "#0284c7",
    secondaryColor: "#14b8a6",
    previewBg: "#f0f9ff",
    previewText: "#0c1a2b",
    defaultHeroModel: "stopwatch",
    headingFont: "Nunito Sans",
    bodyFont: "Nunito Sans",
    flagship: false,
    category: "bienetre",
    keywords: ["océan","aqua","bleu","natation","piscine"],
    mood: "Fluide · Bleu · Turquoise",
    nav: "floating-pill",
    pricing: "soft-cards",
  },
  {
    id: "royal",
    name: "Royal Violet",
    description: "Violet profond, lilas et serif — club haut de gamme, coaching privé.",
    layout: "salon",
    primaryColor: "#8b5cf6",
    secondaryColor: "#f0abfc",
    previewBg: "#0f0a1f",
    previewText: "#f3ecff",
    defaultHeroModel: "trophy",
    headingFont: "Playfair Display",
    bodyFont: "Inter",
    flagship: false,
    category: "luxe",
    keywords: ["royal","violet","lilas","coaching privé"],
    mood: "Violet · Serif",
    nav: "centered-serif",
    pricing: "engraved",
  },
  {
    id: "forest",
    name: "Forest Outdoor",
    description: "Vert forêt et terre, style brut — training en plein air, trail, calisthénie.",
    layout: "street",
    primaryColor: "#16a34a",
    secondaryColor: "#a16207",
    previewBg: "#14231a",
    previewText: "#ecfdf3",
    defaultHeroModel: "gym-rings",
    headingFont: "Oswald",
    bodyFont: "Barlow",
    flagship: false,
    category: "urbain",
    keywords: ["forêt","outdoor","trail","vert","plein air"],
    mood: "Brut · Vert · Terre",
    nav: "tape",
    pricing: "stickers",
  },
  {
    id: "gold",
    name: "Gold Elite",
    description: "Noir profond et or brossé, serif élégant — club privé et coaching haut de gamme.",
    layout: "salon",
    primaryColor: "#d4a437",
    secondaryColor: "#f5e6b3",
    previewBg: "#0b0906",
    previewText: "#f8f1dc",
    defaultHeroModel: "crown",
    headingFont: "Cormorant Garamond",
    bodyFont: "Inter",
    flagship: false,
    category: "luxe",
    keywords: ["gold","or","doré","élite","privé"],
    mood: "Or brossé · Serif",
    nav: "centered-serif",
    pricing: "engraved",
  },
  {
    id: "cyber",
    name: "Cyber Pulse",
    description: "Cyan et magenta sur fond nuit, typographie tech — salle nouvelle génération.",
    layout: "platform",
    primaryColor: "#22d3ee",
    secondaryColor: "#e879f9",
    previewBg: "#070b16",
    previewText: "#e6f7ff",
    defaultHeroModel: "diamond",
    headingFont: "Orbitron",
    bodyFont: "Space Grotesk",
    flagship: false,
    category: "moderne",
    keywords: ["cyber","tech","cyan","magenta","nuit"],
    mood: "Cyan · Magenta · Tech",
    nav: "hud",
    pricing: "hud-cards",
  },
  {
    id: "aurora",
    name: "Aurora Glass",
    description: "Dégradés aurore et verre dépoli, lumineux et moderne — studio boutique.",
    layout: "studio",
    primaryColor: "#6366f1",
    secondaryColor: "#2dd4bf",
    previewBg: "#f5f7ff",
    previewText: "#12142b",
    defaultHeroModel: "gold-dumbbell",
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
    flagship: false,
    category: "bienetre",
    keywords: ["aurore","verre","dégradé","studio boutique"],
    mood: "Verre dépoli · Aurore",
    nav: "floating-pill",
    pricing: "soft-cards",
  },
];

// Clubs that picked one of the original color presets keep working: the old
// ids resolve to the closest new theme (their saved colors are untouched).
const LEGACY_THEME_ALIASES: Record<string, ThemeId> = {
  classic: "modern",
  energetic: "crossfit",
  nature: "yoga",
  midnight: "boxing",
  minimal: "musculation",
  custom: "modern",
};

export const DEFAULT_THEME_ID: ThemeId = "modern";

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
