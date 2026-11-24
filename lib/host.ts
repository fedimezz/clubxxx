// Hostname of the platform apex from APP_URL (no "www."), or null if unset/invalid.
// Dependency-free on purpose: this file also runs in proxy.ts.
function platformApexHostname(): string | null {
  const raw = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// lib/host.ts
//
// Single source of truth for "does this Host header point at a tenant
// subdomain, and if so which one". Used by proxy.ts (Edge runtime — must
// stay dependency-free, no Prisma), lib/tenant.ts (Node runtime), and any
// route/page that needs a plain "is this the platform host or a club host"
// check (app/login, app/register). Don't re-implement this parsing anywhere
// else — that's exactly how the club-a.localhost bug happened (four copies
// of a slightly-wrong rule).
//
// Production:
//   "clubx.com"            (2 labels)      -> apex/platform, no tenant
//   "www.clubx.com"                        -> no tenant
//   "club-a.clubx.com"     (3 labels)      -> tenant "club-a"
//
// Local dev — "localhost" is a single-label host, so the apex/subdomain
// split happens one label earlier than production. Modern browsers resolve
// any *.localhost to 127.0.0.1 automatically, so this needs no /etc/hosts
// entry or wildcard DNS to work:
//   "localhost"             (1 label)      -> apex/platform, no tenant
//   "club-a.localhost"      (2 labels)      -> tenant "club-a"
//   "www.club-a.localhost"                  -> no tenant
export function extractSlugFromHost(host: string): string | null {
  const hostname = host.split(":")[0].toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") return null;
  // A bare LAN/IPv4 host (e.g. "192.168.1.5", used when testing the mobile
  // app over Wi-Fi) has 4 dot-separated labels — the production branch below
  // would otherwise misread its first octet as a tenant slug. Treat it like
  // "localhost": no tenant from the host, so callers fall through to the
  // dev-only x-club-slug header instead.
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return null;

  const parts = hostname.split(".");
  if (parts[0] === "www") return null;

  // APP_URL is the platform apex, whatever it looks like. Without this, the
  // "2 labels = apex" guess below reads https://my-app.vercel.app (3 labels) as a
  // tenant called "my-app", and breaks multi-part apexes such as clubx.com.tn.
  const apex = platformApexHostname();
  if (apex && !hostname.endsWith(".localhost")) {
    if (hostname === apex) return null;
    if (hostname.endsWith(`.${apex}`)) {
      const sub = hostname.slice(0, -(apex.length + 1));
      return sub.includes(".") ? null : sub; // "club-a.<apex>" -> club-a; deeper hosts are not tenants
    }
  }

  if (hostname.endsWith(".localhost")) {
    // "club-a.localhost" -> ["club-a", "localhost"]. Anything deeper
    // ("www.club-a.localhost") is intentionally not a tenant.
    return parts.length === 2 ? parts[0] : null;
  }

  // Production-style domain: apex is 2 labels ("clubx.com"), so a tenant
  // subdomain needs 3+ ("club-a.clubx.com").
  if (parts.length <= 2) return null;
  return parts[0];
}

// ── Single-address mode ──────────────────────────────────────────────────────
// A free *.vercel.app address cannot serve one subdomain per club. In this mode every
// club lives on the ONE platform host, under /c/<slug>:
//   https://my-app.vercel.app/c/club-a        -> club-a's site (proxy.ts sets a club cookie)
//   https://my-app.vercel.app/c/club-a/api/…  -> that club's API (mobile app base URL)
//   https://my-app.vercel.app/c               -> back to the ClubX landing page (clears the cookie)
// Enabled automatically when APP_URL is a *.vercel.app address, or explicitly with
// NEXT_PUBLIC_SINGLE_HOST_MODE=true ("false" forces it off). With a real domain + wildcard
// DNS leave it off: clubs then use club-a.yourdomain as before.
export const CLUB_COOKIE = "club_slug";
export const CLUB_SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function isSingleHostMode(): boolean {
  const flag = process.env.NEXT_PUBLIC_SINGLE_HOST_MODE;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return !!platformApexHostname()?.endsWith(".vercel.app");
}

/** True when `host` is the platform address itself (apex or www) AND single-address mode is on. */
export function isSingleHostApex(host: string): boolean {
  if (!isSingleHostMode()) return false;
  const apex = platformApexHostname();
  if (!apex) return false;
  const hostname = host.split(":")[0].toLowerCase().replace(/^www\./, "");
  return hostname === apex;
}

/** Pages/APIs that belong to the platform, never to a club, even when a club cookie is set. */
export function isPlatformOnlyPath(pathname: string): boolean {
  return /^\/(api\/)?(platform|onboarding)(\/|$)/.test(pathname);
}

/** Splits "/c/club-a/admin?x" style paths. null = not a /c path. slug "" = bare "/c". */
export function parseClubPrefix(pathname: string): { slug: string; rest: string } | null {
  const m = /^\/c(?:\/([^/]*))?(\/.*)?$/.exec(pathname);
  if (!m) return null;
  return { slug: (m[1] ?? "").toLowerCase(), rest: m[2] || "/" };
}

/** Public origin of a club in single-address mode: https://my-app.vercel.app/c/club-a */
export function singleHostClubOrigin(slug: string, base?: string): string | null {
  const raw = base || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (!raw) return null;
  try {
    return `${new URL(raw).origin}/c/${slug}`;
  } catch {
    return null;
  }
}

export function isTenantHost(host: string): boolean {
  return extractSlugFromHost(host) !== null;
}