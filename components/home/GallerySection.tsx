"use client";

import Image from "next/image";
import Link from "next/link";
import { useEditableContent } from "@/hooks/useEditableContent";
import { safeImageUrl } from "@/lib/image-url";

// Home photo area (separate from the hero). Uses the photos the owner chose
// for the home page; if none, falls back to the Gallery page photos. Nothing
// is shown until the club adds some — never a stock or another club's picture.
export default function GallerySection() {
  const home = useEditableContent("home");
  const gallery = useEditableContent("gallery");

  const imageTargets = (
    fieldKey: string,
    urls: string[],
  ) => urls.flatMap((url, index) => {
    const safeUrl = safeImageUrl(url);
    return safeUrl ? [{ url: safeUrl, fieldKey, index }] : [];
  });
  const own = imageTargets("homeGallery", home.list("homeGallery", [])).slice(0, 6);
  const fallback = [
    ...imageTargets("galleryFitness", gallery.list("galleryFitness", [])),
    ...imageTargets("galleryPadel", gallery.list("galleryPadel", [])),
    ...imageTargets("galleryPool", gallery.list("galleryPool", [])),
  ];
  const seen = new Set<string>();
  const images = (own.length > 0 ? own : fallback).filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  }).slice(0, 6);

  if (home.loading || gallery.loading || images.length === 0) return null;

  return (
    <section className="theme-section py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center">
          <h2 className="theme-heading text-3xl md:text-5xl">Le club en images</h2>
          <p className="mt-4 text-gray-500">Découvrez nos installations et notre ambiance.</p>
        </div>

        <div className="mt-12 grid gap-4 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {images.map((image, i) => (
            <div key={`${image.fieldKey}-${image.index}-${image.url}`} className="group relative h-[260px] md:h-[320px] overflow-hidden theme-card bg-muted/30">
              <Image
                src={image.url}
                alt={`Photo du club ${i + 1}`}
                fill
                sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                className="object-cover transition duration-700 group-hover:scale-110"
                style={(image.fieldKey === "homeGallery" ? home : gallery).imageStyle(image.fieldKey, image.index)}
              />
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link href="/gallery" className="inline-flex theme-btn px-8 py-4 font-semibold">
            Voir toute la galerie
          </Link>
        </div>
      </div>
    </section>
  );
}
