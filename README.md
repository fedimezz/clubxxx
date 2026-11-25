# ClubX

ClubX is a French-first, multi-tenant sports-club management platform built with Next.js 16, React 19, TypeScript, Prisma, and PostgreSQL.

The platform has three operating areas:

- **Each club** has an isolated workspace, public website, member area, staff tools, schedule, payments, and branding.
- **Club owners and admins** manage members, coaches, subscriptions, sessions, bookings, posts, reports, website settings, and billing.
- **Platform super admins** manage the SaaS catalogue, clubs, payments, support requests, logs, and system-wide operations.

The repository is also prepared for one-host deployments through `/c/<club-slug>/...` and for subdomain deployments such as `club-a.example.com`.

> **Status:** the implementation and automated test suite are extensive. Live payment providers, wildcard DNS/TLS, browser walkthroughs, and a signed mobile release must still be verified in the target environment. See [Project status and known limitations](#project-status-and-known-limitations).

---

## Table of contents

1. [Main features](#main-features)
2. [System architecture](#system-architecture)
3. [Tenant routing](#tenant-routing)
4. [Roles and permissions](#roles-and-permissions)
5. [Page map](#page-map)
6. [Business rules](#business-rules)
7. [Authentication and session rules](#authentication-and-session-rules)
8. [Billing and payments](#billing-and-payments)
9. [SaaS plans and limits](#saas-plans-and-limits)
10. [Database model](#database-model)
11. [API map](#api-map)
12. [Background jobs](#background-jobs)
13. [Integrations](#integrations)
14. [Local setup](#local-setup)
15. [Environment variables](#environment-variables)
16. [Commands](#commands)
17. [Testing](#testing)
18. [Production deployment](#production-deployment)
19. [Project structure](#project-structure)
20. [Security model](#security-model)
21. [Project status and known limitations](#project-status-and-known-limitations)

---

## Main features

### Club members

- Register or sign in by email/password or Google OAuth when enabled.
- View personal KPIs, weekly activity, attendance, upcoming sessions, notifications, offers, and membership status.
- Browse an active weekly schedule.
- Reserve an open session and cancel a booking.
- View and search past or upcoming reservations.
- Subscribe to a club membership plan using card checkout or an available manual flow.
- View a digital membership card.
- Read, like, and comment on club news.
- Submit reports or complaints and track their status.
- Manage profile data, avatar, password, language, theme, and notification preferences.
- Receive in-app notifications and optionally device push notifications.

### Coaches

- Open a coach-specific dashboard.
- View coach statistics: sessions, reservations, attendances, and fill rate.
- View members assigned to their own sessions.
- Mark attendance or clear incorrect attendance according to owner-configured coach permissions.
- Edit a public coach profile, including photo, biography, phone, and specialties.

### Owners and club admins

- Monitor club KPIs, attendance, bookings, active members, revenue, and staff.
- Create, search, edit, suspend, reactivate, invite, and remove members.
- Create and manage coach profiles and club staff.
- Build weekly plans and individual sessions.
- Switch between calendar and weekly planning views.
- View and cancel bookings.
- Create and manage club membership offers.
- Sell or renew memberships and record onsite payments.
- Manage subscriptions and trial/paid club status.
- Publish news, promotions, notifications, and member reports.
- Configure branding, colors, logos, public pages, social links, timezone, and reservation cutoff.
- Choose from nine distinct public website templates, with independent theme and built-in 3D model selection.
- Use the owner-only Image Studio to upload or generate images, choose exact page placements, crop/reposition, replace, and remove them.
- Customize public-page text through the existing content editor without changing a theme's design identity.
- Configure role permissions for admins and coaches.
- Request website/theme/3D design changes after the initial setup is locked.
- Review activity logs and platform-facing service requests.
- Upgrade or reactivate the club SaaS subscription by card or manual payment.

### Platform super admin

- View platform-wide MRR, 30-day revenue, club counts, members, trials, and pending queues.
- Search, create, edit, suspend, reactivate, cancel, and inspect clubs.
- Change a club plan, extend a trial, reset an owner password, or delete a club.
- Create and edit SaaS plans, prices, billing periods, visibility, and limits.
- Approve or reject manual SaaS payment requests and then activate the club only after payment verification.
- Manage domain, website, service, and design requests.
- Review platform activity logs and system health.
- Configure platform-level service prices.

### Public club website

The platform host shows ClubX marketing and onboarding pages. A resolved club host shows that club's themed public site.

Public pages include:

- Home
- Offers/plans
- Coaching and coaches
- Schedule
- Gallery
- News/actualités
- Download
- Legal terms and privacy
- Reactivation and suspended-club states

Page availability, branding, theme, 3D hero model, text, and images are supplied from each club's `GymSettings` and `PageContent` records.

The nine selectable website templates are:

- **Modern Fitness** — industrial forge hero, steel navigation rail, bold condensed type, plate-style offers.
- **Premium Glass** — bento hero, translucent glass rail, soft gradients, tile-based offers.
- **Energetic Red** — arena/scoreboard hero, high-impact ticker navigation, diagonal accents, scoreboard offers.
- **Clean Minimal** — editorial hero, fine-line rail, spacious typography, typographic offer table.
- **Sporty Dark Blue** — sports-dashboard hero, dark technical rail, performance styling, HUD offer cards.
- **Nature & Wellness** — organic studio hero, floating navigation, calm shapes, soft offer cards.
- **Neon Purple** — illuminated grid/HUD hero and rail, futuristic typography, console-style offer list.
- **Classic Elegant** — framed salon hero, serif typography, double-rule navigation, engraved offer rows.
- **Bold Black & Yellow** — street-texture hero, tape-inspired rail, high-contrast cards and sticker-style offers.

Each has its own layout, navigation styling and behavior, desktop sidebar, section/card treatments, heading typography, pricing presentation, entrance motion, and responsive mobile navigation. Existing saved theme IDs resolve through aliases to the closest current design; aliases are not offered as extra choices. Theme switching does not overwrite the separately selected 3D hero model.

---

## System architecture

```text
Browser / mobile client
        |
        v
Next.js proxy.ts
  - tenant resolution
  - JWT/session guard
  - CSRF origin check
  - write rate limiting
  - club suspension/trial/paid-period checks
  - CSP and nonce headers
        |
        v
Next.js 16 App Router
  - React Server/Client Components
  - Route handlers under app/api
  - Public, member, admin, and platform pages
        |
        v
Authorization and tenant guards
  - requireUser / requireAdmin / requireOwner
  - requireCoach / requireSuperAdmin
  - plan limit and feature checks
        |
        v
Prisma 5 -> PostgreSQL

External services:
  Stripe -> SaaS and membership payments
  Cloudinary -> owner/member image uploads
  OpenAI Images API -> owner-requested website image generation
  Resend or SMTP -> email
  TextBee -> optional SMS
  Upstash Redis -> distributed limits and SSE-related infrastructure
```

Key application layers:

- `app/` — pages and API route handlers.
- `components/` — reusable public, member, admin, platform, schedule, and UI components.
- `context/` — authentication, theme, language, club settings, and member-shell state.
- `lib/` — tenant resolution, guards, billing, permissions, plan limits, validation, notifications, and integrations.
- `prisma/schema.prisma` — database schema.
- `prisma/migrations/` — ordered PostgreSQL migrations.
- `proxy.ts` — request-level routing and protection.

---

## Tenant routing

### Subdomain mode

On a real domain, a club slug is resolved from the first subdomain:

```text
club-a.example.com  -> Club where slug = "club-a"
club-b.example.com  -> Club where slug = "club-b"
example.com         -> ClubX platform/landing
```

In production, tenant identity comes from:

1. the request host;
2. a validated custom domain, if configured;
3. `x-club-slug` injected by `proxy.ts` in supported local/single-host cases.

Client-provided `clubId` values are never trusted as tenant identity.

### Single-host mode

On hosts such as `*.vercel.app`, or when explicitly enabled, a club is addressed through a path prefix:

```text
https://app.example/c/club-a
https://app.example/c/club-a/offres
https://app.example/c/club-a/api/dashboard
```

The proxy:

1. extracts the `/c/<slug>` prefix;
2. validates the slug;
3. resolves the club;
4. rewrites the path to the normal application route;
5. forwards `x-club-slug`;
6. remembers the club in an httpOnly cookie for normal navigation.

Platform-only paths such as `/platform`, `/onboarding`, and their APIs cannot inherit a club cookie.

### Local development

Modern browsers resolve `*.localhost` to local host. The seeded setup exposes:

```text
http://club-a.localhost:3000
http://club-b.localhost:3000
http://localhost:3000
```

A plain localhost host is the platform host. Development-only `x-club-slug` and `?club=<slug>` values are available for LAN/mobile testing but are ignored as tenant overrides in production.

### Reserved slugs

Slugs are DNS-safe and cannot use names reserved for platform infrastructure, for example `www`, `api`, `admin`, `app`, `platform`, `mail`, `cdn`, `static`, `onboarding`, `auth`, `login`, `register`, `billing`, or `clubx`.

---

## Roles and permissions

| Role | Club scope | Primary access |
|---|---|---|
| `SUPER_ADMIN` | None | Entire SaaS platform |
| `OWNER` | One club | Full club and SaaS-owner access |
| `ADMIN` | One club | Operational club access |
| `COACH` | One club | Own sessions, roster, stats, and profile |
| `MEMBER` | One club | Personal dashboard, schedule, booking, and membership |

### OWNER

The owner bypasses all configurable permission checks and has every club permission. Owner-only capabilities include SaaS billing and plan management. In a locked club, owner access is limited to profile/reactivation workflows.

### ADMIN

Admins receive permissions through the role-permission catalogue. A missing row keeps the historical/default behaviour. An explicit `allowed=false` row denies that capability.

Default-admin permissions include member and staff management, planning, bookings, memberships, payments, announcements, notifications, reports, and settings visibility. Sensitive capabilities such as certain website content or promotion changes may require explicit owner delegation.

Unknown permission keys fail closed.

### COACH

Coach capabilities are configurable separately:

- view own session roster;
- mark or remove attendance;
- view coach statistics;
- edit the coach public profile.

Admin and owner accounts bypass coach restrictions. A coach cannot access another coach's session or member scope.

### SUPER_ADMIN

Super admins have no gym `clubId`. They can operate across clubs but cannot accidentally enter gym-level role permissions.

---

## Page map

### Platform and landing

| Path | Description |
|---|---|
| `/` | Platform landing on the apex host; themed club home on a resolved club host |
| `/gallery` | Public gallery page |
| `/coaching` | Public coaching page and coach cards |
| `/offres` | Public membership offers |
| `/actualites` | Public news feed |
| `/download` | Mobile app/APK download page; APK controls appear only for a valid signed release |
| `/legal/terms` | Terms of use |
| `/legal/privacy` | Privacy notice |
| `/club-suspended` | Suspended-club state |
| `/reactivate` | Public club/reactivation flow |

### Authentication and onboarding

| Path | Description |
|---|---|
| `/login` | Login entry/bridge |
| `/register` | Registration entry/bridge |
| `/user/login` | Email/password member or staff login |
| `/user/register` | Member registration |
| `/user/forgot-password` | Request a password-reset code |
| `/user/reset-password` | Verify/reset a password |
| `/user/verify` | Account email verification |
| `/user/accept-invitation` | Accept an owner/admin invitation and set a password |
| `/user/onboarding` | User-side onboarding entry |
| `/onboarding` | Club-owner signup wizard |
| `/auth/sync` | Session synchronization/bridge page |

### Member dashboard

| Path | Description |
|---|---|
| `/dashboard` | Personal KPIs, weekly progress, activity, attendance, offers, and next session |
| `/dashboard/schedule` | Club schedule and booking controls |
| `/dashboard/bookings` | Search and manage personal reservations |
| `/dashboard/membership` | Membership status and purchase/renewal |
| `/dashboard/coach` | Coach dashboard redirect/space |
| `/dashboard/actualites` | News feed, likes, comments, and media |
| `/dashboard/notifications` | Notification center with read/clear actions |
| `/dashboard/profile` | Profile, avatar, password, and account data |
| `/dashboard/settings` | Language, theme, and notification preferences |
| `/dashboard/reports` | Member reports/complaints |

### Coach tools

The coach role operates from `/dashboard/coach` and its APIs:

- `/dashboard/coach` — coach overview;
- own session roster;
- attendance marking;
- coach statistics;
- public coach profile editing.

### Club admin

| Path | Description |
|---|---|
| `/admin` | Owner/admin KPI overview and setup checklist |
| `/admin/get-started` | Initial website setup mode selection |
| `/admin/website-setup` | Guided setup wizard |
| `/admin/members` | Member management |
| `/admin/staff` | Club staff overview |
| `/admin/staff/coaches` | Coach management |
| `/admin/schedule` | Weekly planning and calendar |
| `/admin/bookings` | Club-wide bookings |
| `/admin/plans` | Gym membership-plan catalogue |
| `/admin/subscriptions` | Member subscription lifecycle |
| `/admin/payments` | Payment ledger and onsite-payment recording |
| `/admin/billing` | Club SaaS subscription, renewal, and upgrade |
| `/admin/reactivate` | Reactivate a suspended, expired, or cancelled club |
| `/admin/promotions` | Discount/promotion management |
| `/admin/news` | Club news posts |
| `/admin/notifications` | Manual notification/broadcast tools |
| `/admin/reports` | Member report workflow |
| `/admin/roles` | Admin and coach permission toggles |
| `/admin/appearance` | Theme and appearance settings |
| `/admin/image-studio` | Owner-only upload/generation, image placement, and crop controls |
| `/admin/services` | Professional/domain/service requests |
| `/admin/theme-requests` | Theme/design change requests |
| `/admin/website-setup` | Website configuration and setup |
| `/admin/settings` | Club identity, branding, social links, and public settings |
| `/admin/profile` | Owner/admin profile |
| `/admin/logs` | Club audit log |
| `/admin/payments` | Club/member payment tools |

### Platform super admin

| Path | Description |
|---|---|
| `/platform/login` | Super-admin login |
| `/platform` | Platform overview and queues |
| `/platform/clubs` | Club search and management |
| `/platform/clubs/[id]` | Club detail and lifecycle controls |
| `/platform/plans` | SaaS plan catalogue and limits |
| `/platform/manual-payments` | Manual SaaS payment verification |
| `/platform/domain-requests` | Custom-domain requests |
| `/platform/website-requests` | Website change requests |
| `/platform/design-requests` | Theme/3D change requests |
| `/platform/service-requests` | Professional setup/service requests |
| `/platform/logs` | Platform activity log |
| `/platform/system` | System configuration and health |

---

## Business rules

### Club onboarding

1. The founder enters and verifies an email with a six-digit code.
2. The founder chooses whether to start the trial or pay.
3. The club slug and club identity are validated.
4. A theme preset and brand colors are stored.
5. A trial club can receive a 14-day trial by default.
6. A paid signup is closed until a signed Stripe webhook or super-admin manual verification activates it.
7. A failed or expired card checkout can remove an unpaid pending club so signup can be retried.
8. Tunisia/TND manual-payment users can create a request instead of card checkout.

Every club also receives a hidden/free 14-day trial SaaS tier. The trial plan is never sold as a public plan.

### Trial and paid club access

- Trials default to 14 days and can be configured between 1 and 90 days.
- An expired trial is refused by the tenant/access check even if the cron has not run.
- Paid clubs receive a period end and optional grace window.
- The default paid-period grace is 3 days, configurable from 0 to 30.
- A club past its grace period is not usable.
- Platform-managed subscriptions with no period end do not expire by date.
- Suspended or cancelled clubs cannot use the normal club app or public club site.
- Owner profile and reactivation routes remain available.
- Reactivation requires Stripe confirmation or super-admin manual verification.
- Expired clubs keep their database records; this implementation does not delete club data.

### Session scheduling

- Schedule data belongs to an active `WeeklyPlan`.
- A session has day, start time, end time, activity, coach, capacity, location, and description.
- Calendar navigation is based on ISO date arithmetic rather than local-midnight date mutation.
- The club timezone controls interpretation of wall-clock session times.
- The reservation cutoff defaults to 20 minutes and can be configured per club from 0 to 1440 minutes.
- Reservation is open only when `sessionStart - now > cutoffMinutes`.
- At exactly the cutoff, or once the session has started, booking is closed.
- The server-side booking transaction enforces the cutoff; client state is only informational.
- Cancelling an existing booking is not controlled by the reservation cutoff.

### Member booking

- A member cannot reserve the same session twice.
- A session may not exceed its capacity.
- Only non-cancelled reservations count toward capacity and monthly booking limits.
- Reservation and attendance rules are evaluated for the member's own club.
- Cancellation does not erase the booking row; it sets cancellation state and timestamp.

### Membership subscription

- `MembershipPlan` and member `Subscription` are separate from club SaaS subscriptions.
- A member subscription has start/end dates and `PENDING`, `ACTIVE`, `EXPIRED`, `CANCELLED`, or `SUSPENDED` status.
- Club membership prices can use TND or another configured membership currency.
- A card or Stripe payment activates the member subscription only through the verified payment workflow.

### Website customization

- After initial setup, site-wide theme/customization may become locked.
- The owner can complete one setup wizard or manual setup step.
- Later theme/hero-model changes require a design-change request and an approved, short-lived, single-use grant.
- Post-lock content and settings changes use a website-change request workflow.
- Database-side triggers also enforce design locking; application validation is not the only control.
- Exactly nine distinct themes are offered for new choices; previous saved theme IDs are mapped to current themes so existing club sites continue to render.
- Theme and image customization are independent of the built-in 3D hero selector. Selecting a theme preserves the chosen built-in model.
- The Image Studio exposes the existing page-content image fields: home introduction and gallery; news header; gallery cover and Fitness/Padel/Pool galleries; coaching header and three cards; and offers header.
- Uploads and generated images use the authenticated club's existing upload/storage path. The server derives the tenant from the signed-in account; callers cannot select a `clubId`.
- Crop position and zoom are bounded and persisted with the corresponding image in that club's `PageContent` record. Replacing/removing a gallery image also updates its position metadata.
- Text remains editable through the existing `/admin/website-setup` content editor. Theme-specific layouts, typography, sections, and navigation remain in place when owners change text or images.
- Image generation is an optional server-side OpenAI integration, limited to six requests per hour per owner and club. Generated previews are not placed on the site until saved to a selected image slot.
- Uploading an owner-owned custom 3D model requires the club plan's `customHeroModel` feature.

### Data isolation

- The `Club` row is the tenant boundary.
- Tenant-owned models contain `clubId` or belong through a club-owned parent.
- Every club query must include the resolved club id.
- The owner/admin auth guard rechecks the real database account, role, club, and active state rather than trusting stale JWT claims.
- No route should accept a client-supplied `clubId` as proof of tenant ownership.

---

## Authentication and session rules

- Passwords are hashed with bcryptjs.
- Sessions use signed HS256 JWTs in httpOnly, same-site cookies.
- Session lifetime is seven days by default.
- A password change or reset sets `passwordChangedAt`; older JWTs are rejected.
- Suspension or role change takes effect in the account recheck and is immediately invalidated through the account cache helper.
- Super admins are excluded from club tenant resolution.
- In single-host mode, club identity is carried in a separate club cookie, not by impersonating a subdomain.
- Logout clears host-only and legacy cookie variants.
- Bridge tokens for onboarding or OAuth are short-lived, purpose-bound, nonce-bound, and single-use.
- Non-browser cron callers use bearer or dedicated cron authentication rules.
- Protected APIs return `401` for missing/invalid sessions.
- Suspended clubs return `402` with `code: "CLUB_LOCKED"` and a reason from protected APIs.

Google OAuth is disabled unless `GOOGLE_AUTH_ENABLED=1` and valid Google credentials/redirect settings are configured. It is not a password takeover mechanism for an existing unverified account.

---

## Billing and payments

### Club SaaS subscription

The club's subscription to ClubX is stored in `ClubSubscription` and is separate from member subscriptions.

Billing periods:

- `MONTHLY`
- `YEARLY`

The SaaS plan has independent monthly and yearly prices and a currency. The price is read from the database at checkout time, not from the browser.

For card payments:

1. the owner requests checkout or reactivation;
2. the server creates a Stripe Checkout session;
3. the club and payment ledger are pending;
4. only a signed `checkout.session.completed` or the relevant successful webhook event activates the club;
5. period end comes from the server ledger's plan and period, not an arbitrary client value.

Supported webhook events include:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Optional recurring Stripe subscriptions are off by default. When enabled, the configured webhook also handles invoice paid/failed and subscription deletion events.

### Manual SaaS payments

Manual payment is available for methods such as bank transfer, D17, Flouci, or cash.

Lifecycle:

```text
PENDING -> APPROVED -> verified and activated
                       or
PENDING -> REJECTED/CANCELLED
```

Approval alone does not activate the club. A super admin must verify the payment and enter a reference. Activation is compare-and-set to avoid duplicate ledger entries and club reactivation.

Abandoned manual-onboarding clubs can remain pending until platform staff process them.

### Club membership payments

Member payments are recorded in `Payment` with method, provider, country, status, transaction reference, and paid time. Available flows include Stripe and manual onsite/payment methods.

### Renewals

Renewal reminders are sent through `/api/cron/renewal-reminders`:

- 7 days before period end;
- 3 days before period end;
- 1 day before period end.

Each threshold is stored against the exact period end so the same reminder is not repeatedly sent. Recurring-card clubs do not receive these SaaS renewal reminder e-mails.

Renewing the same SaaS plan while a period is running can continue from the existing period end. A plan change or lapsed subscription starts a new period.

---

## SaaS plans and limits

The seed defines:

| Plan | Purpose | Members | Coaches | Admin seats | Bookings/month | Other features |
|---|---|---:|---:|---:|---:|---|
| Trial | New club, 14-day default | 30 | 2 | 2 | 100 | No custom domain/advanced analytics/revenue/API/white-label/custom 3D |
| Starter | Legacy/withdrawn from public offers | 100 | 3 | 2 | 500 | Basic features |
| Pro | Public paid tier | 500 | 15 | 10 | 3000 | Custom domain, advanced analytics, revenue analytics, custom 3D |
| Business | Public paid tier | Unlimited | Unlimited | Unlimited | Unlimited | All limit flags, custom domain, analytics, API, white-label, custom 3D |

The limits stored in `SaasPlan.limits` are the source of truth. Super admins can edit prices, limits, visibility, and billing periods. Numeric limits can be `null` for unlimited/fair-use behavior.

Before creating a resource, the application calls `checkLimit()` or `checkFeature()`. Numeric usage is counted from the database. Boolean features return an upgrade-required state. Missing or cancelled/suspended SaaS subscriptions fail closed.

Plan limits currently include:

- active members;
- coaches;
- owner/admin seats;
- bookings created during the current month;
- custom pages;
- custom domains;
- advanced analytics;
- revenue analytics;
- API access;
- white-label mode;
- custom 3D hero model.

---

## Database model

PostgreSQL is the primary database. Prisma models use per-club indexes and uniqueness where appropriate.

### Core tenant and SaaS models

- `Club`
- `SaasPlan`
- `ClubSubscription`
- `SaasPayment`
- `GymSettings`
- `ManualPaymentRequest`

### Identity and authorization

- `User`
- `RolePermission`
- `UserPreferences`
- `DeviceToken`
- `OnboardingEmailVerification`

### Members and clubs

- `MembershipPlan`
- `Subscription`
- `Payment`
- `MembershipCard`
- `MemberReport`

### Scheduling

- `Coach`
- `WeeklyPlan`
- `Session`
- `UserSession`
- `Attendance`

### Communication and content

- `Post`
- `Like`
- `Comment`
- `Notification`
- `PageContent`

### Website and support

- `ClubHeroModel`
- `WebsiteChangeRequest`
- `DesignChangeRequest`
- `DomainRequest`
- `ServiceRequest`
- `ServicePrice`

### Audit

- `ActivityLog`
- `Promotion`

`Like` and `Comment` are intentionally reached through club-scoped posts rather than given redundant club columns. Platform-level `ActivityLog` rows have a null `clubId`.

The migration history includes tenant isolation, billing periods, recurring Stripe support, trial rules, email verification, renewal reminders, plan visibility, payment country/currency fields, service requests, timezone, reservation cutoff, indexes, and design-lock protections.

---

## API map

Every API route is under `/api`. Protected routes perform authorization server-side and re-read the tenant/account state. Public routes still apply origin, anti-abuse, and plan checks where relevant.

### Authentication

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/auth/verify`
- `POST /api/auth/verify`
- `POST /api/auth/reset-password`
- `POST /api/auth/resend-code`
- `GET/POST /api/auth/bridge`
- `GET /api/auth/accept-invitation`
- Google OAuth start/callback routes

### Onboarding

- slug availability;
- email-code send/verify;
- club creation;
- onboarding checkout completion;
- onboarding cancellation.

### Member dashboard

- dashboard KPI/activity payload;
- membership status and subscribe/resume;
- profile and password;
- schedule and public schedule;
- create/cancel bookings;
- notifications/read/clear;
- reports;
- settings;
- news posts, likes, and comments.

### Coach dashboard

- coach sessions and roster;
- attendance;
- coach profile;
- coach statistics.

### Club admin

The admin route surface includes:

- `/api/admin/dashboard`
- `/api/admin/members`
- `/api/admin/staff`
- `/api/admin/coaches`
- `/api/admin/schedule`
- `/api/admin/bookings`
- `/api/admin/subscriptions`
- `/api/admin/payments`
- `/api/admin/plans`
- `/api/admin/promotions`
- `/api/admin/reports`
- `/api/admin/member-reports`
- `/api/admin/notifications`
- `/api/admin/roles`
- `/api/admin/settings`
- `/api/admin/page-content`
- `/api/admin/website-setup`
- `/api/admin/website-change-requests`
- `/api/admin/domain-request`
- `/api/admin/service-request`
- `/api/admin/design-change`
- `/api/admin/hero-model`
- `/api/admin/logs`
- `/api/admin/stats`
- `/api/admin/system`
- `/api/admin/billing`

### SaaS billing

- `/api/billing/status`
- `/api/billing/trial`
- `/api/billing/checkout`
- `/api/billing/manual-request`
- `/api/billing/portal`
- `/api/billing/reactivate`
- `/api/billing/upgrade`

### Stripe

- `/api/payments/stripe/webhook`
- `/api/payments/country`

The Stripe webhook is excluded from normal CSRF and browser auth checks and validates its Stripe signature instead.

### Platform

- `/api/platform/overview`
- `/api/platform/clubs`
- `/api/platform/plans`
- `/api/platform/manual-payments`
- `/api/platform/domain-requests`
- `/api/platform/website-requests`
- `/api/platform/design-requests`
- `/api/platform/service-requests`
- `/api/platform/service-prices`
- `/api/platform/logs`
- `/api/platform/system`

### Public and infrastructure

- public club settings and page content;
- public plans, offers, coaches, schedule, and promotions;
- club search;
- app release/download metadata;
- hero-model delivery;
- upload;
- health check;
- Server-Sent Events;
- device tokens;
- cron endpoints.

---

## Background jobs

The cron routes require `CRON_SECRET` or the supported cron bearer mechanism.

| Route | Responsibility |
|---|---|
| `/api/cron/trial-check` | Detect expired trials, update club access, notify owners, and write audit entries |
| `/api/cron/subscription-renewal` | Detect paid-period expiry/grace expiry and suspend access |
| `/api/cron/renewal-reminders` | Send 7/3/1-day SaaS renewal reminders without duplicates |
| `/api/cron/session-reminders` | Send scheduled session reminders |

Vercel cron configuration should point to these routes in production and secure them with `CRON_SECRET`.

---

## Integrations

### PostgreSQL / Prisma

PostgreSQL stores all tenants and business records. Prisma handles migrations and type-safe queries.

### Cloudinary

Cloudinary stores uploaded logos, avatars, news images, Image Studio uploads/generated images, and public website media. Generic uploads are placed in a tenant folder (`clubs/<clubId>`), with the tenant always taken from the authenticated account.

The `storageGB` plan limit is enforced against Cloudinary assets, inline data-URL avatars stored in PostgreSQL, and custom 3D hero models stored in PostgreSQL. Cloudinary assets are recorded in a per-club ledger; database-stored files are counted from their source rows. Uploads reserve capacity under a per-club database lock, then finalize or release the reservation after the provider operation. The configured limit uses decimal GB (1 GB = 1,000,000,000 bytes).

Existing clubs are created with an incomplete Cloudinary inventory after the storage migration. Their uploads fail closed until the paginated backfill completes. See [Production deployment](#production-deployment) for the required one-time command.

### Stripe

Stripe handles card checkout for SaaS plans and member plans, signed webhooks, optional recurring subscriptions, and the owner customer portal.

### Resend and SMTP

Resend is the primary email provider when configured. SMTP is a fallback option for verified domain or personal mail servers.

### TextBee

TextBee provides optional SMS OTPs and notifications. SMS verification must remain disabled unless its API and verification policy are configured.

### Push notifications

Expo push tokens can be registered through the device API. Push delivery is optional and requires `EXPO_ACCESS_TOKEN`.

### Google OAuth

Google sign-in is feature-flagged and disabled by default.

### OpenAI Images

The owner-only `POST /api/admin/image-studio/generate` route calls the OpenAI Images API from the server. `OPENAI_API_KEY` is never sent to the browser. The route validates prompt length, applies a per-owner/per-club rate limit, and returns a temporary image preview; the owner then saves it through the normal tenant-scoped upload route and chooses its page slot in the Image Studio. Without the key configured, image generation returns a clear service-unavailable response; local uploads remain available.

---

## Local setup

### Prerequisites

- Node.js 20.9 through Node 24
- npm
- Docker with Docker Compose
- PostgreSQL 16 is used in the included compose setup

Node 22 is the recommended runtime.

### One-command setup

On Windows, run the script with Git Bash or WSL:

```bash
bash scripts/fresh-start.sh
```

The script:

1. checks Node, npm, and Docker;
2. starts PostgreSQL on host port `5433`;
3. creates `.env` if it does not exist;
4. installs dependencies;
5. generates Prisma Client;
6. applies migrations;
7. seeds demo plans and tenants;
8. starts `npm run dev`.

Setup-only mode:

```bash
bash scripts/fresh-start.sh --no-dev
```

Reset the local database volume:

```bash
bash scripts/fresh-start.sh --reset
```

The reset option is destructive and removes the local Docker database volume.

### Manual setup

```bash
npm ci
cp .env.example .env
docker compose up -d db
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Set at least:

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `APP_URL`
- `NEXT_PUBLIC_APP_URL`
- `CRON_SECRET`

### Demo accounts

After development seeding, all demo accounts use password `Demo123!`:

| Account | Email |
|---|---|
| Club A owner | `owner.a@demo.local` |
| Club A admin | `admin.a@demo.local` |
| Club A coach | `coach.a@demo.local` |
| Club A member | `member.a@demo.local` |
| Club B owner | `owner.b@demo.local` |
| Club B admin | `admin.b@demo.local` |
| Club B member | `member.b@demo.local` |
| Super admin | `superadmin@platform.local` |

Open demo clubs through `club-a.localhost:3000` and `club-b.localhost:3000`. Open super-admin login through `localhost:3000/platform/login`.

Demo accounts and clubs are not created in production seed mode.

---

## Environment variables

Use `.env.example` as the full template.

### Required database and application

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled PostgreSQL URL |
| `DIRECT_URL` | Direct PostgreSQL URL used by migrations |
| `JWT_SECRET` | Session signing secret; at least 32 characters in production |
| `APP_URL` | Public apex URL without trailing slash |
| `NEXT_PUBLIC_APP_URL` | Public apex URL exposed to the browser |
| `CRON_SECRET` | Authentication secret for cron routes |

### Platform bootstrap

| Variable | Purpose |
|---|---|
| `SUPER_ADMIN_EMAIL` | Initial/seeded super-admin email |
| `SUPER_ADMIN_PASSWORD` | Initial super-admin password; at least 12 characters |

### Production integrations

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Distributed rate limiting/Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Redis token |
| `RESEND_API_KEY` | Resend email API key |
| `RESEND_FROM` | Verified sender |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional SMTP fallback |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `OPENAI_API_KEY` | Server-only API key for optional Image Studio generation |

### Stripe

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe server key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_RECURRING_ENABLED` | Enable recurring subscriptions |
| `SAAS_PLAN_UPGRADES_ENABLED` | Allow SaaS plan changes in production |
| `PAID_PERIOD_GRACE_DAYS` | Paid-period grace from 0 to 30; default 3 |
| `DEFAULT_TRIAL_DAYS` | Trial length from 1 to 90; default 14 |

Register the webhook at:

```text
https://<APP_URL>/api/payments/stripe/webhook
```

### Manual payments and contact

| Variable | Purpose |
|---|---|
| `MANUAL_PAYMENT_INSTRUCTIONS` | Bank/D17/Flouci/cash instructions shown to owners |
| `PLATFORM_ALERT_EMAIL` | Alert mailbox for new manual payment requests |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Public contact mailbox |
| `LEGAL_ENTITY_NAME` | Publisher identity |
| `LEGAL_ADDRESS` | Publisher address |
| `LEGAL_REGISTRATION` | Registration number |

### Optional authentication and push

| Variable | Purpose |
|---|---|
| `GOOGLE_AUTH_ENABLED` | Set to `1` to enable Google OAuth |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `GOOGLE_REDIRECT_URI` | Google callback URL |
| `SMS_VERIFICATION_ENABLED` | Enable SMS verification |
| `TEXTBEE_API_KEY` | TextBee API key |
| `EXPO_ACCESS_TOKEN` | Expo push credentials |

### APK download

The signed APK button appears only if all required variables are valid:

- `ANDROID_APK_URL`
- `ANDROID_APK_VERSION`
- `ANDROID_APK_SHA256`
- `ANDROID_APK_SIGNED=true`
- `ANDROID_APK_RELEASE_NOTES`

Optional:

- `ANDROID_APK_RELEASED_AT`
- `ANDROID_PLAY_URL`
- `NEXT_PUBLIC_IOS_TESTFLIGHT_URL`

### Routing

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SINGLE_HOST_MODE` | Force single-host mode on/off |
| `DEV_DEFAULT_CLUB_SLUG` | Development-only fallback tenant |
| `TRUSTED_PROXY_HOPS` | Reverse-proxy trust depth for client IP calculation |

Never commit real secrets or production credentials.

---

## Commands

```bash
npm run dev          # start Next.js development server
npm run build        # generate Prisma client, then build Next.js
npm run start        # start production build
npm run lint         # ESLint
npm run typecheck    # TypeScript noEmit check
npm test             # Vitest run
npm run validate     # lint + typecheck + tests
npm run db:migrate   # prisma migrate deploy
npm run db:migrate:dev
npm run db:seed
npm run db:studio
npm run storage:backfill # reconcile existing Cloudinary assets after migration
npm run setup        # fresh-start script
```

---

## Testing

Tests use Vitest and live primarily beside route implementations in `app/**/__tests__` and shared-library test trees.

The suite covers, among others:

- tenant and cross-club isolation;
- authentication and password/session revocation;
- login hardening and logout;
- Google OAuth;
- onboarding and email verification;
- Stripe checkout and webhook replay;
- recurring Stripe events;
- manual and platform manual payments;
- SaaS plan limits and plan visibility;
- member role changes;
- booking cutoff and capacity;
- trial and paid-period expiry;
- renewal reminders;
- service/domain/website/design requests;
- public and legal pages;
- app-release URL/checksum validation;
- device and push infrastructure;
- admin dashboards and permission handling;
- tenant custom domains and routing;
- SSE and notification behavior;
- PostgreSQL design-lock triggers.

Run the complete validation:

```bash
npm run validate
```

Run a focused test file:

```bash
npx vitest run app/api/<area>/__tests__/<test>.test.ts
```

Test databases and mocked integrations should be isolated from production credentials.

---

## Production deployment

### Database

Use a pooled PostgreSQL URL for `DATABASE_URL` and a direct URL for `DIRECT_URL`. Apply migrations before opening traffic:

```bash
npm run db:migrate
```

After deploying the version that enforces storage quotas to every app instance, run the Cloudinary inventory backfill once before allowing uploads:

```bash
npm run storage:backfill
```

The command requires the production `DATABASE_URL` and Cloudinary credentials. It scans each `clubs/<clubId>` asset folder across image, video, and raw resources, follows Cloudinary pagination, and rebuilds the per-club ledger. It is safe to rerun: each club is marked incomplete while its inventory is rebuilt, so uploads for that club remain blocked if the scan fails or is interrupted. Retry after resolving the provider/database error. Do not run multiple backfills concurrently; active uploads cause the affected club's scan to stop and require a retry.

Pause upload traffic while migrating and rolling out if older app instances may remain active; older versions do not create reservations or ledger entries. Keep uploads paused until every instance runs the new code and the backfill completes. Rerun the command after out-of-band Cloudinary asset deletions or changes to reconcile the ledger.

Newly provisioned clubs start with an empty, complete inventory. Existing clubs do not; running the backfill is a deployment prerequisite. No live Cloudinary inventory or backfill is run as part of repository tests.

Seed only the SaaS plans and super admin in production:

```bash
npm run db:seed
```

Production seed mode is activated by `NODE_ENV=production` or `SEED_PLANS_ONLY=1`. Demo clubs and demo passwords are excluded.

### Domain routing

For subdomain mode:

- configure a wildcard DNS record for club subdomains;
- configure wildcard TLS;
- set `APP_URL` to the bare platform origin;
- configure club slugs and, optionally, custom domains.

For Vercel/free-host mode:

- ensure `APP_URL` is the full HTTPS host;
- leave or enable single-host mode;
- use `/c/<slug>` club links;
- retain `/platform` and `/onboarding` as platform-only paths.

### Reverse proxy

Set `TRUSTED_PROXY_HOPS` only if the app is behind a known proxy count. Client IP limiting depends on this setting.

### Stripe

- use test mode until the full webhook flow is verified;
- register the signed webhook;
- configure recurring events only if recurring mode is enabled;
- set `SAAS_PLAN_UPGRADES_ENABLED=true` only after billing policy is ready;
- verify monthly and yearly purchases, failures, expiry, plan switches, and manual fallbacks.

### Security

- use a long random `JWT_SECRET`;
- use a separate strong `CRON_SECRET`;
- serve over HTTPS;
- keep webhook secrets private;
- restrict database and provider admin access;
- configure Cloudinary and Stripe allowed operations;
- review legal and privacy text with an appropriate professional before real customer use.

---

## Project structure

```text
app/
  (public)/                 Public club marketing pages
  admin/                    Club-owner/admin area
  dashboard/                Member and coach area
  platform/                 Super-admin area
  user/                     Authentication and account pages
  api/                      Server route handlers
  legal/                    Terms and privacy
components/
  admin/                    Admin UI
  dashboard/                Member dashboard UI
  member/                   Member widgets/cards/charts
  platform/                 Platform UI
  layout/                   Public layout/navigation
  schedule/                 Planning/calendar UI
  themes/                   Club public themes
context/
  AuthContext.tsx
  ClubSettingsContext.tsx
  LanguageContext.tsx
  ThemeContext.tsx
lib/
  auth.ts
  tenant.ts
  guards.ts
  plan-limits.ts
  permissions.ts
  billing-period.ts
  reservation-cutoff.ts
  stripe/billing helpers
prisma/
  schema.prisma
  migrations/
  seed.ts
  tests/
scripts/
  fresh-start.sh
proxy.ts
next.config.ts
```

---

## Security model

### Request protection

`proxy.ts`:

- validates JWT cookies;
- injects tenant identity;
- sends a nonce-backed CSP;
- applies CSRF checks to mutating API routes;
- applies a 60-request-per-minute write backstop to authenticated API writes;
- applies route and club-lock redirects;
- prevents cross-role entry into admin/platform/member areas.

Some auth entry points and Stripe webhooks bypass normal auth/CSRF handling and implement their own verification.

### Handler protection

Route handlers must:

- call the matching `requireUser`, `requireAdmin`, `requireOwner`, `requireCoach`, or `requireSuperAdmin`;
- assert that club roles contain a real `clubId`;
- scope database reads/writes to that club;
- revalidate plan/feature limits before writes;
- validate body/query input;
- log significant mutations;
- return consistent `401`, `402`, `403`, `404`, and `429` errors.

### CSRF

State-changing API requests are checked by origin. The origin must match the platform apex or a subdomain/custom domain authorized for the deployed origin.

### Rate limits

- authenticated write traffic has a centralized backstop;
- auth/onboarding/slug and sensitive public endpoints have route-specific limits;
- Upstash Redis is used in production when configured;
- Redis/limiter failure may fail open for the central backstop, but route-specific and auth protections remain code-level.

### CSP and headers

The application adds nonce-based CSP, HSTS, `nosniff`, referrer restrictions, permissions restrictions, and clickjacking/frame protections.

---

## Project status and known limitations

This README describes the repository as implemented. The following items still require real-world verification or remain intentionally limited:

- no live Stripe checkout, webhook, renewal, or portal run is guaranteed;
- Stripe recurring subscriptions are built but off by default;
- no wildcard DNS/TLS deployment is verified here;
- no real Cloudinary, Resend, SMTP, TextBee, Upstash, Google OAuth, or SMS account is assumed;
- no signed APK or AAB is included;
- browser flows have automated coverage but still need deployment-level walkthroughs;
- timezone/cutoff settings are stored and enforced, but the settings UI should be verified from the owner workflow;
- custom-domain support is represented and may require external DNS/provisioning operations;
- Cloudinary storage quotas require the one-time inventory backfill for existing clubs after the storage migration; no provider-backed backfill has been run here;
- custom-page count is not yet enforced as a resource quota;
- abandoned manual onboarding signups remain pending until a platform operator acts;
- existing clubs with expired periods may become suspended on the next access check after deploying paid-period enforcement;
- legal pages exist but must be reviewed before real customer use;
- email behavior depends on provider configuration; development may log/send through configured SMTP/Resend behavior;
- no owner data-export workflow is implemented for locked/expired clubs;
- uploaded images receive signature checks; video/audio validation still relies on Cloudinary, and no live provider workflow was exercised here;
- monitoring/error telemetry is not a production-ready Sentry integration.

For historical implementation and verification notes, also read [PROJECT_STATUS.md](PROJECT_STATUS.md).
