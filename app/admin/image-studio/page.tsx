"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crop, ImagePlus, Loader2, RotateCcw, Save, Sparkles, Trash2, Upload } from "lucide-react";
import OwnerOnly from "@/components/admin/OwnerOnly";
import { useClubSettings } from "@/context/ClubSettingsContext";
import { PAGE_CONTENT_SCHEMA, MAX_GALLERY_IMAGES } from "@/lib/page-content-schema";
import { safeImageList, safeImageUrl } from "@/lib/image-url";
import {
  DEFAULT_IMAGE_POSITION,
  IMAGE_POSITION_MAP_KEY,
  imagePositionKey,
  parseImagePositionMap,
  type ImagePosition,
} from "@/lib/image-position";

type ImageTarget = {
  id: string;
  pageKey: string;
  pageLabel: string;
  fieldKey: string;
  label: string;
  type: "image" | "gallery";
};

interface ContentPage {
  pageKey: string;
  label: string;
  content: Record<string, string>;
}

const IMAGE_TARGETS: ImageTarget[] = PAGE_CONTENT_SCHEMA.flatMap((page) =>
  page.fields
    .filter((field) => field.type === "image" || field.type === "gallery")
    .map((field) => ({
      id: `${page.pageKey}.${field.key}`,
      pageKey: page.pageKey,
      pageLabel: page.label,
      fieldKey: field.key,
      label: field.label,
      type: field.type as ImageTarget["type"],
    })),
);

function galleryValue(value: string | undefined) {
  try {
    return safeImageList(JSON.parse(value || "[]"), MAX_GALLERY_IMAGES);
  } catch {
    return [];
  }
}

function updateGallery(urls: string[], index: number, imageUrl: string, remove: boolean) {
  if (remove) {
    if (index >= urls.length) throw new Error("Sélectionnez une photo existante à retirer.");
    return urls.filter((_, itemIndex) => itemIndex !== index);
  }
  if (index > urls.length || index >= MAX_GALLERY_IMAGES) {
    throw new Error("L'emplacement sélectionné dans la galerie n'est pas valide.");
  }
  return index === urls.length
    ? [...urls, imageUrl]
    : urls.map((url, itemIndex) => itemIndex === index ? imageUrl : url);
}

function positionsAfterGalleryRemoval(
  positions: Record<string, ImagePosition>,
  fieldKey: string,
  removedIndex: number,
  nextLength: number,
) {
  const prefix = `${fieldKey}:`;
  return Object.fromEntries(Object.entries(positions).flatMap(([key, value]) => {
    if (!key.startsWith(prefix)) return [[key, value]];
    const index = Number(key.slice(prefix.length));
    if (index < removedIndex) return [[key, value]];
    if (index > removedIndex && index - 1 < nextLength) return [[`${prefix}${index - 1}`, value]];
    return [];
  })) as Record<string, ImagePosition>;
}

function ImageStudioContent() {
  const { name: clubName, themeId } = useClubSettings();
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [targetId, setTargetId] = useState(IMAGE_TARGETS[0]?.id ?? "");
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [position, setPosition] = useState<ImagePosition>(DEFAULT_IMAGE_POSITION);
  const [prompt, setPrompt] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [stagedUrl, setStagedUrl] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const filePreviewUrlRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const target = useMemo(() => IMAGE_TARGETS.find((item) => item.id === targetId) ?? null, [targetId]);
  const page = pages.find((item) => item.pageKey === target?.pageKey) ?? null;
  const gallery = target?.type === "gallery" ? galleryValue(page?.content[target.fieldKey]) : [];
  const boundedGalleryIndex = target?.type === "gallery"
    ? Math.min(galleryIndex, Math.min(gallery.length, MAX_GALLERY_IMAGES - 1))
    : 0;
  const positionKey = target ? imagePositionKey(target.fieldKey, target.type === "gallery" ? boundedGalleryIndex : undefined) : "";
  const currentUrl = target && page
    ? target.type === "image"
      ? safeImageUrl(page.content[target.fieldKey]) ?? ""
      : gallery[boundedGalleryIndex] ?? ""
    : "";
  const previewUrl = filePreviewUrl || generatedImage || stagedUrl || currentUrl;

  const chooseFile = (file: File | null) => {
    if (filePreviewUrlRef.current) URL.revokeObjectURL(filePreviewUrlRef.current);
    const url = file ? URL.createObjectURL(file) : null;
    filePreviewUrlRef.current = url;
    setPendingFile(file);
    setFilePreviewUrl(url);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/admin/page-content", { credentials: "include", cache: "no-store" });
        const json = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(json?.pages)) {
          throw new Error(json?.error || "Impossible de charger les images du site.");
        }
        if (!active) return;
        const loadedPages = json.pages as ContentPage[];
        setPages(loadedPages);
        const initialTarget = IMAGE_TARGETS[0];
        const initialPage = loadedPages.find((item) => item.pageKey === initialTarget?.pageKey);
        if (initialTarget && initialPage) {
          const key = imagePositionKey(initialTarget.fieldKey);
          const positions = parseImagePositionMap(initialPage.content[IMAGE_POSITION_MAP_KEY]);
          setPosition(positions[key] ?? DEFAULT_IMAGE_POSITION);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Impossible de charger les images du site.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    return () => {
      if (filePreviewUrlRef.current) URL.revokeObjectURL(filePreviewUrlRef.current);
    };
  }, []);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", credentials: "include", body: formData });
    const json = await response.json().catch(() => null);
    if (!response.ok || typeof json?.url !== "string") {
      throw new Error(json?.error || "Le téléversement de l'image a échoué.");
    }
    return json.url as string;
  };

  const generate = async () => {
    setError(null);
    setNotice(null);
    if (prompt.trim().length < 5 || prompt.trim().length > 1000) {
      setError("Saisissez une description entre 5 et 1 000 caractères.");
      return;
    }
    setGenerating(true);
    try {
      const response = await fetch("/api/admin/image-studio/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || typeof json?.image !== "string" || typeof json?.mimeType !== "string") {
        throw new Error(json?.error || "La génération de l'image a échoué.");
      }
      chooseFile(null);
      setStagedUrl(null);
      setGeneratedImage(`data:${json.mimeType};base64,${json.image}`);
      setNotice("Image générée. Ajustez le cadrage puis enregistrez-la dans l'emplacement choisi.");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "La génération de l'image a échoué.");
    } finally {
      setGenerating(false);
    }
  };

  const save = async (remove = false) => {
    if (!page || !target || saving) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      let nextImageUrl = remove ? "" : stagedUrl || currentUrl;
      if (!remove && pendingFile) {
        nextImageUrl = await uploadFile(pendingFile);
        setStagedUrl(nextImageUrl);
        chooseFile(null);
        setGeneratedImage(null);
      } else if (!remove && generatedImage) {
        const blob = await (await fetch(generatedImage)).blob();
        nextImageUrl = await uploadFile(new File([blob], "clubx-generated.jpg", { type: blob.type || "image/jpeg" }));
        setStagedUrl(nextImageUrl);
        setGeneratedImage(null);
      }
      if (!remove && !nextImageUrl) {
        throw new Error("Choisissez une image à placer sur votre site.");
      }

      const currentPositions = parseImagePositionMap(page.content[IMAGE_POSITION_MAP_KEY]);
      const nextUrls = target.type === "gallery"
        ? updateGallery(galleryValue(page.content[target.fieldKey]), boundedGalleryIndex, nextImageUrl, remove)
        : null;
      const nextPositions = target.type === "gallery" && remove
        ? positionsAfterGalleryRemoval(currentPositions, target.fieldKey, boundedGalleryIndex, nextUrls?.length ?? 0)
        : remove
          ? Object.fromEntries(Object.entries(currentPositions).filter(([key]) => key !== positionKey))
          : { ...currentPositions, [positionKey]: position };
      const nextContent = {
        ...page.content,
        [target.fieldKey]: nextUrls ? JSON.stringify(nextUrls) : nextImageUrl,
        [IMAGE_POSITION_MAP_KEY]: JSON.stringify(nextPositions),
      };

      const response = await fetch("/api/admin/page-content", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageKey: page.pageKey, content: nextContent }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.content) {
        throw new Error(json?.error || "Impossible d'enregistrer l'image sur cette page.");
      }
      setPages((current) => current.map((item) => item.pageKey === page.pageKey ? { ...item, content: json.content } : item));
      chooseFile(null);
      setGeneratedImage(null);
      setStagedUrl(null);
      setNotice(remove ? "Image retirée de l'emplacement choisi." : "Image et cadrage enregistrés.");
      window.dispatchEvent(new Event("page-content-updated"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer l'image.");
    } finally {
      setSaving(false);
    }
  };

  const changeTarget = (value: string) => {
    const nextTarget = IMAGE_TARGETS.find((item) => item.id === value);
    const nextPage = pages.find((item) => item.pageKey === nextTarget?.pageKey);
    if (nextTarget && nextPage) {
      const key = imagePositionKey(nextTarget.fieldKey, nextTarget.type === "gallery" ? 0 : undefined);
      const positions = parseImagePositionMap(nextPage.content[IMAGE_POSITION_MAP_KEY]);
      setPosition(positions[key] ?? DEFAULT_IMAGE_POSITION);
    } else {
      setPosition(DEFAULT_IMAGE_POSITION);
    }
    setTargetId(value);
    setGalleryIndex(0);
    chooseFile(null);
    setGeneratedImage(null);
    setStagedUrl(null);
    setError(null);
    setNotice(null);
  };

  const setPositionValue = (key: keyof ImagePosition, value: number) => {
    setPosition((previous) => ({ ...previous, [key]: value }));
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-muted" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-bold text-primary">Studio d&apos;images</h1>
        <p className="mt-1 text-sm text-muted">
          Importez ou générez une image, ajustez son cadrage et choisissez précisément sa page et son emplacement.
          Le modèle 3D de l&apos;accueil reste réglé séparément dans Apparence.
        </p>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-danger">{error}</div>}
      {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
        <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="placement-title">
          <div>
            <h2 id="placement-title" className="text-lg font-semibold text-primary">1. Choisir l&apos;emplacement</h2>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="image-target">Page et zone d&apos;image</label>
            <select id="image-target" value={targetId} onChange={(event) => changeTarget(event.target.value)} className="mt-1.5 w-full rounded-xl border border-border bg-muted/20 px-3 py-3 text-sm text-primary">
              {IMAGE_TARGETS.map((item) => <option key={item.id} value={item.id}>{item.pageLabel} — {item.label}</option>)}
            </select>
          </div>

          {target?.type === "gallery" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="gallery-slot">Photo de la galerie</label>
              <select id="gallery-slot" value={boundedGalleryIndex} onChange={(event) => setGalleryIndex(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-border bg-muted/20 px-3 py-3 text-sm text-primary">
                {Array.from({ length: Math.min(MAX_GALLERY_IMAGES, gallery.length + (gallery.length < MAX_GALLERY_IMAGES ? 1 : 0)) }, (_, index) => (
                  <option key={index} value={index}>
                    {index < gallery.length ? `Remplacer la photo ${index + 1}` : `Ajouter la photo ${index + 1}`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">{gallery.length}/{MAX_GALLERY_IMAGES} photos actuellement enregistrées.</p>
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold text-primary">2. Importer ou générer</h2>
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-primary hover:bg-muted/20">
                <Upload size={16} aria-hidden /> Importer une image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                  className="sr-only"
                  onChange={(event) => {
                    chooseFile(event.target.files?.[0] ?? null);
                    setGeneratedImage(null);
                    setStagedUrl(null);
                    setError(null);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="image-prompt">Description de l&apos;image IA</label>
            <textarea
              id="image-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={1000}
              rows={4}
              placeholder={`Ex. Photo lumineuse et réaliste d'une salle de sport accueillante, ambiance ${themeId}, sans texte ni logo.`}
              className="mt-1.5 w-full resize-y rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">Génération par OpenAI Images. Limite : 6 images par heure.</p>
              <button type="button" onClick={() => void generate()} disabled={generating || saving} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} aria-hidden />}
                {generating ? "Génération…" : "Générer"}
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="crop-title">
          <div>
            <h2 id="crop-title" className="flex items-center gap-2 text-lg font-semibold text-primary"><Crop size={18} aria-hidden /> 3. Recadrer et repositionner</h2>
            <p className="mt-1 text-sm text-muted">Le cadrage est enregistré avec cette image et appliqué à son emplacement public.</p>
          </div>
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-border bg-muted/20">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Aperçu du cadrage" className="h-full w-full object-cover" style={{ objectPosition: `${position.x}% ${position.y}%`, transform: `scale(${position.zoom})` }} />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-center text-sm text-muted">
                <div><ImagePlus className="mx-auto mb-2 h-8 w-8 opacity-60" aria-hidden />Sélectionnez ou générez une image pour la prévisualiser.</div>
              </div>
            )}
          </div>
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            {([
              ["x", "Position horizontale", 0, 100, 1],
              ["y", "Position verticale", 0, 100, 1],
              ["zoom", "Zoom / recadrage", 1, 2, 0.01],
            ] as const).map(([key, label, min, max, step]) => (
              <label key={key} className="block text-xs font-semibold text-muted">
                <span className="flex justify-between"><span>{label}</span><span>{key === "zoom" ? `${Math.round(position.zoom * 100)}%` : `${position[key]}%`}</span></span>
                <input type="range" min={min} max={max} step={step} value={position[key]} onChange={(event) => setPositionValue(key, Number(event.target.value))} className="mt-2 w-full accent-[var(--brand)]" />
              </label>
            ))}
            <button type="button" onClick={() => setPosition(DEFAULT_IMAGE_POSITION)} className="inline-flex items-center gap-1.5 self-end text-xs font-medium text-muted hover:text-primary">
              <RotateCcw size={13} aria-hidden /> Réinitialiser le cadrage
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="min-w-0 text-xs text-muted">{target ? `${target.pageLabel} — ${target.label}` : "Choisissez un emplacement."}{clubName ? ` · ${clubName}` : ""}</p>
            <div className="flex gap-2">
              {currentUrl && <button type="button" onClick={() => void save(true)} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50"><Trash2 size={14} aria-hidden /> Retirer</button>}
              <button type="button" onClick={() => void save()} disabled={saving || generating || (!previewUrl && !currentUrl)} className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-[var(--brand-contrast)] disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} aria-hidden />}
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function ImageStudioPage() {
  return (
    <OwnerOnly>
      <ImageStudioContent />
    </OwnerOnly>
  );
}
