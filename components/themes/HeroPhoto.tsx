"use client";

// The hero photo of the club's home page. Each theme frames it differently (see the
// `variant` + `overlay` each hero passes), but the source is always the same:
//   1. the owner's "bannière d'accueil" photo (Image Studio: upload / AI generation, with
//      the saved crop + position), else
//   2. the theme's example image (public/themes/<id>.jpg, falling back to its .svg).
// Pure decoration (alt=""): it never replaces or hides the independently selected 3D model.
import { useState } from "react";
import { useClubSettings } from "@/context/ClubSettingsContext";
import { useEditableContent } from "@/hooks/useEditableContent";
import { safeImageUrl } from "@/lib/image-url";
import { themeExampleImage } from "@/lib/theme-example-images";

interface HeroPhotoProps {
  /** "backdrop": full-bleed behind the whole hero. "fill": fills its (relative, overflow-hidden) parent. */
  variant?: "backdrop" | "fill";
  /** Tailwind classes of the readability overlay (backdrop only). */
  overlay?: string;
  /** Image opacity, 0-1. */
  opacity?: number;
  className?: string;
}

export default function HeroPhoto({ variant = "backdrop", overlay = "bg-gradient-to-r from-black/85 via-black/55 to-black/20", opacity = 1, className = "" }: HeroPhotoProps) {
  const { themeId } = useClubSettings();
  const { t, imageStyle, loading } = useEditableContent("home");
  const [artFor, setArtFor] = useState<string | null>(null);

  // Wait for the club's content so a club with its own photo never flashes the example first.
  if (loading) return null;

  const owner = safeImageUrl(t("heroImage", ""));
  const example = themeExampleImage(themeId);
  const src = owner ?? (artFor === example.art ? example.art : example.photo);

  return (
    <div className={`${variant === "backdrop" ? "absolute inset-0" : "absolute inset-0"} overflow-hidden ${className}`} aria-hidden data-hero-photo={owner ? "custom" : "example"}>
      {/* eslint-disable-next-line @next/next/no-img-element -- owner photos can be any allow-listed host; the hero must not depend on the image optimizer */}
      <img
        src={src}
        alt=""
        decoding="async"
        fetchPriority="high"
        className="h-full w-full object-cover"
        style={{ ...(owner ? imageStyle("heroImage") : {}), opacity }}
        onError={() => { if (!owner) setArtFor(example.art); }}
      />
      {variant === "backdrop" && overlay ? <div className={`absolute inset-0 ${overlay}`} /> : null}
    </div>
  );
}
