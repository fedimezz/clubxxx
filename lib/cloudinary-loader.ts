// Custom next/image loader — images are resized by their CDN, not by this server.
//
// Why: with the default loader every <Image> goes browser → this Next server → Cloudinary/Unsplash →
// resize with sharp → browser. From a slow link (or a small VPS) the upstream fetch exceeded the
// optimizer's timeout ("upstream image response timed out") and images never loaded. Now the browser
// fetches the already-resized, auto-format (AVIF/WebP) image straight from the CDN edge.
//
// Security: this only BUILDS a URL. What may be rendered is still decided by safeImageUrl()
// (lib/image-url.ts, https + allow-listed hosts) and by the CSP img-src in proxy.ts.

const CLOUDINARY_HOST = "res.cloudinary.com";
const UNSPLASH_HOST = "images.unsplash.com";

export default function cdnImageLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string {
  // Same-origin static assets (/public): served as-is.
  if (src.startsWith("/")) return src;

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src;
  }

  if (url.hostname === CLOUDINARY_HOST) {
    const marker = "/upload/";
    const i = url.pathname.indexOf(marker);
    if (i === -1) return src;
    const rest = url.pathname.slice(i + marker.length);
    // Already transformed (first segment is not a version "v123" nor the public id folder): leave it alone.
    if (/^(?:[a-z]{1,3}_[^/,]+,?)+\//i.test(rest)) return src;
    const t = `f_auto,q_${quality ?? "auto"},w_${width},c_limit,dpr_1.0`;
    url.pathname = `${url.pathname.slice(0, i + marker.length)}${t}/${rest}`;
    return url.toString();
  }

  if (url.hostname === UNSPLASH_HOST) {
    url.searchParams.set("w", String(width));
    url.searchParams.set("q", String(quality ?? 75));
    url.searchParams.set("auto", "format");
    url.searchParams.set("fit", "max");
    return url.toString();
  }

  return src;
}
