# Phase 0 Research: Festival POS — Serverless MVP

**Feature**: `001-festival-pos-third-variant`
**Date**: 2026-05-28

All decisions are either mandated by the user brief or clearly derived from it. **No [NEEDS CLARIFICATION]** items remain open.

## D1. Single Nuxt 4 Project (frontend + API in one deployment)

- **Decision**: Frontend and API live in the same Nuxt 4 project; the API is implemented as Nitro server routes under `server/api/**`.
- **Rationale**: Constraint "one deployment", no two Vercel projects, no second hosting. Eliminates CORS, simplifies auth cookies, halves build and env effort.
- **Alternatives considered**:
  - Separate Hono API deployment (as in `feature-secondTry`) → doubles hosting, breaks "free + one provider".
  - Edge functions (Cloudflare/Workers) → Drizzle + Neon driver work most reliably in the Node runtime; no benefit for the MVP.

## D2. Hosting on Vercel Hobby + Neon Free

- **Decision**: Vercel Hobby for app + functions, Neon Free as the default Postgres.
- **Rationale**: Vercel is the official Nuxt recommendation, and Nitro has a first-class `vercel` preset. Neon offers Postgres with a serverless driver (`@neondatabase/serverless`), branching for preview deployments, and a free tier sufficient for MVP load.
- **Alternatives considered**:
  - Supabase Free → equivalent, more features (auth/storage), but the additional auth complexity is not needed. Remains an **acceptable alternative** should Neon fail during the test festival; **not both in parallel**.
  - PlanetScale/Turso → no pure Postgres compatibility, or forced custom driver.

## D3. Drizzle ORM instead of Prisma

- **Decision**: Drizzle ORM + drizzle-kit.
- **Rationale**: Drizzle is serverless-friendly (small, no generated client binary layer, no engine process), compatible with `@neondatabase/serverless`, offers precise SQL control and simple migrations. Already proven in `feature-secondTry`.
- **Alternatives considered**:
  - Prisma → heavy generator, engine, longer cold starts, unfriendly to the free tier.
  - Knex/Kysely → less type safety or additional setup effort without benefit.

## D4. Auth: JWT in HttpOnly cookies

- **Decision**: JWT (signed with `JWT_SECRET` via `jose`) in HttpOnly + SameSite=Strict cookies; separate cookies for staff (`pos_staff`) and guest (`pos_guest`).
- **Rationale**: Stateless, serverless-compatible, no external IdP needed, no session table. Satisfies FR-010, FR-050, FR-051. CSRF is covered via double-submit cookie + `X-CSRF-TOKEN` header.
- **Alternatives considered**:
  - DB sessions → additional round trip per request, bad for cold starts.
  - NextAuth/Auth.js Nuxt port (`@sidebase/nuxt-auth`) → more abstraction than necessary; we only need login + cookie.
  - OAuth via the club's Google → contradicts the user requirement "no external IdP".

## D5. Realtime via polling

- **Decision**: Client polling with a `usePolling` composable; intervals 4 s (staff/production), 5 s (admin), 8 s (guest).
- **Rationale**: Vercel functions are short-lived; SSE/WebSockets on Vercel Hobby are unreliable and limited by function duration. Polling stays simple, debuggable and free-tier-friendly. Satisfies SC-005.
- **Alternatives considered**:
  - SSE via long-running functions → 10 s duration limit on Hobby; connection churn.
  - External Pusher/Ably service → cost plus an additional provider, contradicts the brief.
  - SignalR/custom WS service → explicitly phase 2.

## D6. UI based on `feature-secondTry`

- **Decision**: `@nuxt/ui` 4 + Tailwind 4 + `@nuxtjs/i18n` + `@pinia/nuxt` + `@vite-pwa/nuxt`; look & feel and route structure follow the pages (`apps/web/app/pages`) of the second variant `feature-secondTry`.
- **Rationale**: Saves UI design work; the second variant already has an evaluated UX model. Adoption is **selective** (no mandatory adoption of the monorepo structure or the Hono backend).
- **Alternatives considered**:
  - Own UI library → effort without benefit.
  - Shadcn-Vue → would also work, but `@nuxt/ui` 4 is already validated in `feature-secondTry`.

## D7. Validation via Zod, inline per endpoint

- **Decision**: Zod schemas are defined directly in the respective `server/api/...` endpoint, plus central re-exports under `server/lib/schemas/` **only if** a schema definition is actually reused multiple times.
- **Rationale**: Avoids an unnecessary `packages/contracts` package (user constraint). If a second consumer appears later, the package can be extracted (see phase 2).
- **Alternatives considered**:
  - Shared contracts package → unnecessary with a single consumer.
  - OpenAPI-first code generation → more tooling, little benefit in the MVP.

## D8. Testing: Vitest + Playwright

- **Decision**: Vitest for unit + contract + integration (server routes against ephemeral Neon branches or pgmem); Playwright for 1–2 critical E2E smoke flows (guest order, admin setup → service cash-in).
- **Rationale**: Satisfies Constitution I (test-first) without over-engineering. No k6 soak, no Lighthouse CI in the MVP (constraint).
- **Alternatives considered**:
  - Cypress → larger footprint, redundant with Playwright.
  - Jest → slower and unusual in the Vue stack.

## D9. Money handling in cents

- **Decision**: All monetary amounts as `integer cents` in the DB and server logic; displayed as `EUR` with `Intl.NumberFormat`. Helpers in `server/lib/money.ts` and `app/composables/useMoney.ts`.
- **Rationale**: Avoids float errors for splits/voids; trivially simple to implement.
- **Alternatives considered**:
  - `decimal.js` or Postgres `numeric` → needlessly complex for small amounts.

## D10. QR code PDF

- **Decision**: The PDF is generated server-side with `pdf-lib` + `qrcode`. Output as `application/pdf` directly from `/api/admin/qr-codes`.
- **Rationale**: Both libraries are pure JS packages and work in the Nitro/Node runtime without native bindings (cold-start-friendly).
- **Alternatives considered**:
  - Client-side PDF generation → no central source, larger bundle size.
  - Puppeteer/Chromium → too heavy for Vercel Hobby.

## D11. PWA scope

- **Decision**: PWA shell (installability, app icon, manifest, offline fallback page) via `@vite-pwa/nuxt`. **No** offline order queue in the MVP.
- **Rationale**: Spec requirement NFR-005. The idempotency key (FR-006) keeps the door open for a phase-2 offline queue.
- **Alternatives considered**:
  - Full offline mode → phase 2.

## D12. On-demand sweeps instead of cron

- **Decision**: Cleanup (payment locks > 60 s, guest sessions > 7 days) runs as a small function in `server/lib/sweep.ts`, triggered on the first request of a new hour (hash on `now`) and on an admin's login.
- **Rationale**: Vercel Hobby has no cron. The sweeper function is small (< 50 lines) and tolerant of concurrent invocation (single-statement UPDATE).
- **Alternatives considered**:
  - Vercel Cron → requires the Pro tier.
  - External worker → second deployment, forbidden.
