---
description: "Task list for Festival POS — Serverless MVP (Third Variant)"
---

# Tasks: Festival POS — Serverless MVP (Third Variant)

**Input**: Design documents from `/specs/001-festival-pos-third-variant/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md, contracts/

**Tests**: Tests are INCLUDED. Constitution I (Test-First) plus spec NFR-006 explicitly require Vitest (unit + contract + integration) and Playwright (E2E smoke). Write tests **before** the implementation they cover and ensure they fail first.

**Organization**: Tasks are grouped by user story (P1 → P3) per spec.md. Each user story phase is independently testable per the "Independent Test" criterion in the spec.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps to spec user story (US1–US5)
- All file paths are relative to repository root (`festival-pos/` project root after Phase 1 setup)

## Path Conventions

- Single Nuxt 4 project at repo root. Frontend in `app/`, server routes in `server/api/`, server libs in `server/lib/`, DB in `server/db/`, tests in `tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the single Nuxt 4 project, tooling, and free-tier-friendly configuration.

- [X] T001 Initialize Nuxt 4 project at repository root with `pnpm dlx nuxi@latest init .` (TypeScript strict, pnpm); commit baseline `nuxt.config.ts`, `app.vue`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`
- [X] T002 Add core runtime dependencies to `package.json`: `@nuxt/ui@^4`, `@nuxtjs/i18n`, `@pinia/nuxt`, `@vite-pwa/nuxt`, `drizzle-orm`, `@neondatabase/serverless`, `zod`, `jose`, `bcryptjs`, `pdf-lib`, `tailwindcss@^4`; dev deps: `drizzle-kit`, `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `eslint`, `@nuxt/eslint`, `typescript@~5.6`, `pg-mem`
- [X] T003 [P] Configure `nuxt.config.ts` with modules (`@nuxt/ui`, `@nuxtjs/i18n`, `@pinia/nuxt`, `@vite-pwa/nuxt`), Nitro preset `vercel`, runtimeConfig keys (`jwtSecret`, `cookieDomain`, `databaseUrl`, public `appUrl`, polling intervals)
- [X] T004 [P] Configure Tailwind 4 in `tailwind.config.ts` and `assets/css/main.css` per @nuxt/ui defaults
- [X] T005 [P] Configure ESLint in `eslint.config.mjs` (Nuxt + TS rules + custom rule blocking files > 300 lines via override comment; document FR-045 in README)
- [X] T006 [P] Configure i18n in `app/i18n/de.json` and `app/i18n/en.json` with empty namespaces (`guest`, `staff`, `admin`, `errors`) and register locale files in `nuxt.config.ts`
- [X] T007 [P] Configure PWA (`@vite-pwa/nuxt`) with app manifest (name, icons, theme color) and offline fallback route in `nuxt.config.ts`
- [X] T008 [P] Create `.env.example` with `DATABASE_URL`, `JWT_SECRET`, `COOKIE_DOMAIN`, `NUXT_PUBLIC_APP_URL` plus inline comments
- [X] T009 [P] Create `drizzle.config.ts` pointing to `server/db/schema.ts`, output `server/db/migrations/`, dialect `postgresql`, credentials from env
- [X] T010 [P] Add npm scripts to `package.json`: `dev`, `build` (= `drizzle-kit migrate && nuxt build`), `start`, `lint`, `typecheck` (= `nuxt typecheck`), `test`, `test:e2e`, `db:generate`, `db:migrate`, `db:seed`
- [X] T011 [P] Configure Vitest in `vitest.config.ts` with separate projects `contract`, `integration`, `unit` and Node environment; add globals for `@nuxt/test-utils`
- [X] T012 [P] Configure Playwright in `playwright.config.ts` with single Chromium project, base URL from env, smoke tag filter
- [X] T013 [P] Create `.vercelignore` excluding `tests/`, `specs/`, `playwright-report/`
- [X] T014 [P] Author `README.md` covering Phase-1 scope, one-command start (`pnpm dev`), env vars, deploy steps (mirrors `quickstart.md`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, auth/CSRF/RBAC primitives, error & money helpers, base middleware, and infrastructure routes that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Database & schema

- [X] T015 Implement Drizzle schema for all entities in `server/db/schema.ts` per `data-model.md` (events, menu_items, staff, guest_sessions, orders, order_items, payments, payment_items, payment_locks, audit_log) with constraints and indexes; keep file ≤ 300 lines
- [X] T016 Implement `server/db/client.ts` using `@neondatabase/serverless` + `drizzle-orm/neon-http`, reading `DATABASE_URL` from runtimeConfig (singleton-safe for serverless)
- [X] T017 Generate initial migration via `pnpm db:generate`; commit SQL files under `server/db/migrations/`
- [X] T018 [P] Implement `scripts/migrate.ts` wrapping `drizzle-kit migrate` for build step and CI
- [X] T019 [P] Implement idempotent `scripts/seed.ts` per `data-model.md` §Migration strategy (1 active demo event, 10 menu items, 20 tables, staff `admin/admin123`, `waiter1/1111`, `kitchen1/1111`, `bar1/1111`)
- [X] T020 [P] Contract test for schema integrity in `tests/contract/schema.test.ts`: only one active event constraint, walk-in check constraint, idempotency uniqueness

### Auth, CSRF, RBAC, errors

- [X] T021 [P] Implement `server/lib/errors.ts` exporting `AppError` and `sendAppError(event, err)` mapping to h3 `createError` with sanitized payload
- [X] T022 [P] Implement `server/lib/money.ts` with cents helpers (`fromCents`, `toCents`, sum, format DE/EN)
- [X] T023 [P] Implement `server/lib/auth.ts`: `signStaffJwt`, `verifyStaffJwt`, `setStaffCookie`, `clearStaffCookie`, `signGuestSession`, `verifyGuestSession`, `setGuestCookie` (jose, HttpOnly, SameSite=Strict, Secure in prod)
- [X] T024 [P] Implement `server/lib/csrf.ts`: `issueCsrfToken(event)`, `assertCsrf(event)` (double-submit cookie + `X-CSRF-Token` header)
- [X] T025 [P] Implement `server/lib/rbac.ts`: `requireRole(event, roles[])` returning typed staff context, throwing 401/403 via `AppError`
- [X] T026 [P] Implement `server/lib/idempotency.ts`: extract `Idempotency-Key` header, find-or-create order pattern keyed by `(event_id, guest_session_id, key)` (used by FR-006)
- [X] T027 [P] Implement `server/lib/sweep.ts`: on-demand cleanup of expired `payment_locks` and >7-day `guest_sessions` (FR-043, FR-053), idempotent, time-budgeted
- [X] T028 Implement `server/middleware/auth.global.ts`: parse staff JWT and guest session cookies, attach to `event.context.auth` and `event.context.guest`; never throw, only populate

### Foundational routes & shared composables

- [X] T029 [P] Contract test `tests/contract/healthz.test.ts` validating `HealthSchema` (status, db latency ms)
- [X] T030 Implement `server/api/healthz.get.ts` performing 1 s-timeout DB roundtrip and returning `HealthSchema`
- [X] T031 [P] Contract test `tests/contract/csrf-token.test.ts` validating `CsrfTokenSchema` and Set-Cookie header
- [X] T032 Implement `server/api/csrf-token.get.ts` issuing CSRF cookie + token (FR-051)
- [X] T033 [P] Implement shared composable `app/composables/useApi.ts` ($fetch wrapper that injects CSRF header on mutating verbs, handles 401/403/503 Retry-Hint)
- [X] T034 [P] Implement `app/composables/usePolling.ts` with configurable interval (from runtime config), pause-on-hidden, exponential backoff on error
- [X] T035 [P] Implement `app/composables/useAuth.ts` (staff login state, role helpers) and `app/composables/useGuestSession.ts` (table no, session id from cookie echo endpoint)
- [X] T036 [P] Implement base layout `app/layouts/default.vue` (HSTS via Nitro plugin; language switcher; offline banner from PWA event)
- [X] T037 [P] Nitro plugin `server/plugins/security-headers.ts` adding HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
- [X] T038 [P] Integration test `tests/integration/middleware-auth.test.ts`: unauth request to a guarded route → 401; valid staff cookie → context populated
- [X] T039 [P] Integration test `tests/integration/csrf.test.ts`: POST without token → 403; with double-submit token → passes
- [X] T040 [P] Integration test `tests/integration/sweep.test.ts`: expired lock + old guest session are removed by `sweep()` and only those

**Checkpoint**: Foundation ready — user-story phases (US1–US5) can now begin in parallel by different developers.

---

## Phase 3: User Story 1 — Guest scans table QR, orders, receives confirmation (Priority: P1) 🎯 MVP

**Goal**: Guest scans table QR, sees menu, places an order, receives confirmation + ticket reference + table balance; re-opening QR shows order status (own items only).

**Independent Test**: Create event + 3 items + 5 tables, generate QR for table 3 (manual entry suffices if QR endpoint not yet built), submit order from second device, see confirmation, close app, reopen QR, find prior order status.

### Tests for User Story 1 ⚠️ (write & ensure failing first)

- [X] T041 [P] [US1] Contract test `tests/contract/guest-session.test.ts` for `POST /api/session` validating `CreateGuestSessionSchema` → `GuestSessionSchema` (FR-001, FR-002, FR-003)
- [X] T042 [P] [US1] Contract test `tests/contract/menu.test.ts` for `GET /api/menu` validating `MenuSchema` (FR-004, FR-033 — unavailable filter)
- [X] T043 [P] [US1] Contract test `tests/contract/orders-create.test.ts` for `POST /api/orders` validating `CreateOrderSchema` → `OrderSchema` incl. idempotency-key behavior (FR-005, FR-006)
- [X] T044 [P] [US1] Contract test `tests/contract/orders-session.test.ts` for `GET /api/orders/session` validating `SessionOrdersSchema` returns **only caller's** items + table balance + ticket status (FR-007)
- [X] T045 [P] [US1] Integration test `tests/integration/us1-guest-order.test.ts` covering Acceptance Scenarios 1–6 against ephemeral pg-mem DB (cookie set, idempotent submit, unavailable item filter, manual table entry, same-table privacy)
- [X] T046 [P] [US1] E2E test `tests/e2e/us1-guest-order.spec.ts` (Playwright): land on `/t/3`, pick 2 items, place order, see confirmation, reload, see own order status

### Shared Zod contracts for US1

- [X] T047 [US1] Define shared Zod schemas in `server/lib/contracts/guest.ts` (`CreateGuestSessionSchema`, `GuestSessionSchema`, `MenuSchema`, `MenuItemSchema`, `CreateOrderSchema`, `OrderSchema`, `SessionOrdersSchema`) per `contracts/menu.md` and `contracts/orders.md`

### Server routes (US1)

- [X] T048 [US1] Implement `server/api/session.post.ts`: validate table number within active event range, create `guest_sessions` row, set `pos_guest` cookie via `server/lib/auth.ts` (FR-001, FR-002, FR-003)
- [X] T049 [US1] Implement `server/api/menu/index.get.ts`: return menu for active event with `is_available` honored, server-cache 5 s (NFR-002) via `setResponseHeader('Cache-Control','public, s-maxage=5')`
- [X] T050 [US1] Implement `server/api/orders/index.post.ts`: require guest session, validate `CreateOrderSchema`, run idempotency lookup, insert order + items, return `OrderSchema` with table balance; CSRF-guarded (FR-005, FR-006, FR-051)
- [X] T051 [US1] Implement `server/api/orders/session.get.ts`: return only OrderItems owned by caller's `guest_session_id` plus table-wide ticket status (FR-007)

### Frontend (US1)

- [X] T052 [P] [US1] Implement `app/stores/menu.ts` (Pinia): fetch menu via `useApi`, expose availability-aware list
- [X] T053 [P] [US1] Implement `app/stores/cart.ts` (Pinia): items, qty, total via `server/lib/money.ts` helpers
- [X] T054 [US1] Implement `app/pages/index.vue` landing page with manual table-no entry (FR-003) + language switcher
- [X] T055 [US1] Implement `app/pages/t/[table].vue` guest order page: ensures guest session, renders `menu`/`cart`, sends `Idempotency-Key` (UUID per submit attempt), shows confirmation with order ID + table balance; polling 8 s for order status (FR-041)
- [X] T056 [P] [US1] Implement guest components in `app/components/guest/` (`MenuList.vue`, `MenuItem.vue`, `CartSummary.vue`, `OrderConfirmation.vue`, `LanguageSwitcher.vue`) — each file < 300 lines
- [X] T057 [P] [US1] Populate i18n keys in `app/i18n/de.json` and `app/i18n/en.json` under `guest.*` for all visible strings
- [X] T058 [US1] Add A11y attributes (ARIA labels, roles, focus order) to guest components; ensure keyboard-only flow works (NFR-003)

**Checkpoint**: US1 fully functional and independently testable. MVP-thin slice deployable.

---

## Phase 4: User Story 2 — Service collects payment at the table (full or partial) (Priority: P1)

**Goal**: Staff logs in, lists open tickets per table, opens a ticket, selects items to cash (item-level partial), creates payments under a per-ticket lock, supports walk-in orders, supports voids with reason.

**Independent Test**: Place 3 orders × 2 items on a table; staff cashes 2 items first, then the rest; both payments visible in audit log with staff id, timestamps, amounts; ticket transitions to `paid` only after last unpaid item is paid.

### Tests for User Story 2 ⚠️

- [X] T059 [P] [US2] Contract test `tests/contract/auth-login.test.ts` for `POST /api/auth/login` and `POST /api/auth/logout` validating `StaffLoginSchema` → `StaffSessionSchema` (FR-010, FR-011)
- [X] T060 [P] [US2] Contract test `tests/contract/tickets.test.ts` for `GET /api/tickets` (list + filter) and `GET /api/tickets/{id}` validating `TicketsListSchema` / `TicketDetailSchema`
- [X] T061 [P] [US2] Contract test `tests/contract/payments.test.ts` for `POST /api/payments` (`CreatePaymentSchema` → `PaymentSchema`) and `POST /api/payments/{lockId}/release` (FR-014, FR-015, FR-016)
- [X] T062 [P] [US2] Contract test `tests/contract/voids.test.ts` for `POST /api/admin/menu-items/{id}/void` enforcing role + reason (FR-012)
- [X] T063 [P] [US2] Integration test `tests/integration/us2-payment-lock.test.ts`: concurrent cashier attempt is rejected; auto-release after 60 s simulated clock; warning surfaced
- [X] T064 [P] [US2] Integration test `tests/integration/us2-walk-in.test.ts`: walk-in creates its own ticket (no table-0 aggregation, FR-013)
- [X] T065 [P] [US2] Integration test `tests/integration/us2-partial-payment.test.ts`: partial then full payment transitions ticket to `paid`; audit log entries persisted (FR-014, FR-016)
- [X] T066 [P] [US2] E2E test `tests/e2e/us2-cash-at-table.spec.ts`: admin-setup → guest orders → waiter logs in, cashes partial, cashes rest, ticket closes. MUST additionally measure: from the first tap on "Collect" until the confirmation toast, ≤ 15 s elapse (SC-007, measurement setup Playwright `Pixel 5` + `Fast 3G`).

### Shared Zod contracts for US2

- [X] T067 [US2] Define schemas in `server/lib/contracts/staff.ts`: `StaffLoginSchema`, `StaffSessionSchema`, `TicketsQuerySchema`, `TicketsListSchema`, `TicketDetailSchema`, `CreatePaymentSchema`, `PaymentSchema`, `VoidItemSchema`, `OkSchema` per `contracts/auth.md`, `contracts/tickets-payments.md`

### Server routes (US2)

- [X] T068 [US2] Implement `server/api/auth/login.post.ts`: validate username + password OR PIN against `staff` (bcrypt), set staff JWT cookie (FR-010, FR-011)
- [X] T069 [US2] Implement `server/api/auth/logout.post.ts`: clear staff cookie; CSRF-guarded
- [X] T070 [US2] Implement `server/api/tickets/index.get.ts`: aggregate open `order_items` per `(event_id, table_no)`; role `waiter|admin` (FR-052)
- [X] T071 [US2] Implement `server/api/tickets/[id].get.ts`: detail view for one ticket (table or walk-in order)
- [X] T072 [US2] Implement `server/api/payments/index.post.ts`: acquire `payment_locks` row (partial unique index), validate items unpaid, transactionally create `payments` + `payment_items`, mark items `paid`, release lock; write `audit_log` row; sweep expired locks first; CSRF-guarded (FR-014, FR-015, FR-016, FR-043)
- [X] T073 [US2] Implement `server/api/payments/[id]/release.post.ts`: release a lock by id (only owning staff or after expiry); CSRF-guarded
- [X] T074 [US2] Extend `server/api/orders/index.post.ts` (from T050) to also accept staff-authored walk-in orders (no `guest_session_id`, sets `created_by_staff`), creating its own ticket aggregate (FR-013); update or split file if approaching 300-line limit
- [X] T075 [US2] Implement `server/api/admin/menu-items/[id]/void.post.ts`: role `admin|waiter`, require `void_reason`, set `production_status='cancelled'`, write `audit_log` (FR-012, FR-022)

### Frontend (US2)

- [X] T076 [P] [US2] Implement `app/stores/auth.ts` (login/logout/me) and `app/stores/tickets.ts` (list + selected ticket + lock state)
- [X] T077 [P] [US2] Implement `app/stores/payments.ts` (create payment, release lock, last-receipt)
- [X] T078 [US2] Implement `app/pages/staff/login.vue` (username + password/PIN, error states)
- [X] T079 [US2] Implement `app/pages/staff/index.vue` ticket overview, polling 4 s (FR-041)
- [X] T080 [US2] Implement `app/pages/staff/[table]/index.vue` ticket detail (items list, void button for waiter/admin)
- [X] T081 [US2] Implement `app/pages/staff/[table]/pay.vue` payment flow (item selection, partial total, lock UX, success, auto-release banner)
- [X] T082 [P] [US2] Implement staff components in `app/components/staff/` (`TicketCard.vue`, `ItemRow.vue`, `PaymentSummary.vue`, `VoidDialog.vue`) — keep each file < 300 lines
- [X] T083 [P] [US2] i18n keys under `staff.*` in DE/EN

**Checkpoint**: US1 + US2 form the deployable MVP for a real club event.

---

## Phase 5: User Story 3 — Kitchen/bar work through their production queue (Priority: P2)

**Goal**: Station tablets (kitchen / bar) see only their items in a queue, tap to advance state `pending → in_progress → done`; cancelled items excluded.

**Independent Test**: Submit 3 orders mixing kitchen + bar items; kitchen tablet only shows kitchen items, bar tablet only bar items; status updates appear on service device within ≤ 5 s.

### Tests for User Story 3 ⚠️

- [X] T084 [P] [US3] Contract test `tests/contract/production-queue.test.ts` for `GET /api/production/queue?station=` validating `ProductionQueueSchema` (FR-020)
- [X] T085 [P] [US3] Contract test `tests/contract/production-patch.test.ts` for `PATCH /api/production/items/{id}` validating allowed transitions (FR-021)
- [X] T086 [P] [US3] Integration test `tests/integration/us3-station-isolation.test.ts`: kitchen role sees only kitchen items, bar only bar (FR-020, FR-052)
- [X] T087 [P] [US3] Integration test `tests/integration/us3-transitions.test.ts`: pending→in_progress→done allowed; backward transitions rejected; cancelled hidden (FR-021, FR-022)
- [X] T088 [P] [US3] E2E test `tests/e2e/us3-production.spec.ts`: order placement → kitchen tablet advances item → service sees done within 5 s poll

### Server routes (US3)

- [X] T089 [US3] Define `ProductionQueueSchema`, `ProductionStatusPatchSchema`, `OrderItemSchema` in `server/lib/contracts/production.ts`
- [X] T090 [US3] Implement `server/api/production/queue.get.ts`: role `kitchen|bar` (or admin), filter by station from query AND from staff role, sort by `orders.created_at` ascending (FR-020)
- [X] T091 [US3] Implement `server/api/production/items/[id].patch.ts`: enforce state machine, write change, CSRF-guarded (FR-021, FR-022)

### Frontend (US3)

- [X] T092 [P] [US3] Implement `app/stores/production.ts` (queue list + optimistic transition)
- [X] T093 [US3] Implement `app/pages/production/index.vue` tablet-optimized queue view with 4 s polling, large tap targets, station auto-detected from staff role (FR-041)
- [X] T094 [P] [US3] Implement components in `app/components/production/` (`QueueItem.vue`, `StationFilter.vue`)

**Checkpoint**: Stations operate independently of payment UX.

---

## Phase 6: User Story 4 — Admin maintains event, menu and table QRs (Priority: P2)

**Goal**: Admin creates/activates a single active event, manages menu items (DE/EN, price, category, station), live-toggles availability, generates printable QR PDF for a table-number range.

**Independent Test**: In ≤ 5 minutes create event + 10 items + 20 tables, generate QR PDF, toggle one item unavailable and observe effect in guest view within ≤ 10 s.

### Tests for User Story 4 ⚠️

- [X] T095 [P] [US4] Contract test `tests/contract/admin-events.test.ts` for `GET/POST /api/admin/events` and `POST /api/admin/events/{id}/activate` validating `EventSchema`/`EventsListSchema`; single-active constraint (FR-030)
- [X] T096 [P] [US4] Contract test `tests/contract/admin-menu-items.test.ts` for `GET/POST/PATCH /api/admin/menu-items` and `PATCH /api/menu/{id}/availability` validating `AdminMenuListSchema`, `CreateMenuItemSchema`, `UpdateMenuItemSchema`, `AvailabilityPatchSchema` (FR-032, FR-033)
- [X] T097 [P] [US4] Contract test `tests/contract/admin-qr-codes.test.ts` for `GET /api/admin/qr-codes?from=&to=`: returns `application/pdf` with N pages for range (FR-031)
- [X] T098 [P] [US4] Integration test `tests/integration/us4-single-active-event.test.ts`: activating a new event deactivates the previously active one (FR-030)
- [X] T099 [P] [US4] Integration test `tests/integration/us4-availability-toggle.test.ts`: PATCH availability propagates to `GET /api/menu` within cache window (FR-033)
- [X] T100 [P] [US4] E2E test `tests/e2e/us4-admin-setup.spec.ts`: admin creates event + items + range, downloads PDF, toggles item, guest sees update

### Server routes (US4)

- [X] T101 [US4] Define schemas in `server/lib/contracts/admin.ts`: `CreateEventSchema`, `EventSchema`, `EventsListSchema`, `CreateMenuItemSchema`, `UpdateMenuItemSchema`, `AvailabilityPatchSchema`, `AdminMenuListSchema` per `contracts/admin.md` and `contracts/menu.md`
- [X] T102 [US4] Implement `server/api/admin/events/index.get.ts` and `server/api/admin/events/index.post.ts` (role `admin`) — list + create event
- [X] T103 [US4] Implement `server/api/admin/events/[id]/activate.post.ts`: transactional swap honoring `events_only_one_active` partial unique index; write `audit_log` (FR-030)
- [X] T104 [US4] Implement `server/api/admin/menu-items/index.get.ts`, `index.post.ts`, `[id].patch.ts` (role `admin`)
- [X] T105 [US4] Implement `server/api/menu/[id]/availability.patch.ts`: role `admin`, write `audit_log` (FR-033)
- [X] T106 [US4] Implement `server/lib/pdf.ts` building A4-portrait QR grid via `pdf-lib` + `qrcode` (4×6 = 24 codes per page, QR error-correction level **Q**, each cell shows table number as readable caption + event identifier) per updated FR-031 — file ≤ 300 lines
- [X] T107 [US4] Implement `server/api/admin/qr-codes.get.ts`: validate range within event range, stream `application/pdf` using `server/lib/pdf.ts` (FR-031)

### Frontend (US4)

- [X] T108 [P] [US4] Implement `app/stores/admin.ts` (events, menu items, optimistic toggles)
- [X] T109 [US4] Implement `app/pages/admin/index.vue` (redirect to first sub-page, admin guard)
- [X] T110 [US4] Implement `app/pages/admin/events.vue` (list + create + activate)
- [X] T111 [US4] Implement `app/pages/admin/menu.vue` (CRUD menu items, live availability toggle)
- [X] T112 [US4] Implement `app/pages/admin/qr-codes.vue` (range form, downloads PDF via blob fetch with CSRF token)
- [X] T113 [P] [US4] Implement components in `app/components/admin/` (`EventForm.vue`, `MenuItemForm.vue`, `MenuItemTable.vue`, `AvailabilityToggle.vue`, `QrRangeForm.vue`)
- [X] T114 [P] [US4] i18n keys under `admin.*` in DE/EN

**Checkpoint**: Admin can prepare and operate an event end-to-end.

---

## Phase 7: User Story 5 — Admin sees simple reporting (Priority: P3)

**Goal**: Dashboard with gross revenue, per-station revenue, top items, voids with reasons, payments per staff, orders/hour; CSV export per table.

**Independent Test**: After a test session with ~20 orders, 5 payments, 1 void, dashboard shows correct sums; CSV export matches DB.

### Tests for User Story 5 ⚠️

- [X] T115 [P] [US5] Contract test `tests/contract/admin-reports.test.ts` for `GET /api/admin/reports` validating `ReportQuerySchema` → `ReportSchema` and `?format=csv` returns `text/csv; charset=utf-8` with BOM + `;` separator (FR-034, FR-035)
- [X] T116 [P] [US5] Integration test `tests/integration/us5-aggregations.test.ts`: seeded dataset → expected totals, top items, voids, per-staff payments, orders/hour buckets (FR-034)
- [X] T117 [P] [US5] E2E test `tests/e2e/us5-reports.spec.ts`: admin opens reports, sees figures, downloads CSV

### Server routes (US5)

- [X] T118 [US5] Define `ReportQuerySchema`, `ReportSchema` in `server/lib/contracts/reports.ts`
- [X] T119 [US5] Implement `server/api/admin/reports/index.get.ts`: SQL aggregations (no materialized view, per data-model.md §Derived views), JSON by default, CSV via `?format=csv` with UTF-8 BOM + `;` separator (FR-034, FR-035)

### Frontend (US5)

- [X] T120 [US5] Implement `app/pages/admin/reports.vue`: tables for revenue, top items, voids, per-staff payments, orders/hour; 5 s polling (FR-041); per-table CSV export buttons
- [X] T121 [P] [US5] Implement components in `app/components/admin/reports/` (`RevenueTable.vue`, `TopItemsTable.vue`, `VoidsTable.vue`, `PerStaffTable.vue`, `OrdersPerHourTable.vue`, `CsvExportButton.vue`)
- [X] T122 [P] [US5] i18n keys under `admin.reports.*` in DE/EN

**Checkpoint**: All 5 user stories independently testable and shippable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Hardening, observability, accessibility, and deployment confidence.

- [X] T123 [P] Add axe-core a11y smoke checks in `tests/e2e/a11y.spec.ts` covering guest order and staff login (NFR-003)
- [X] T124 [P] Add structured JSON logging helper in `server/lib/log.ts` (`requestId`, `userId`, `route`) and use it in route handlers; wire into Nitro plugin
- [X] T125 [P] Add 503 + Retry-Hint handling on DB connection-limit errors in `server/lib/errors.ts` + client toast in `app/composables/useApi.ts` (Edge case from spec). Includes contract test `tests/contract/errors-retry.test.ts` asserting envelope shape and `Retry-After` header value.
- [X] T126 [P] Add inactivity-tolerant `Cache-Control: public, s-maxage=5` to `GET /api/menu` and ticket overview where safe (NFR-002)
- [X] T127 [P] Add Nitro plugin `server/plugins/sweep-trigger.ts` invoking `server/lib/sweep.ts` on first request of a new hour (FR-043, FR-053)
- [X] T128 [P] Add GitHub Action `.github/workflows/preview-smoke.yml` running `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and Playwright smoke against Vercel Preview URL
- [X] T129 [P] Run `quickstart.md` end-to-end locally and update it for any drift; verify `pnpm dev` one-command start (SC-004)
- [X] T130 [P] Add ESLint rule / CI check enforcing FR-045 (max 300 lines per source file under `app/`, `server/`); refactor any violators by splitting per aggregate as noted in plan.md. Additionally, fail CI if any directory under `app/` or `server/` is named `domain`, `application`, `infrastructure`, `repositories`, or `factories` (SC-008 — implement as a `pnpm lint:layers` script invoking `git ls-files | grep -E '/(domain|application|infrastructure|repositories|factories)/'` and asserting empty output, wired into the GH Action from T128).
- [X] T131 [P] Document Phase-2 migration notes in `README.md` ("How to add WebSockets / Cron / Offline queue later without breaking contracts") — informative only
- [X] T132 Final pass: run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` clean; verify Vercel preview deploy with seeded Neon dev branch (SC-003, SC-006). **Note (Phase 8):** `pnpm lint`, `npx tsc --noEmit -p tsconfig.json` and `pnpm test` (125 tests) are clean locally. `pnpm test:e2e` is intentionally skipped (all specs `test.skip(true, ...)` until a server harness exists). SC-003 (Vercel preview deploy) and SC-006 (preview perf gate) are deferred to actual CI/deploy runs — wired via `.github/workflows/preview-smoke.yml` and `pnpm perf:smoke`.
- [X] T133 [P] Add lightweight performance smoke `tests/perf/p95-smoke.ts` (autocannon or k6-script-equivalent invoked via Node, no SaaS) exercising `GET /api/menu`, `GET /api/tickets`, `GET /api/production/queue`, `POST /api/orders` against the seeded Vercel preview for 60 s at MVP-load concurrency (10 guests, 3 staff, 2 station clients); fail CI if observed p95 > 500 ms (SC-006, NFR-001). Invoked from the workflow in T128 as a non-blocking job that becomes blocking after first green run.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Foundational only.
- **US2 (Phase 4)**: Depends on Foundational; reuses `orders/index.post.ts` from US1 (T050) — coordinate around that file (T074 extends it). Otherwise independently testable.
- **US3 (Phase 5)**: Depends on Foundational only. Functionally independent of US1/US2 (uses seeded orders).
- **US4 (Phase 6)**: Depends on Foundational only. Provides production-grade replacement for the seed script.
- **US5 (Phase 7)**: Depends on Foundational only; aggregations work even on seeded data.
- **Polish (Phase 8)**: After the targeted user stories are complete.

### Within Each User Story

- Write failing tests before implementation (Constitution I).
- Define Zod schemas → server routes → frontend stores/pages → components/i18n.
- Each user story ends in a checkpoint where it is independently testable.

### Parallel Opportunities

- All `[P]` tasks within a phase can run concurrently.
- Once Phase 2 completes, US1, US3, US4, US5 can be staffed in parallel by different developers; US2 should land after or alongside US1 because T074 touches the file from T050.

---

## Parallel Execution Example — User Story 1

```bash
# Write all US1 tests in parallel first (they must fail):
Task: T041 contract test guest-session
Task: T042 contract test menu
Task: T043 contract test orders-create
Task: T044 contract test orders-session
Task: T045 integration test us1 guest-order
Task: T046 e2e test us1-guest-order

# Then implement contracts + routes (serial within shared files), and in parallel:
Task: T052 Pinia menu store
Task: T053 Pinia cart store
Task: T056 guest components
Task: T057 guest i18n keys
```

## Parallel Execution Example — Cross-Story (after Phase 2)

```bash
# Different developers on different stories in parallel:
Developer A: T041–T058   (US1)
Developer B: T084–T094   (US3)
Developer C: T095–T114   (US4)
Developer D: T115–T122   (US5)
# US2 (T059–T083) starts as soon as T050 lands, since T074 extends it.
```

---

## Implementation Strategy

### MVP First (P1 only = US1 + US2)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks everything).
3. Complete Phase 3: US1 — validate independently, deploy preview.
4. Complete Phase 4: US2 — validate the full club-evening flow.
5. **STOP & VALIDATE**: Deploy to Vercel preview against a Neon dev branch; run quickstart smoke; this is a deployable MVP.

### Incremental Delivery After MVP

6. Add US3 (production queue) — deploy.
7. Add US4 (admin management) — deploy; retire seed-script for prod use.
8. Add US5 (reports) — deploy.
9. Run Phase 8 polish; promote to production-equivalent Vercel project.

### Parallel Team Strategy

With ≥ 3 developers:

1. Team finishes Phase 1 + Phase 2 together.
2. Devs split: A on US1, B on US3, C on US4, D on US5; US2 picks up after US1's `orders` route lands.
3. Each story merges and ships behind feature visibility (route presence) independently.

---

## Notes

- `[P]` tasks = different files, no dependency on incomplete tasks.
- `[US#]` traces each task to a spec user story for FR/NFR coverage (Constitution VI).
- Every source file MUST stay ≤ 300 lines (FR-045); split per aggregate if approaching the limit.
- Mutating endpoints MUST go through `assertCsrf` (FR-051) and `requireRole` (FR-052).
- Money handled in cents (`server/lib/money.ts`); never floats.
- Commit after each task or logical group; preview-deploy after each completed user story phase.

---

## Coverage Summary

- **Total tasks**: 133
- **Phase 1 (Setup)**: 14 tasks
- **Phase 2 (Foundational)**: 26 tasks
- **Phase 3 (US1)**: 18 tasks
- **Phase 4 (US2)**: 25 tasks
- **Phase 5 (US3)**: 11 tasks
- **Phase 6 (US4)**: 20 tasks
- **Phase 7 (US5)**: 8 tasks
- **Phase 8 (Polish)**: 11 tasks
- **Parallelizable** (`[P]`): ≈ 71 tasks
- **MVP scope (recommended)**: Phases 1 + 2 + US1 + US2 → ≈ 83 tasks deliver a working club-evening system.

### Independent Test Criteria (per spec.md)

- **US1**: Event + 3 items + 5 tables → QR/manual entry on second device → order placed → confirmation → reopen → status visible.
- **US2**: Table with 3 orders × 2 items → waiter cashes 2 items partial → then rest → audit log + ticket `paid` transition.
- **US3**: Mixed kitchen/bar orders → station tablets show only their items → status changes visible on staff device within 5 s.
- **US4**: ≤ 5 min create event + 10 items + 20 tables → download QR PDF → availability toggle visible in guest within ≤ 10 s.
- **US5**: Seeded session → dashboard sums correct → CSV matches DB.
