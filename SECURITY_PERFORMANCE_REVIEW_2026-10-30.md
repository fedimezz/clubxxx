# ClubX — security & performance review (2026-10-30)

## Verdict
The code base was already in good shape (verified, not assumed). The main real risk was **outdated dependencies with a
critical Next.js RCE**; the rest are hardening and performance items, all fixed below.

## Security — what I checked and found solid (no change needed)
- Auth: JWT HS256 pinned, secret length enforced in prod, session re-checked in DB per request (8 s cache),
  password change revokes old tokens, role/tenant re-verified from the DB (never from the token or request body).
- Tenant isolation: every delete/update I sampled (≈25 routes) first loads the row with `clubId`; production tenant
  comes from the Host header only (x-club-slug / ?club= are dev-only).
- CSRF: same-origin Origin check on every non-GET /api route. Cookies: httpOnly, SameSite=Lax, Secure on HTTPS.
- Rate limits on login, register, verify, resend, reset, invitation, onboarding, uploads, plus a global write limiter;
  fails CLOSED in production (covered by tests).
- Uploads: size caps while streaming, magic-byte check, SVG blocked, member vs staff limits, per-user hourly cap.
- Stripe webhook: signature verified, amounts checked. All raw SQL uses parameterised tagged templates. No eval/exec.
- CSP with per-request nonce + strict-dynamic, HSTS, frame-ancestors, object-src none.

## Security — fixed
1. **[CRITICAL] Next.js 16.3.8 → 16.4.1** (npm audit: unauthenticated RCE in the image optimizer with SVG, RCE in
   `use cache`, Server Actions DoS). Also **zod → 4.6.7** (high: memory exhaustion) and **nodemailer → 10.2.1**
   (address-parser recipient injection). `npm audit --omit=dev`: **0 vulnerabilities**.
2. proxy.ts: client-sent `x-user-id`, `x-user-role`, `x-nonce` (and `x-club-slug` in production) are stripped before
   forwarding; the edge JWT check pins HS256 and refuses single-purpose (bridge) tokens.
3. A malformed `%` in the auth cookie threw (500); it is now a clean 401.
4. Client IP for rate limits: on Vercel uses the platform header; self-hosted can set `TRUSTED_PROXY_HOPS=N` so a
   spoofed left-most `X-Forwarded-For` can no longer dodge every limit.
5. SSE: max 5 open streams per user (each holds a socket + a Redis subscription).
6. Headers: Cross-Origin-Opener-Policy `same-origin-allow-popups`, X-Permitted-Cross-Domain-Policies `none`,
   tighter Permissions-Policy.
7. Member card numbers are now cryptographically random (the old timestamp+0..999 was guessable and could collide).
8. Trial plan: can never be purchased (checkout / reactivate / manual payment) or made public.

## Performance — fixed
- Images: resized by Cloudinary/Unsplash CDN, not by the Node server (ends the timeouts); uploads capped at 2000 px.
- SMTP: one pooled transporter instead of a new TLS connection per e-mail.
- Announcements: e-mail/SMS sent 8 at a time (was: all at once — 500 members = 500 simultaneous connections).
- DB: 5 new indexes for attendance (by club/date, by member/date), notifications, audit log (migration
  `20261030000100_hot_path_indexes`, `IF NOT EXISTS`, additive).
- Bundle: `optimizePackageImports` for lucide-react / react-icons / framer-motion; `compress: true`.
- `userPreferences` get-or-create is atomic (no more P2002 storms).

## Known / not changed (your call)
- bcrypt cost is 10 (fine; 12 is stronger but ~4× slower on login — pure-JS bcryptjs).
- Storage quota (`storageGB`) is not enforced on uploads: a trial club can still upload up to the hourly cap.
- Account-status cache is 8 s per instance (suspension is not instant across instances).
- Rotate any provider keys that were ever pasted into chats/logs (Cloudinary, Resend, JWT_SECRET).

## To apply
```
npm install
npx prisma migrate deploy      # TRIAL enum + indexes
npx prisma generate
npm run build && npm start
```
Not verified here: `next build` and a browser run (Prisma engine download is blocked in my sandbox).
Unit tests: everything not needing a generated Prisma client passes.
