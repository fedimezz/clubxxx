// proxy.ts — Next.js 16 Node.js proxy (replaces middleware.ts)
//
// Responsibilities:
//   1. JWT auth guard — protects /admin, /dashboard, /api/admin, /api/dashboard.
//   2. Tenant slug injection — extracts subdomain from Host header and forwards
//      it as X-Club-Slug so every route handler can call
//      resolveTenantFromRequest() without re-parsing the host.
//   3. SUPER_ADMIN routing — redirects to /platform, never to a gym.
//   4. Owner-only page guards — /admin/promotions, /admin/roles, etc.
//
// Club lock state is read from the database for every tenant request. Route
// guards repeat the check so direct handler calls remain protected as well.

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { verifyOrigin } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
// Note: lib/logger uses console internally — safe in Edge Runtime
import { log } from "@/lib/logger";
import {
  extractSlugFromHost,
  isSingleHostApex,
  isPlatformOnlyPath,
  parseClubPrefix,
  CLUB_COOKIE,
  CLUB_SLUG_RE,
} from "@/lib/host";
import { clearAuthCookie, AUTH_COOKIE_NAME } from "@/lib/auth-cookie";
import { getClubAccessState, resolveClubBySlug, resolveTenantFromRequest, type ClubLockReason } from "@/lib/tenant";
import { getAuthenticatedAccount } from "@/lib/auth";

// General write-rate-limit for authenticated API requests, applied centrally
// (Phase 10 — "rate-limit sur toutes les routes write") rather than added
// to each of the ~50 write handlers individually: one place to get right,
// can't be forgotten on a new route. Auth endpoints (login, register, etc.)
// keep their own tighter, per-IP limits inside their handlers — this is a
// coarser backstop for everything else, keyed by user id once a JWT is
// verified below.
const WRITE_LIMIT = 60;
const WRITE_WINDOW_MS = 60 * 1000;
const isDev = process.env.NODE_ENV === "development";

function buildCsp(nonce: string, host: string): string {
  const sources = new Set(["'self'"]);
  const rawAppUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (rawAppUrl) {
    try {
      const appUrl = new URL(rawAppUrl);
      const port = appUrl.port ? `:${appUrl.port}` : "";
      sources.add(`${appUrl.protocol}//${appUrl.hostname.replace(/^www\./, "")}${port}`);
      sources.add(`${appUrl.protocol}//*.${appUrl.hostname.replace(/^www\./, "")}${port}`);
    } catch {
      // Invalid app URL does not expand the frame allowlist.
    }
  }
  if (isDev) {
    sources.add("http://localhost:*");
    sources.add("http://*.localhost:*");
  }
  const hostName = host.split(":")[0].toLowerCase();
  if (hostName && hostName !== "localhost" && !hostName.endsWith(".localhost")) {
    sources.add(`https://${hostName}`);
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com",
    "font-src 'self' data:",
    "connect-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "media-src 'self' https://res.cloudinary.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-src ${[...sources].join(" ")}`,
    `frame-ancestors ${[...sources].join(" ")}`,
  ].join("; ");
}

const JWT_SECRET = process.env.JWT_SECRET;

interface MiddlewareJWTPayload {
  id: string;
  email: string;
  role: string;
  name: string;
  clubId: string | null;
}

const isWriteMethod = (method: string) => !["GET", "HEAD", "OPTIONS"].includes(method);
const getBearerToken = (request: NextRequest) => {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
};

// Shared by the protected and the public-write paths below. Fails open on a
// limiter error: a Redis outage shouldn't take down every write (the limiter
// itself already falls back to in-memory before it ever throws).
async function writeRateLimited(key: string): Promise<NextResponse | null> {
  const rl = await checkRateLimit(key, WRITE_LIMIT, WRITE_WINDOW_MS).catch(() => ({
    allowed: process.env.NODE_ENV !== "production",
    remaining: 0,
    resetAt: Date.now() + WRITE_WINDOW_MS,
  }));
  if (rl.allowed) return null;
  return NextResponse.json(
    { error: "Trop de requêtes, veuillez réessayer dans un instant." },
    { status: 429 }
  );
}

// Single-address mode (see lib/host.ts): the club the browser is "inside" is remembered in a cookie,
// because links inside a page ("/coaches", "/user/login") carry no /c/<slug> prefix.
const CLUB_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
function setClubCookie(response: NextResponse, slug: string, requestUrl: string) {
  response.cookies.set(CLUB_COOKIE, slug, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: requestUrl.startsWith("https://"),
    maxAge: CLUB_COOKIE_MAX_AGE,
  });
}
function clearClubCookie(response: NextResponse) {
  response.cookies.set(CLUB_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function proxy(request: NextRequest) {
  let pathname = request.nextUrl.pathname;

  // ── Single-address mode: /c/<slug>/… ───────────────────────────────────────
  // Resolved FIRST so every rule below (CSRF, auth, locks) sees the real path, e.g.
  // /c/club-a/api/admin/x is treated exactly like /api/admin/x.
  const singleHost = isSingleHostApex(request.headers.get("host") ?? "");
  let prefixSlug: string | null = null;
  let strippedUrl: URL | null = null;
  const prefix = singleHost ? parseClubPrefix(pathname) : null;
  if (prefix) {
    const goHome = () => {
      const res = NextResponse.redirect(new URL("/", request.url));
      clearClubCookie(res);
      return res;
    };
    if (!prefix.slug || !CLUB_SLUG_RE.test(prefix.slug)) return goHome(); // "/c" = leave the club
    const isApiPath = prefix.rest.startsWith("/api/");
    if (!isApiPath && (request.method === "GET" || request.method === "HEAD")) {
      // Page navigation: remember the club, then continue on the normal path.
      const club = await resolveClubBySlug(prefix.slug);
      if (!club) return goHome();
      const dest = new URL(prefix.rest, request.url);
      dest.search = request.nextUrl.search;
      const res = NextResponse.redirect(dest);
      setClubCookie(res, prefix.slug, request.url);
      return res;
    }
    // API calls (mobile app, bridge, forms): no redirect, serve the real path for this club.
    prefixSlug = prefix.slug;
    pathname = prefix.rest;
    strippedUrl = request.nextUrl.clone();
    strippedUrl.pathname = prefix.rest;
  }

  const pageNonce = pathname.startsWith("/api/") ? null : btoa(crypto.randomUUID());
  const pageCsp = pageNonce ? buildCsp(pageNonce, request.headers.get("host") ?? "") : null;

  // ── CSRF — Origin check, every non-GET /api/* request ──────────────────────
  // Centralized here instead of duplicated in all ~50 write route handlers:
  // one place to get right, impossible to forget on a new route, and it runs
  // before any auth/DB work so a cross-site write is rejected as cheaply as
  // possible. See lib/csrf.ts for why this checks "same base domain or a
  // subdomain of it" rather than the continuation prompt's literal regex
  // (that regex assumes APP_URL already has a subdomain to strip, which
  // breaks for this app's apex-domain config and would reject every
  // legitimate per-club subdomain origin).
  if (
    pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method)
  ) {
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;
  }

  // ── Tenant slug — inject on every request ──────────────────────────────────
  const host = request.headers.get("host") ?? "";
  let slug = extractSlugFromHost(host);
  if (singleHost) {
    // /c/<slug>/… wins; otherwise the club cookie — but never on platform-only paths
    // (/platform, /onboarding), so the Super Admin area and signup stay club-free.
    const cookieSlug = request.cookies.get(CLUB_COOKIE)?.value?.toLowerCase() ?? null;
    slug =
      prefixSlug ??
      (cookieSlug && CLUB_SLUG_RE.test(cookieSlug) && !isPlatformOnlyPath(pathname) ? cookieSlug : null);
  }

  // Helper that returns a NextResponse.next() with the club slug header added.
  // For OAuth callback routes we intentionally skip the dev URL rewrite:
  // NextResponse.rewrite() in Edge Runtime can drop cookies that were set
  // on the initiating response (the google_oauth_state CSRF cookie), causing
  // a state mismatch. Header injection is sufficient — the route handler reads
  // x-club-slug via resolveTenantFromRequest(), same as production.
  const isOAuthCallback = pathname.startsWith("/api/auth/callback/");
  const nextWithSlug = (extraHeaders?: Record<string, string>) => {
    const headers = new Headers(request.headers);
    // These are set ONLY by this proxy. Never let a client-supplied copy through (header spoofing):
    // x-user-* / x-nonce always, and x-club-slug in production (tenant.ts ignores it there anyway;
    // in dev it stays usable for localhost / LAN mobile testing).
    headers.delete("x-user-id");
    headers.delete("x-user-role");
    headers.delete("x-nonce");
    if (process.env.NODE_ENV === "production") headers.delete("x-club-slug");
    if (slug) headers.set("x-club-slug", slug);
    if (pageNonce && pageCsp) {
      headers.set("x-nonce", pageNonce);
      headers.set("Content-Security-Policy", pageCsp);
    }
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
    }
    if (strippedUrl) {
      // /c/<slug>/… API request: serve the real path, tenant forwarded in x-club-slug above.
      const response = NextResponse.rewrite(strippedUrl, { request: { headers } });
      if (pageCsp) response.headers.set("Content-Security-Policy", pageCsp);
      if (prefixSlug) setClubCookie(response, prefixSlug, request.url);
      return response;
    }
    if (slug && process.env.NODE_ENV !== "production" && !isOAuthCallback) {
      const rewrittenUrl = request.nextUrl.clone();
      rewrittenUrl.searchParams.set("club", slug);
      const response = NextResponse.rewrite(rewrittenUrl, { request: { headers } });
      if (pageCsp) response.headers.set("Content-Security-Policy", pageCsp);
      return response;
    }
    const response = NextResponse.next({ request: { headers } });
    if (pageCsp) response.headers.set("Content-Security-Policy", pageCsp);
    return response;
  };

  // ── Static and explicit authentication entry points ───────────────────────
  if (
    pathname.startsWith("/_next") ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/google" ||
    pathname.startsWith("/api/auth/callback/google") ||
    pathname.startsWith("/api/payments/stripe/webhook") ||
    pathname === "/platform/login"
  ) {
    return nextWithSlug();
  }

  const isApiRoute = pathname.startsWith("/api/");
  const isPlatformPath =
    pathname.startsWith("/platform") || pathname.startsWith("/api/platform");
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/dashboard") ||
    pathname.startsWith("/api/admin") ||
    isPlatformPath;

  // Single-address mode: the club comes from /c/<slug> or the club cookie (computed above), not from
  // the raw request, whose x-club-slug header is client-controlled here.
  const tenant = singleHost
    ? (slug ? await resolveClubBySlug(slug) : null)
    : await resolveTenantFromRequest(request);
  const accessState = tenant ? await getClubAccessState(tenant.id) : null;
  const lockReason: ClubLockReason | null =
    accessState === "TRIAL_EXPIRED" || accessState === "SUSPENDED" ? accessState : null;
  const isLockedApiException =
    pathname === "/api/saas-plans" ||
    pathname === "/api/payments/country" ||
    pathname === "/api/payments/stripe/webhook" ||
    pathname === "/api/billing/reactivate" ||
    pathname === "/api/billing/checkout" ||
    pathname === "/api/billing/manual-request";
  const isSessionApi =
    pathname === "/api/auth/session" || pathname === "/api/auth/me";
  const isOwnerProfileApi =
    pathname === "/api/dashboard/profile" &&
    (request.method === "GET" || request.method === "PUT");
  const isOwnerProfilePage =
    pathname === "/admin/profile" ||
    pathname.startsWith("/admin/profile/") ||
    pathname === "/dashboard/profile" ||
    pathname.startsWith("/dashboard/profile/");
  const isOwnerReactivationPage = pathname === "/admin/reactivate";
  const lockedApiResponse = (reason: ClubLockReason, role?: string) =>
    NextResponse.json(
      {
        error: "L'accès à ce club est suspendu. Le propriétaire peut le réactiver en choisissant un plan.",
        code: "CLUB_LOCKED",
        reason,
        ...(role ? { role } : {}),
      },
      { status: 402 }
    );

  if (lockReason && !isProtected) {
    if (isLockedApiException) return nextWithSlug();

    if (pathname === "/api/billing/trial" || isSessionApi || isOwnerProfileApi) {
      const account = await getAuthenticatedAccount(request);
      if (account && account.clubId === tenant?.id && account.role.toUpperCase() === "OWNER") {
        return nextWithSlug({ "x-user-id": account.id, "x-user-role": "OWNER" });
      }
      return lockedApiResponse(lockReason, account && account.clubId === tenant?.id ? account.role : undefined);
    }

    if (isApiRoute) return lockedApiResponse(lockReason);
    if (pathname === "/user/login" || pathname === "/login") {
      return nextWithSlug();
    }
    if (!isProtected) {
      const account = await getAuthenticatedAccount(request);
      if (account && account.clubId === tenant?.id && account.role.toUpperCase() === "OWNER") {
        return NextResponse.redirect(new URL("/admin/reactivate", request.url));
      }
      if (pathname === "/reactivate" || pathname === "/club-suspended") return nextWithSlug();
      return NextResponse.redirect(new URL("/club-suspended", request.url));
    }
  }

  // Public pages — no auth needed, still inject slug.
  //
  // Writes to API routes OUTSIDE the protected prefixes (/api/upload,
  // /api/posts, /api/billing, /api/bookings, onboarding, ...) used to skip the
  // central write limiter entirely, because it only ran further down for
  // /admin, /dashboard and /platform. They authenticate inside their own
  // handlers, so here we only need a rate-limit key: the user id when the
  // session cookie verifies, else the client IP. Cron routes authenticate with
  // a bearer secret and are exempt.
  if (!isProtected) {
    if (isApiRoute && isWriteMethod(request.method) && !pathname.startsWith("/api/cron")) {
      let key = `write-ip:${getClientIp(request)}`;
      const requestToken = request.cookies.get(AUTH_COOKIE_NAME)?.value ?? getBearerToken(request);
      if (requestToken && JWT_SECRET) {
        try {
          const { payload } = await jwtVerify(requestToken, new TextEncoder().encode(JWT_SECRET), { algorithms: ["HS256"] });
          if (typeof payload.id === "string") key = `write:${payload.id}`;
        } catch {
          /* invalid token: keep the IP key, the route's own auth will reject it */
        }
      }
      const limited = await writeRateLimited(key);
      if (limited) return limited;
    }
    return nextWithSlug();
  }

  // ── Auth check ─────────────────────────────────────────────────────────────
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value ?? (isApiRoute ? getBearerToken(request) : null);

  if (!token) {
    log.warn("proxy_401_unauthenticated", { path: request.nextUrl.pathname });
    if (isApiRoute) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    const loginUrl = new URL(
      "/user/login",
      request.url
    );
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!JWT_SECRET) {
    console.error("JWT_SECRET is not set; denying access in proxy.");
    if (isApiRoute) return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    return NextResponse.redirect(new URL("/platform/login", request.url));
  }

  try {
    const secretKey = new TextEncoder().encode(JWT_SECRET);
    // Pin the algorithm (the API signs HS256 only) and refuse single-purpose tokens (bridge, ...):
    // they are not sessions and must never open a protected page.
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    if (payload.purpose) throw new Error("purpose-bound token is not a session");
    const typedPayload = payload as unknown as MiddlewareJWTPayload;
    let role = typedPayload.role?.toUpperCase();

    if (lockReason && tenant && !isPlatformPath) {
      const account = await getAuthenticatedAccount(request);
      if (account?.clubId === tenant.id) role = account.role.toUpperCase();
      if (role !== "SUPER_ADMIN") {
        if (!account || account.clubId !== tenant.id) {
          if (isApiRoute) return lockedApiResponse(lockReason);
          const loginUrl = new URL("/user/login", request.url);
          loginUrl.searchParams.set("redirect", pathname);
          return NextResponse.redirect(loginUrl);
        }

        if (isApiRoute) {
          if (role === "OWNER" && isOwnerProfileApi) {
            return nextWithSlug({ "x-user-id": account.id, "x-user-role": "OWNER" });
          }
          return lockedApiResponse(lockReason);
        }

        if (role === "OWNER" && (isOwnerReactivationPage || isOwnerProfilePage)) {
          return nextWithSlug({ "x-user-id": account.id, "x-user-role": "OWNER" });
        }
        if (role === "OWNER") {
          return NextResponse.redirect(new URL("/admin/reactivate", request.url));
        }
        return NextResponse.redirect(new URL("/club-suspended", request.url));
      }
    }

    // General write-rate-limit backstop — see WRITE_LIMIT comment above.
    if (isApiRoute && isWriteMethod(request.method)) {
      const limited = await writeRateLimited(`write:${typedPayload.id}`);
      if (limited) return limited;
    }

    // SUPER_ADMIN → platform only
    if (isPlatformPath) {
      if (role !== "SUPER_ADMIN") {
        log.warn("proxy_403_access_denied", { path: request.nextUrl.pathname, role: payload.role });
    if (isApiRoute) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
        return NextResponse.redirect(new URL("/user/login", request.url));
      }
      return nextWithSlug({ "x-user-id": typedPayload.id, "x-user-role": role });
    }

    if (role === "SUPER_ADMIN") {
      if (isApiRoute) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      return NextResponse.redirect(new URL("/platform", request.url));
    }

    // Admin/owner guard
    const isAdminPath =
      pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
    if (isAdminPath && !["ADMIN", "OWNER"].includes(role)) {
      if (isApiRoute) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // Owner-only UI pages
    const ownerOnlyPaths = ["/admin/stats", "/admin/promotions", "/admin/roles", "/admin/services", "/admin/logs", "/api/admin/logs", "/admin/appearance", "/api/admin/hero-model", "/admin/reactivate"];
    if (ownerOnlyPaths.some((p) => pathname.startsWith(p)) && role !== "OWNER") {
      if (isApiRoute)
        return NextResponse.json({ error: "Accès réservé au propriétaire" }, { status: 403 });
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    return nextWithSlug({ "x-user-id": typedPayload.id, "x-user-role": role });
  } catch (err) {
    log.warn("proxy_token_verification_failed", {
      path: request.nextUrl.pathname,
      reason: err instanceof Error ? err.name : "unknown",
    });
    const response = isApiRoute
      ? NextResponse.json({ error: "Session invalide" }, { status: 401 })
      : NextResponse.redirect(new URL("/user/login", request.url));
    // Same Domain/Path as the cookie was set with — a bare delete() is a no-op
    // against the production Domain=.host cookie.
    clearAuthCookie(response, request.url);
    return response;
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/platform/:path*",
    // Broad /api/:path* match is what makes the CSRF check above apply to
    // every write route platform-wide (auth, billing, onboarding, posts,
    // upload, bookings, ...) without listing each one individually. The
    // more specific /api/dashboard, /api/admin, /api/platform entries
    // below are now redundant with this but harmless to keep explicit.
    "/api/:path*",
    "/api/dashboard/:path*",
    "/api/admin/:path*",
    "/api/platform/:path*",
    // Also run on public routes to inject x-club-slug
    "/",
    "/coaching/:path*",
    "/offres/:path*",
    "/actualites/:path*",
    "/(public)/:path*",
    "/((?!api/|_next/|favicon.ico).*)",
    "/api/settings/public",
    "/api/plans/public",
    "/api/coaches/public",
    "/api/promotions/public",
    "/api/schedule/public",
    "/api/content/public/:path*",
  ],
};