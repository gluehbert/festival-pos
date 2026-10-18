# Implementation Plan: Festival POS — Serverless MVP (Third Variant)

**Branch**: `feature/third-variant-serverless-mvp` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-festival-pos-third-variant/spec.md`

## Summary

A deliberately minimal, serverless-first variant of the Festival POS system. A single **Nuxt 4** project delivers both the Vue UI (guest, service, kitchen/bar, admin) and the HTTP API via **Nitro server routes**. Persistence on **Postgres/Neon Free** via **Drizzle ORM**. Auth via **JWT in HttpOnly cookies**. Realtime updates in all staff/admin views are done by polling (4–8 s). No separate backend, no workers, no layer abstractions, no file > 300 lines. Deployment on **Vercel Hobby**.

The plan strictly separates **Phase 1 (MVP, deployable on free tiers)** from **Phase 2 (later, optional)**. Phase 2 must not retroactively complicate Phase 1.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, Node.js 22 LTS
**Primary Dependencies**: Nuxt 4 (Vue 3.5 + Nitro), @nuxt/ui 4, @nuxtjs/i18n, @pinia/nuxt, @vite-pwa/nuxt, Drizzle ORM + drizzle-kit, @neondatabase/serverless, zod, jose, h3 (via Nitro), tailwindcss 4
**Storage**: Postgres on **Neon Free** (default). Supabase Free as an equivalent alternative — one choice, no parallel operation.
**Testing**: Vitest (unit + contract against an ephemeral Neon branch or pgmem), Playwright (1–2 critical E2E flows: guest order, admin setup → service cash-in)
**Target Platform**: Vercel Hobby (serverless functions, edge not used because the Drizzle/Neon driver expects the Node runtime). Clients: mobile Safari/Chrome (last 2 majors), tablet Chromium.
**Project Type**: Single Nuxt 4 project (no monorepo, no Turborepo). pnpm as package manager.
**Performance Goals**: p95 < 500 ms (see NFR-001 of the spec). Perceived freshness in staff views ≤ 5 s, in guest views ≤ 10 s.
**Constraints**: Respect Vercel Hobby limits (function invocations, function duration ≤ 10 s, build memory). Cold starts tolerated; cache critical reads (menu, active tables) server-side for ≤ 5 s. No in-memory singleton state, no local file system.
**Scale/Scope**: One club festival with ≤ 50 tables, ≤ 10 service devices, ≤ 4 production stations, ≤ 200 orders/hour. ~10 database tables, ~25 endpoints, ~12 pages.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution principle | Status | Note |
|---|---|---|
| I. Test-First | ✅ Pass | Vitest + Playwright; endpoints with Zod contract tests before implementation. |
| II. Accessibility & Inclusion (WCAG 2.1 AA) | ✅ Pass | @nuxt/ui components as the base, a11y audit as E2E smoke (axe-core). |
| III. Resilience (Offline-First where feasible) | ✅ Pass | Constitution v2.0.0 allows deferring the full offline order queue to Phase 2, provided it is documented. The spec marks the queue as Phase 2 (NFR-005); the MVP delivers PWA shell, offline fallback page, retry logic. Re-evaluation trigger in Complexity Tracking below. |
| IV. Security & Privacy | ✅ Pass | HTTPS via Vercel, HttpOnly+SameSite=Strict cookies, HSTS header, CSRF token, RBAC per route, 7-day sweep on demand, audit log. |
| V. Performance & Perceived Real-Time | ✅ Pass | The spec declares p95 < 500 ms (NFR-001/SC-006) — within the constitution baseline (≤500 ms). Polling visibility ≤5 s (staff/production) and ≤10 s (guest) per FR-041/SC-005 — within the constitution's upper bounds for polling transports. |
| VI. Traceability & Coverage | ✅ Pass | Every FR/NFR is mapped to concrete tasks in `tasks.md` (phase 2 of speckit). |
| VII. Terminology Consistency | ✅ Pass | Spec & plan use "production station", "production queue", "ticket", "guest session" consistently. |

**Verdict**: All gates pass under constitution v2.0.0. The earlier relaxations became obsolete through the constitution amendment of 2026-05-28; Complexity Tracking now only documents the re-evaluation trigger for Phase 2 offline.

## Project Structure

### Documentation (this feature)

```text
specs/001-festival-pos-third-variant/
├── spec.md
├── plan.md                  # this file
├── research.md              # Phase 0 — technology decisions
├── data-model.md            # Phase 1 — Drizzle schema sketch
├── quickstart.md            # Phase 1 — `pnpm i && pnpm dev`
├── contracts/               # Phase 1 — Zod/OpenAPI sketches
│   ├── README.md
│   ├── auth.md
│   ├── menu.md
│   ├── orders.md
│   ├── tickets-payments.md
│   ├── production.md
│   └── admin.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

Single Nuxt 4 project, kept flat. No `apps/`, no `packages/`, no Turborepo — until multiple apps or truly shared packages exist.

```text
festival-pos/                       # future repo root (Phase 1)
├── app/                            # Nuxt 4 app dir (frontend)
│   ├── pages/
│   │   ├── index.vue
│   │   ├── t/[table].vue
│   │   ├── staff/
│   │   │   ├── login.vue
│   │   │   ├── index.vue
│   │   │   └── [table]/
│   │   │       ├── index.vue
│   │   │       └── pay.vue
│   │   ├── production/
│   │   │   └── index.vue
│   │   └── admin/
│   │       ├── index.vue
│   │       ├── events.vue
│   │       ├── menu.vue
│   │       ├── qr-codes.vue
│   │       └── reports.vue
│   ├── components/                 # grouped by feature
│   ├── composables/                # useApi, useAuth, useGuestSession, usePolling, useCsrf
│   ├── stores/                     # Pinia: menu, tickets, production, admin
│   ├── layouts/
│   ├── assets/
│   └── i18n/
│       ├── de.json
│       └── en.json
├── server/
│   ├── api/
│   │   ├── healthz.get.ts
│   │   ├── csrf-token.get.ts
│   │   ├── session.post.ts                 # create guest session
│   │   ├── auth/login.post.ts
│   │   ├── auth/logout.post.ts
│   │   ├── menu/index.get.ts
│   │   ├── menu/[id]/availability.patch.ts
│   │   ├── orders/index.post.ts
│   │   ├── orders/session.get.ts
│   │   ├── tickets/index.get.ts
│   │   ├── tickets/[id].get.ts
│   │   ├── payments/index.post.ts
│   │   ├── payments/[id]/release.post.ts
│   │   ├── production/queue.get.ts
│   │   ├── production/items/[id].patch.ts
│   │   └── admin/
│   │       ├── events/index.get.ts
│   │       ├── events/index.post.ts
│   │       ├── events/[id]/activate.post.ts
│   │       ├── menu-items/index.get.ts
│   │       ├── menu-items/index.post.ts
│   │       ├── menu-items/[id].patch.ts
│   │       ├── menu-items/[id]/void.post.ts
│   │       ├── qr-codes.get.ts             # PDF stream
│   │       └── reports/index.get.ts
│   ├── db/
│   │   ├── schema.ts                       # one file for the MVP (~250 lines)
│   │   ├── client.ts
│   │   └── migrations/
│   ├── lib/
│   │   ├── auth.ts                         # JWT + cookie
│   │   ├── csrf.ts
│   │   ├── rbac.ts                         # role guards as functions
│   │   ├── errors.ts                       # AppError + sendError
│   │   ├── money.ts                        # cents helper
│   │   ├── sweep.ts                        # on-demand cleanup
│   │   ├── pdf.ts                          # QR PDF (pdf-lib)
│   │   └── idempotency.ts
│   └── middleware/
│       └── auth.global.ts                  # cookie → event.context.auth
├── tests/
│   ├── contract/                           # Vitest: Zod schema validation
│   ├── integration/                        # Vitest: server routes against an ephemeral DB
│   └── e2e/                                # Playwright
├── scripts/
│   ├── seed.ts                             # idempotent dev seed
│   └── migrate.ts                          # calls drizzle-kit migrate
├── drizzle.config.ts
├── nuxt.config.ts
├── tailwind.config.ts
├── eslint.config.mjs
├── package.json
├── pnpm-lock.yaml
├── .env.example
├── .vercelignore
├── README.md
└── specs/                                  # kept
```

**Structure Decision**: Single Nuxt 4 project. Nitro server routes fully take over the API role. The Drizzle schema lives in **one** file (`server/db/schema.ts`) as long as it stays ≤ 300 lines. If exceeded, split by aggregate (`menu.ts`, `orders.ts`, `staff.ts`).

## Phase 1 (MVP) — Detailed design

### Endpoint inventory

| Method  | Path                                       | Auth        | Zod schema (request → response)            | Spec FR    |
|---------|--------------------------------------------|-------------|--------------------------------------------|------------|
| GET     | `/api/healthz`                             | none        | — → `HealthSchema`                         | —          |
| GET     | `/api/csrf-token`                          | session-soft| — → `CsrfTokenSchema`                      | FR-051     |
| POST    | `/api/session`                             | none        | `CreateGuestSessionSchema` → `GuestSessionSchema` | FR-001, FR-002, FR-003 |
| POST    | `/api/auth/login`                          | none        | `StaffLoginSchema` → `StaffSessionSchema`  | FR-010     |
| POST    | `/api/auth/logout`                         | staff       | — → `OkSchema`                             | FR-010     |
| GET     | `/api/menu`                                | session-soft| — → `MenuSchema`                           | FR-004, FR-033 |
| PATCH   | `/api/menu/{id}/availability`              | admin       | `AvailabilityPatchSchema` → `MenuItemSchema` | FR-033   |
| POST    | `/api/orders`                              | guest       | `CreateOrderSchema` (+ Idempotency-Key)→ `OrderSchema` | FR-005, FR-006 |
| GET     | `/api/orders/session`                      | guest       | — → `SessionOrdersSchema`                  | FR-007     |
| GET     | `/api/tickets`                             | waiter\|admin | `TicketsQuerySchema` → `TicketsListSchema` | FR-014   |
| GET     | `/api/tickets/{id}`                        | waiter\|admin | — → `TicketDetailSchema`                 | FR-014     |
| POST    | `/api/payments`                            | waiter\|admin | `CreatePaymentSchema` → `PaymentSchema`  | FR-014, FR-015, FR-016 |
| POST    | `/api/payments/{lockId}/release`           | waiter\|admin | — → `OkSchema`                           | FR-015     |
| GET     | `/api/production/queue?station=`           | kitchen\|bar | — → `ProductionQueueSchema`               | FR-020     |
| PATCH   | `/api/production/items/{id}`               | kitchen\|bar | `ProductionStatusPatchSchema` → `OrderItemSchema` | FR-021 |
| POST    | `/api/admin/events`                        | admin       | `CreateEventSchema` → `EventSchema`        | FR-030     |
| GET     | `/api/admin/events`                        | admin       | — → `EventsListSchema`                     | FR-030     |
| POST    | `/api/admin/events/{id}/activate`          | admin       | — → `EventSchema`                          | FR-030     |
| GET     | `/api/admin/events/{id}/menu-items`        | admin       | — → `AdminMenuListSchema`                  | FR-032     |
| POST    | `/api/admin/events/{id}/menu-items`        | admin       | `CreateMenuItemSchema` → `MenuItemSchema`  | FR-032     |
| PATCH   | `/api/admin/menu-items/{id}`               | admin       | `UpdateMenuItemSchema` → `MenuItemSchema`  | FR-032     |
| POST    | `/api/order-items/{id}/void`               | admin\|waiter | `VoidItemSchema` → `OrderItemSchema`     | FR-012     |
| GET     | `/api/admin/events/{id}/qr-codes?from=&to=` | admin       | — → PDF stream                             | FR-031     |
| GET     | `/api/admin/events/{id}/reports`           | admin       | `ReportQuerySchema` → `ReportSchema` (CSV via `?format=csv`) | FR-034, FR-035 |

All mutating endpoints (`POST`, `PATCH`, `DELETE`) check the **X-CSRF-Token** header (double submit against the `csrf` cookie). All endpoints log in a structured way (Nuxt default logger).

### Page inventory

| Route                         | Primary Pinia store  | Primary endpoints                                | Spec user story |
|-------------------------------|----------------------|--------------------------------------------------|-----------------|
| `/`                           | —                    | `POST /api/session`                              | US1             |
| `/t/[table]`                  | `menu`, `cart`       | `GET /api/menu`, `POST /api/orders`, `GET /api/orders/session` | US1 |
| `/staff/login`                | `auth`               | `POST /api/auth/login`                           | US2             |
| `/staff/index`                | `tickets`            | `GET /api/tickets` (poll 4 s)                    | US2             |
| `/staff/[table]/index`        | `tickets`            | `GET /api/tickets/{id}`                          | US2             |
| `/staff/[table]/pay`          | `tickets`, `payments`| `POST /api/payments`, `POST .../release`         | US2             |
| `/production/index`           | `production`         | `GET /api/production/queue` (poll 4 s), `PATCH .../items/{id}` | US3 |
| `/admin/index`                | `auth`               | redirect                                         | US4/US5         |
| `/admin/events`               | `admin`              | `GET/POST /api/admin/events` (live event + list) | US4            |
| `/admin/events/[id]`          | `admin`              | Workspace of one event: status, `.../activate`, rehearsal mode (Probelauf) | US4 |
| `/admin/events/[id]/branding` | `admin`              | `GET/PATCH /api/admin/events/{id}/branding`      | US4             |
| `/admin/events/[id]/menu`     | `admin`              | `GET/POST /api/admin/events/{id}/menu-items`, `PATCH /api/admin/menu-items/{id}` | US4 |
| `/admin/events/[id]/qr-codes` | `admin`              | `GET /api/admin/events/{id}/qr-codes` (PDF)      | US4             |
| `/admin/events/[id]/reports`  | `admin`              | `GET /api/admin/events/{id}/reports` (poll 5 s, CSV export) | US5  |

### Simplifications compared to the .NET variant

| Area                   | .NET variant                                               | This variant (Phase 1)                              | Rationale |
|------------------------|------------------------------------------------------------|-----------------------------------------------------|------------|
| Layering               | Domain / Application / Infrastructure / Api split          | **No layers**; routes call Drizzle directly         | Reduces file/module count, avoids a mega Program.cs (user constraint). |
| Patterns               | Repository, factory, optional MediatR/CQRS                 | Plain functions in `server/lib/`                    | No second implementation per abstraction in sight → YAGNI. |
| Realtime               | SignalR hubs for production, staff, admin                  | **HTTP polling** (4/5/8 s configurable)             | Free-tier-friendly, no persistent-connection limit. |
| Background jobs        | Hosted services for sweeper, lock cleanup                  | **On-demand sweep** in nearby requests              | No workers on Vercel Hobby. |
| Auth                   | ASP.NET Identity + optional external IdP                   | **JWT** in HttpOnly cookie, own hash table          | No external service, less complexity. |
| Telemetry              | OpenTelemetry pipeline, Prometheus export                  | Nuxt/Nitro default logger, `console`                | Free-tier observability suffices via Vercel logs. |
| Rate limiting          | Custom middleware                                          | Vercel defaults                                     | No concrete problem to solve. |
| Tables                 | Dedicated `Table` entity                                   | **Number range** per event (no table row)           | Constant taken from the spec. |
| Receipt numbers / TSE (fiscal device) | Module planned                              | **Out of scope**                                    | Spec out of scope. |
| Local development      | Aspire stack, Docker Compose                               | **`pnpm dev`** + Neon branch URL                    | One-command start (SC-004). |

### What Phase 2 may be (informative, without binding Phase 1)

| Extension                 | Trigger                                          | Migration path                                                                 | Risk for Phase 1 |
|---------------------------|--------------------------------------------------|--------------------------------------------------------------------------------|---------------------|
| Realtime via WebSockets   | Polling load > 50 % of free-tier invocations     | Separate **Hono/ws** service (Fly.io/Render Free); frontend gets `useRealtime` next to `usePolling`. Endpoint contracts stay the same. | None — contracts unchanged. |
| Offline order queue       | Success measurement shows > 5 % submit errors    | Service-worker queue with `Idempotency-Key` replay (FR-006 is already prepared) | None — endpoint is idempotent. |
| Cron/sweeper worker       | On-demand sweep unreliable                       | Vercel Cron on the Pro tier or a small external worker calling `/api/admin/sweep` | None. |
| Deeper reporting          | Club demands dashboards/filters                  | New `admin/reports/[type].vue` + own endpoints; current reporting stays.       | None. |
| Card payment / TSE        | Club need                                        | Own spec; extend PaymentSchema, new table `payment_provider_txn`               | Spec extension required. |
| Multi-tenant              | Several clubs in parallel                        | Thread `organization_id` through; currently not planned.                       | Schema migration required. |
| Separate contracts package| Second API consumer (mobile, external BI)        | Extract `packages/contracts`, activate pnpm workspace                          | Reorganization. |

### Hosting & Deployment

- **Vercel project**: Git import of the repo. Build command `pnpm build`, output Nuxt default (`.output`), Nitro preset `vercel`.
- **ENV (Vercel)**: `DATABASE_URL` (Neon pooled URL), `JWT_SECRET`, `COOKIE_DOMAIN`, `NUXT_PUBLIC_APP_URL`.
- **Neon Free**: two branches — `main` (production) and `dev` (preview). Preview deployments use the `dev` branch.
- **Migrations**: `pnpm db:migrate` (= `drizzle-kit migrate`) as a build step (in `package.json` `"build": "drizzle-kit migrate && nuxt build"`). Idempotent.
- **Smoke tests**: Vercel preview deployments run Playwright smoke tests via a GitHub Action.
- **No edge runtime**: The Drizzle/Neon driver runs on the Node runtime. Edge is currently not required.

### Observability

- Logs: Nuxt default + `console.{info,warn,error}` with structured JSON fields (`requestId`, `userId`, `route`).
- Errors: centrally via `server/lib/errors.ts` (`AppError` → `createError` from h3). Stack traces only in dev.
- Health: `/api/healthz` checks a DB round trip with a 1 s timeout.

## Complexity Tracking

| Item                                                     | Why Documented                                                                                                | Re-Evaluation Trigger |
|----------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|------------------------|
| Phase-2 deferral of the full offline order queue (Constitution III allows it)        | The spec defers the real offline order queue to Phase 2; the MVP delivers PWA shell + offline fallback page + retry. A full offline mode doubles complexity (service-worker queue + conflict resolution) and has no clear benefit in the free-tier MVP. The idempotency key (FR-006) is the bridge for later activation. | Success measurement shows > 5 % submit errors **or** club feedback demands offline ordering. |
| Polling transport instead of WebSockets (Constitution V allows it for polling)                       | Vercel Hobby cold starts + Neon serverless connection make lower p95 unrealistic without paid tiers. Realtime via 4–8 s polling is an explicit user requirement and lies within the constitution's ≤5 s/≤10 s upper bounds. | Polling load > 50 % of free-tier invocations **or** perceived freshness breaks down at peak times. Migration: separate Hono/ws service (see Phase 2 table). |
