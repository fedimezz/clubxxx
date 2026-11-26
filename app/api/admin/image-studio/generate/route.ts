import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_PROMPT_LENGTH = 1000;
const GENERATIONS_PER_HOUR = 6;
// Override with OPENAI_IMAGE_MODEL (e.g. gpt-image-2.5-sunburst, gpt-image-1) without a code change.
const DEFAULT_IMAGE_MODEL = "gpt-image-2.5-flare";

export async function POST(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Accès réservé au propriétaire du club." }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const prompt = body && typeof body === "object" && "prompt" in body && typeof body.prompt === "string"
    ? body.prompt.trim()
    : "";
  if (prompt.length < 5 || prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json({ error: `Décrivez l'image en 5 à ${MAX_PROMPT_LENGTH} caractères.` }, { status: 400 });
  }

  const clubId = auth.user.clubId;
  if (!clubId) {
    return NextResponse.json({ error: "Club introuvable pour ce compte." }, { status: 403 });
  }

  const rateLimit = await checkRateLimit(`image-generation:${clubId}:${auth.user.id}`, GENERATIONS_PER_HOUR, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Limite de génération atteinte. Réessayez plus tard." }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "La génération d'images n'est pas configurée côté serveur." }, { status: 503 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL,
        prompt: `Create a high-quality, realistic image for a sports club website. Do not include text, logos, watermarks, or brand names. ${prompt}`,
        size: "1536x1024",
        quality: "medium",
        output_format: "jpeg",
        safety_identifier: createHash("sha256").update(`${clubId}:${auth.user.id}`).digest("hex"),
      }),
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });

    if (!response.ok) {
      const providerError = await response.json().catch(() => null);
      const code = providerError && typeof providerError === "object" && "error" in providerError
        && providerError.error && typeof providerError.error === "object" && "code" in providerError.error
        && typeof providerError.error.code === "string"
        ? providerError.error.code
        : undefined;
      console.error("OpenAI image generation failed:", { status: response.status, code });
      return NextResponse.json({ error: "Le service de génération d'images est temporairement indisponible." }, { status: 502 });
    }

    const result = await response.json();
    const image = result && typeof result === "object" && "data" in result && Array.isArray(result.data)
      ? result.data[0]
      : null;
    if (!image || typeof image !== "object" || !("b64_json" in image) || typeof image.b64_json !== "string" || !image.b64_json) {
      console.error("OpenAI image generation returned no encoded image.");
      return NextResponse.json({ error: "Aucune image n'a été retournée. Réessayez avec une autre description." }, { status: 502 });
    }

    return NextResponse.json({ image: image.b64_json, mimeType: "image/jpeg" }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("OpenAI image generation request error:", error);
    return NextResponse.json({ error: "La génération a échoué. Réessayez dans quelques instants." }, { status: 502 });
  }
}
