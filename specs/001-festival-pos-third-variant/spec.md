# Feature Specification: Festival POS — Serverless MVP (Third Variant)

**Feature Branch**: `feature/third-variant-serverless-mvp`
**Created**: 2026-05-28
**Status**: Implemented (MVP). What has been added or deviates since then is listed below under ["Added since the spec"](#added-since-the-spec).
**Input**: User description: "Third variant of the Festival POS system. Club/festival POS for self-ordering via QR code, service operation, kitchen/bar production, payment at the table, admin management. The first real test phase must be hostable for free (Vercel Hobby + Neon/Supabase Free). Serverless first: Nuxt 3/4 + Nitro server routes, JWT in HttpOnly cookies, polling instead of WebSockets, no separate layer abstractions."

## Context & Scope

**Purpose**: A deliberately small, **serverless-first** variant of the existing Festival POS system. It adopts the **domain logic** of the earlier .NET variant (archived, no longer in this repository) and the **UX conventions** of the second variant (`feature-secondTry`, no longer in the repository), but radically reduces architecture and operations so that the **first real test phase runs for free**.

**Operating Environment**:
- Festival conditions: unstable mobile connectivity possible, primarily smartphones (guests, service) and tablets (kitchen, bar).
- Event duration typically 6–12 hours, with peak times featuring many parallel orders.
- Hosting **exclusively free**: frontend + API on **Vercel Hobby**, database on **Neon Free** or **Supabase Free** (one must be chosen, no second provider).

**In-Scope (MVP)**:
- Guest self-ordering via table QR with a guest session cookie.
- Service: tickets per table, walk-in orders, full/partial payment in cash.
- Kitchen/bar: production queue per station with status changes.
- Admin: event lifecycle, MenuItems, table QR generation for a number range, simple report dashboard.
- Live availability of items (manual toggle).
- Splits & voids with a reason.
- DE primary, EN as fallback.

**Explicitly Out of Scope (MUST stay documented as such)**:
- **No** separate backend deployment. The API runs as Nuxt/Nitro server routes in the same Vercel project.
- **No** WebSocket/SignalR/SSE in the MVP. Realtime updates in service, kitchen, bar and admin views are done **by polling (3–5 seconds)**. A later extraction into a Hono/WS service is explicitly foreseen as a future option, but must not change the functional flows.
- **No** dedicated worker processes. Cleanup/sweeper logic (e.g. expired payment locks, expired guest sessions) runs **on demand** on API traffic and additionally via **one daily Vercel Cron** (allowed since October 2026, see FR-042).
- **No** external identity provider. Auth via **JWT in HttpOnly cookies** for staff and guest session.
- **No** separate layer abstractions (no Domain/Application/Infrastructure/Api split), **no** repository pattern, **no** factories, **no** MediatR/CQRS-style structures.
- **No** mega entry file: no single module or route aggregate larger than ~300 lines.
- **No** OpenTelemetry pipeline, **no** custom rate-limiting framework — Vercel's defaults suffice.
- **No** Docker Compose, **no** Aspire, **no** Turborepo requirement. pnpm workspaces only if `packages/contracts` is actually shared.
- **No** card payment, **no** fiscal requirements (TSE), **no** accounting exports beyond CSV, **no** invoice/receipt-number workflows.
- **No** PWA offline order queue, **unless** it can be realized without significant complexity; otherwise Phase 2. The PWA shell (installability, app icon, splash screen) remains in scope.

**Data Retention**: Personal data without a billing relation (guest sessions without orders, login attempts, payment locks) is deleted after 7 days at the latest. Orders, payments, refunds and the audit log are retained for accounting (see Constitution, Principle IV). Cleanup: on demand on API traffic (at most hourly) plus a daily Vercel Cron.

## Clarifications

### Session 2026-05-28

- Q: Which free database is used? → A: **Neon Free** (Postgres) as the default. Rationale: seamless Vercel integration, connection pooler for serverless. Supabase Free is an acceptable alternative if auth/storage are needed later, but not in parallel.
- Q: How is the branch and worktree workflow chosen? → A: The specification was originally maintained in its own worktree on branch `feature/third-variant-serverless-mvp`; today it lives in this repository. The canonical .NET variant and the `feature-secondTry` worktree serve only as sources and are not modified.
- Q: Which polling intervals apply? → A: Default **4 seconds** for kitchen/bar production and service tickets, **5 seconds** for the admin dashboard, **8 seconds** for the guest status view. The values are fixed in the code, see FR-041.

## User Scenarios & Testing *(mandatory)*

<!--
  Stories are ordered by priority and independently testable.
  P1 (US1+US2) forms the leanest conceivable MVP that can carry a real club evening.
-->

### User Story 1 — Guest scans table QR, orders, receives confirmation (Priority: P1)

A guest scans the QR code at their table with a smartphone. The web app opens in the browser and, without any app installation, shows the menu catalog for the active event. The guest selects items with quantities, confirms, and sees an order confirmation with a unique ticket reference and the current table balance. Re-opening the QR code later shows the status of their previous orders.

**Why this priority**: This is the only flow without which the system has no purpose. If only this story is implemented, a club can already offer self-service and process tickets manually.

**Independent Test**: Create a test event with 3 items and 5 tables, generate the QR for table 3, scan it with a second device, place an order, see the confirmation, close the app, scan the QR again, and find the order status again.

**Acceptance Scenarios**:

1. **Given** an active event with a maintained menu and a QR for table 5, **When** the guest scans the QR, **Then** the web app opens with the table context "Table 5" and the current menu in DE; a visible language switch allows changing to EN.
2. **Given** the guest has no account or login, **When** they open the app for the first time, **Then** a guest session cookie (HttpOnly, SameSite=Strict) containing table and session ID is set automatically.
3. **Given** the guest has items in the cart, **When** they confirm "Order", **Then** the order is added to the table ticket, and the server responds with order ID, items, unit prices and the interim table balance in < 500 ms p95.
4. **Given** an item was marked "unavailable" in the admin, **When** the guest refreshes the menu view (polling or reload), **Then** the item is greyed out and not orderable within at most 10 seconds.
5. **Given** the QR is damaged or the lighting is poor, **When** the guest opens the landing page directly, **Then** they can enter the table number manually and arrive in the same flow.
6. **Given** several guests sit at the same table, **When** guest A calls `GET /orders/session`, **Then** they see **only** their own items, but the table balance and ticket status (open/paid) of the table.

---

### User Story 2 — Service collects payment at the table (full or partial) (Priority: P1)

Service staff log in on their own device with username + personal PIN (or password), see a list of open tickets per table, open a ticket, select the items to be collected (or "everything open") and complete the payment in cash. Paid items are marked "paid"; the ticket stays open as long as unpaid items exist.

**Why this priority**: Without collecting payment, the order is worthless. Together with US1 this yields the minimal, really usable flow.

**Independent Test**: A table has three orders of 2 items each. Service first collects 2 items of one guest, later the rest. Both payments appear with staff ID, timestamp and amount in the audit log; table balance correctly reduced after the first payment; after the second payment ticket status "paid".

**Acceptance Scenarios**:

1. **Given** a service user with role `waiter`, **When** they log in with username + PIN/password, **Then** they receive a staff JWT as an HttpOnly cookie and see the table ticket overview.
2. **Given** a table has an open ticket with 5 items, **When** service selects 2 items for a partial payment, **Then** the system creates a payment entry for the sum of these 2 items, marks them as paid and reduces the table balance accordingly.
3. **Given** a service device has a ticket open and a second device tries to collect payment for the same ticket, **When** the second device clicks "Collect", **Then** it is shown that another payment is in progress; after the lock timeout (default 60 s, automatic release with a notice to the next staff member) access is possible again.
4. **Given** service manually adds a walk-in order, **When** they select items and confirm, **Then** **a new, standalone ticket** (no collective ticket at table 0) is created and immediately sent to production.
5. **Given** an OrderItem was entered incorrectly, **When** service or admin chooses "Void" and enters a reason, **Then** the item is invalidated for payment and production, documented in the audit log with staff ID, timestamp and reason.

---

### User Story 3 — Kitchen/bar work through their production queue (Priority: P2)

Kitchen and bar each have a tablet that shows only the items of their station as a production queue, sorted by arrival time. Staff tap an item to mark it "in progress", and tap again to mark it "done". The queue refreshes by polling every 4 seconds.

**Why this priority**: Without a sorted production workflow, peak times go awry. The function is testable independently of US1/US2 and delivers direct value.

**Independent Test**: Place three orders with items from kitchen and bar. Only kitchen items appear on the kitchen tablet, only bar items on the bar tablet. The statuses "in progress" and "done" are persisted correctly in both directions and are visible on the service device within 5 s.

**Acceptance Scenarios**:

1. **Given** station "Kitchen" is logged in, **When** a new order with kitchen items arrives, **Then** the items appear in the kitchen queue within ≤ 5 s, sorted by order time (oldest first), with table and item display.
2. **Given** an item is in the queue, **When** kitchen staff tap it, **Then** the status changes from `pending` to `in_progress`; **When** the same item is tapped a second time, **Then** the status changes from `in_progress` to `done` and the item disappears from the default queue (filterable as "done"). Each tap advances **exactly one** step of the status sequence `pending → in_progress → done`; backward transitions are not possible in the UI.
3. **Given** an item has already been voided, **When** the queue refreshes, **Then** the item is either no longer visible or clearly marked as "voided".
4. **Given** kitchen/bar have no rights for payments or voids, **When** they try to call a payment or a void, **Then** the system returns 403 and shows no corresponding UI elements.

---

### User Story 4 — Admin maintains event, menu and table QRs (Priority: P2)

The admin creates an event, activates it (only one active event can exist), maintains MenuItems with DE/EN names, price, category and target station, and generates a printable PDF with table QR codes for a number range (e.g. 1–25). The live availability of an item can be toggled with one click.

**Why this priority**: Without admin maintenance there is no data. But once US1–US3 are in place, the initial setup can in an emergency be done directly via DB seed — hence P2.

**Independent Test**: Within 5 minutes create an event + 10 items + 20 tables, generate and download the QR PDF, toggle one item to "unavailable" and observe the effect in the guest flow within ≤ 10 s.

**Acceptance Scenarios**:

1. **Given** the admin is logged in with the admin role, **When** they create an event with name and PIN and choose "activate", **Then** exactly this event becomes active; any other previously active event is deactivated (single-active-event rule).
2. **Given** the admin maintains MenuItems, **When** they enter name DE, name EN, price (€), category and target station (`kitchen` | `bar`), **Then** the item is immediately visible in the guest menu after saving.
3. **Given** the admin enters a table number range "1–20", **When** they choose "Generate QR codes", **Then** the system delivers a printable PDF with 20 QR codes, each including a readable table number and event identification.
4. **Given** the free-tier hosting has limited function invocations, **When** the admin refreshes the dashboard more often than once per 2 s, **Then** the client itself throttles to the polling interval fixed in the Clarifications (5 s).

---

### User Story 5 — Admin sees simple reporting (Priority: P3)

The admin opens a dashboard for the active event showing: total gross revenue, revenue per station, top items by quantity, voids with reasons, payments per staff member. CSV export per table.

**Why this priority**: Valuable, but not a showstopper for a club evening. A manual Excel reconciliation from the DB is possible in an emergency.

**Independent Test**: After a test session with ~20 orders, 5 payments and 1 void, the dashboard shows the correct totals; the CSV export matches the database values.

**Acceptance Scenarios**:

1. **Given** the active event has orders and payments, **When** the admin opens the dashboard, **Then** they see total gross revenue, revenue per station, top 10 items, void list with reasons, payments per staff member.
2. **Given** the admin clicks "Export CSV", **When** the download starts, **Then** the CSV file contains the same aggregations as the on-screen view in UTF-8 with BOM and semicolon separator (German Excel).

---

### Edge Cases

- Guest scans the QR of a table that belongs to a deactivated event → clear message "Event ended", no ordering possible.
- Guest loses connectivity during the ordering process → the last order click yields an unambiguous response after reconnect (idempotent submit via `Idempotency-Key` header or client-generated order ref).
- Two service devices try to collect payment simultaneously → payment lock with default timeout 60 s; auto-release with a warning to the next staff member.
- Vercel cold start delays the first request after inactivity → critical read endpoints (menu, table status) are briefly (≤ 5 s) cacheable server-side so that the display stays smooth.
- The free tier's database connection limit is briefly reached → the endpoint responds with 503 + retry hint, the client shows a non-blocking notice and retries on the next poll.
- An overloaded Wi-Fi or mobile network drops or delays a request to place an order or book a payment → the client retries automatically with backoff (1, 2, 4, 8 s, at most 20 s, 10 s timeout per attempt) using the same `Idempotency-Key`. Business errors (4xx) are not retried. After cancelling or giving up, the key is kept, so tapping again finds the order or payment that may already be booked.
- Free-tier function invocations run low → the polling intervals are fixed (FR-041); a setting to stretch them is only added if a rehearsal shows the quota is not enough.

## Requirements *(mandatory)*

### Functional Requirements

**Guest flow (US1)**

- **FR-001**: The system MUST create a guest session with a unique session ID for each guest on first app access and store it as an HttpOnly+SameSite=Strict cookie.
- **FR-002**: The system MUST read the current table number from the QR path and reference it in the guest session.
- **FR-003**: The system MUST offer manual table number entry on the landing page.
- **FR-004**: The system MUST offer DE as the default language and EN as fallback; a language switch MUST be visible.
- **FR-005**: The system MUST require at least 1 item per order and return an order ID + table balance.
- **FR-006**: The system MUST make `POST /orders` idempotent with respect to identical `Idempotency-Key` headers from a guest. Idempotency records MUST be stored for at least 10 minutes from creation; after expiry, a repeated submit with the same key is treated as a new order. The TTL MUST be enforced server-side (column timestamp + expiry check), not merely through uniqueness.
- **FR-007**: `GET /orders/session` MUST return only the OrderItems of the calling guest session, plus table number and ticket status (open/paid).

**Service flow (US2)**

- **FR-010**: The system MUST authenticate staff by username + password OR by username + personal numeric PIN (*since PR #18: admins by password only*) and set a staff JWT as an HttpOnly+SameSite=Strict cookie.
- **FR-011**: Every staff account MUST be assigned a role: `admin`, `lead` (shift lead), `waiter`, `kitchen`, `bar`.
- **FR-012**: Voids may be performed exclusively by `admin`, `lead` and `waiter`. Items that kitchen or bar have already finished can only be voided by `admin`.
- **FR-013**: Walk-in orders each create a new, standalone ticket; there is no collective ticket at table 0.
- **FR-014**: Partial payments MUST be made at item level; the ticket stays open until all non-voided items are paid.
- **FR-015**: Only one payment process may be open per ticket at any time (payment lock); lock timeout 60 s, auto-release with warning. The lock also applies to the same waiter (a second tab or device); it lasts only as long as the booking itself, plus the 60 s expiry after a crash.
- **FR-016**: Every payment and every void MUST be persisted in the audit log with staff ID, UTC timestamp and (for voids) a reason.

**Production flow (US3)**

- **FR-020**: Each station (`kitchen`, `bar`) MUST see only the items assigned to it in its queue.
- **FR-021**: Items have the status `pending` → `in_progress` → `done`, with transitions allowed only in this order plus `cancelled` (via void).
- **FR-022**: Voided items MUST be recognizable as such and MUST NOT count toward the "done" statistics.

**Admin flow (US4 + US5)**

- **FR-030**: At most **one** event MUST be active at any time. Activating an event requires that no other event is live; an event is ended through its own endpoint (`POST /api/admin/events/{id}/end`, preceded by `GET …/end-check`), and an ended event can be deleted permanently after exporting its reports (`DELETE /api/admin/events/{id}`).
- **FR-031**: The system MUST generate QR codes for an admin-defined table number range and deliver them as a printable PDF (A4 portrait, 4×6 grid = 24 codes per page, QR error correction level **Q**, per cell the table number as a readable label + event identification).
- **FR-032**: MenuItems MUST carry name DE, name EN, price (€, 2 decimal places), category and target station.
- **FR-033**: Items MUST be markable live as "unavailable" and back; the effect MUST show on the next guest poll (≤ 10 s).
- **FR-034**: The admin dashboard MUST provide at least the following for the active event: (1) total gross revenue + per category, (2) top items by quantity, (3) void list with reasons, (4) payments per staff member (count + sum), (5) orders per hour.
- **FR-035**: A CSV export (UTF-8 with BOM, semicolon separator) MUST be available for each table of the dashboard.

**Architecture & operating rules**

- **FR-040**: The API MUST run as **Nuxt/Nitro server routes** in the same project as the frontend; **no** separate backend deployment in the MVP.
- **FR-041**: Realtime updates MUST be done by polling every 4 s for service tickets and production queue, every 5 s for the admin dashboard, every 8 s for the guest status. The intervals are fixed values in the code: service and production 4 s, guest status 8 s, menu 20 s, admin reports 15 s while the event is live (60 s otherwise), all tables in one bundled request (`/reports/all`, one consistent snapshot). A configuration was deliberately not built (Constitution VIII); the trigger for re-evaluation is a function-invocation quota problem during a rehearsal.
- **FR-042**: In the MVP the system MUST NOT use WebSockets or SSE endpoints for live updates. Dedicated worker processes are not allowed. **Allowed** is exactly one daily Vercel Cron (`vercel.json`, Vercel Hobby) that calls the cleanup endpoint `/api/cron/sweep`; the endpoint MUST be protected with `CRON_SECRET`. *(Changed October 2026: previously any cron was forbidden.)*
- **FR-043**: Cleanup logic (expired payment locks, expired guest sessions without orders, old login attempts) MUST run **on demand** on API traffic (at most once per hour) and additionally via the daily cron from FR-042.
- **FR-044**: There MUST NOT be separate layer modules for Domain/Application/Infrastructure/Api; **no** repository pattern, **no** factories, **no** MediatR/CQRS.
- **FR-045**: No single module or route aggregate in the repository MAY permanently exceed **300 lines** of source code (hard limit for reviews); files exceeding it are to be split.
- **FR-046**: The system MUST be fully deployable on **Vercel Hobby**, with the database on **Neon Free** (default) or **Supabase Free**. **No** second hosting provider may be required for mandatory MVP functions.
- **FR-047**: The repository MUST be startable locally with **one** command (`pnpm dev`).

**Security & Compliance**

- **FR-050**: All connections MUST be HTTPS (satisfied by the Vercel default); the HSTS header MUST be set.
- **FR-051**: Mutating endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) MUST be protected by a **CSRF token** (double-submit cookie or origin check + token).
- **FR-052**: Every protected route MUST check the caller's role; unauthorized access MUST yield 401 (unauthenticated) or 403 (forbidden).
- **FR-053**: Guest session data without orders MUST be deleted automatically after 7 days (see FR-043). Orders and payments are not covered; they are retained for accounting.

### Non-Functional Requirements

- **NFR-001 (Latency)**: Endpoint latency p95 < 500 ms under MVP load (10 concurrent guests, 3 service devices, 1 kitchen/bar tablet each).
- **NFR-002 (Cold start)**: Cold starts on Vercel are acceptable, but MUST be noticeably cushioned by brief server-side caching (≤ 5 s) of critical reads (menu, active tables).
- **NFR-003 (A11y)**: Guest ordering flow and staff login MUST meet WCAG 2.1 AA (contrast, keyboard navigation, ARIA labels for buttons and status).
- **NFR-004 (i18n)**: Complete guest UI and admin UI in DE; complete EN fallback for all guest texts and admin main menus.
- **NFR-005 (PWA)**: The frontend MUST provide an installable PWA shell with app icon and offline fallback page ("No connection"). A true offline order queue is **not** an MVP goal, but Phase 2.
- **NFR-006 (Tests)**: Unit and contract tests with Vitest, E2E tests with Playwright. **No** k6 soak, **no** Lighthouse CI in the MVP.

### Key Entities

The following entities are adopted from the canonical .NET variant and simplified where the complexity does not pay off for the MVP. Implementation details (column types, indexes) belong in the plan, not here.

- **Event**: name, PIN, active flag, activation time; constraint: max. 1 active event. Tables are **not** a separate data object but an admin-maintained **number range** per event (integer value range). QR codes are generated from this range.
- **MenuItem**: name DE, name EN, price (€), category, target station (`kitchen` | `bar`), availability flag, event reference.
- **GuestSession**: session ID, table reference, creation time, expiry time (7 days).
- **Order**: order ID, table reference, guest session or staff user (for walk-in), creation time, idempotency key (optional).
- **OrderItem**: order reference, MenuItem reference, quantity, unit price snapshot, status (`pending` | `in_progress` | `done` | `cancelled`), void reason.
- **Ticket**: aggregate of all open OrderItems per table (or standalone for walk-in); status `open` | `paid`.
- **Payment**: ticket reference, list of paid OrderItems, sum, staff ID, timestamp.
- **Staff**: username, password hash or PIN hash, role (`admin` | `waiter` | `kitchen` | `bar`), active flag.
- **AuditLogEntry**: action (`payment` | `void`), actor staff ID, target entity, timestamp, reason (for void).
- **PaymentLock**: ticket reference, staff ID, lock start, auto-release after 60 s.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (Guest flow speed)**: A guest completes a full order (scan → menu → select 2 items → confirmation) in **at most 12 clicks/taps**. Measurement setup: Playwright emulation `Pixel 5` (mobile Chrome), network profile `Fast 3G`, no typed input outside the quantity steppers.
- **SC-002 (Admin setup speed)**: A new admin creates an event with 10 MenuItems and 20 tables in **under 5 minutes** and generates the printable QR PDF.
- **SC-003 (Free operation)**: The first real test phase runs **without any paid upgrades** — Vercel Hobby + the selected free-tier DB provider suffice for a club festival with up to 50 tables and 200 orders per hour.
- **SC-004 (One-command start)**: A new developer gets the entire system running locally with **a single** command (`pnpm dev`), without manually starting separate backend, database or worker processes.
- **SC-005 (Perceived freshness)**: Status changes in production (item "done") are visible on the service device within **≤ 5 seconds** — even without WebSockets — and item availability changes are visible to the guest within **≤ 10 seconds**.
- **SC-006 (Latency)**: 95 % of all functional endpoint calls respond in **under 500 ms** under MVP load (see NFR-001).
- **SC-007 (Service efficiency)**: A full or partial payment at the table is completed by service in **under 15 seconds** (login assumed).
- **SC-008 (Architecture hygiene)**: At the first external code review the repository contains **no** file > 300 lines and **no** layer directory structure (no `domain/`, `application/`, `infrastructure/`, no `repositories/`, no `factories/`).

## Assumptions

- **Hosting default**: Frontend + API on Vercel Hobby, database on Neon Free; the choice of Neon vs. Supabase is finalized in the plan, but **not both in parallel**.
- **Device landscape**: Guests use smartphones with current browsers (iOS Safari, Android Chrome, each of the last 2 major versions). Service on smartphone, kitchen/bar on a 9–10″ tablet.
- **Network**: The festival has sufficient Wi-Fi or LTE for polling intervals of 4–8 s; sporadic dropouts are tolerated by the client (retry on the next poll), but **no** full offline operation in the MVP.
- **Cash**: The MVP supports **cash payment only**. Card payment, TSE (fiscal device) and receipt numbers are explicitly out of scope. No further payment method is planned (decision of October 2026). The app runs as an ordering system; cash is settled through an open cash box, and the app's cash closing and reports are internal control.
- **Volume**: A club evening has ≤ 50 tables, ≤ 10 concurrent service devices, ≤ 4 production stations, ≤ 200 orders per hour — all free-tier limits are respected within this envelope.
- **Languages**: DE/EN. Further languages are not in the MVP.
- **Data cleanup**: 7-day retention for personal data without a billing relation via on-demand sweep plus daily cron; accounting data is retained.
- **Existing sources**: The canonical .NET variant and the `feature-secondTry` worktree remain untouched; only functional requirements and UX conventions are borrowed from them, **no** hosting or implementation requirements.

## Migration Path (Post-MVP, informative)

- **Phase 2 — Realtime**: If polling load strains the free tier or the UX should improve, a separate **Hono/WS service** can be extracted for the push channels of the kitchen/bar/service queue. The functional flows of this specification MUST remain unchanged; only the transport changes.
- **Background cleanup**: Implemented as a daily Vercel Cron (FR-042).
- **Phase 2 — Offline order queue**: True offline capability for guest orders with an IndexedDB queue and replay; introduce only if the complexity is clearly sustainable. Trigger for re-evaluation: more than two failed sends at one festival evening despite the automatic retry.
- **"Call a waiter" from the guest page**: deliberately not built; waiters who work with pen and paper could not be called. Re-evaluate after the first real festival.
- **Phase 2 — Card payment, TSE, receipt numbers**: Explicitly excluded in the MVP; a separate specification is required.

## Added since the spec

Implemented, but not described (or described differently) in the sections above. Details are in the code and in [`specs/002-kellner-bestellung-tischansicht/plan.md`](../002-kellner-bestellung-tischansicht/plan.md).

- **Order kinds (`orders.kind`)**: `guest` (QR), `staff_table` (waiter orders for a table and lands on the same table bill) and `walkin` (counter, own ticket, optionally "Send & paid in cash"). A CHECK ensures that guest orders carry a guest session and waiter orders carry a staff account.
- **Rehearsal mode (Probelauf, test mode)**: Switchable per event (`events.trial_mode`). Orders and payments are marked as test (`is_trial`), a banner appears everywhere, reports do not count them. Rehearsal orders do not change stock levels, and voids in rehearsal mode return nothing. "Delete test data" removes only test data. "End rehearsal" also resets table assignments and "asked at the table" marks.
- **Branding**: Logo (light/dark), flyer (image/PDF), colors and texts per event (`event_assets`, `/admin/events/:id/branding`). Guests see it on the start and order pages. Flyers are deleted 90 days after the event ends.
- **Refunds**: Admin can refund paid items (`refunds`, `POST /api/admin/order-items/:id/refund`), with an audit log; reports net them out.
- **Dark mode**: Light/dark/system, stored on the account for staff (`PUT /api/auth/theme`) and therefore identical on all devices.
- **Excel import of the menu**: Download a template or the current menu as `.xlsx`, upload as `.xlsx` or `.csv`, preview with "new"/"changed" before applying.
- **"Popular" tab**: Category tabs with search, plus a tab with the most-ordered items of the table or the event (`GET /api/menu/popular`).
- **Idempotency for payments**: Like FR-006 for orders, `POST /api/payments` takes an `Idempotency-Key` (unique per event and cashier). A repeat after a lost response returns the already booked payment instead of booking again. Waiter orders have their own idempotency index.
- **Guest limits**: At most 15 guest orders per table in 10 minutes and 40 items per order; waiters are not limited. The event PIN is no longer printed on the table cards.
- **Admin by password only**: Admins log in exclusively with a password (min. 12 characters); a PIN is rejected and removed when promoting someone to admin.
- **Login throttling**: 10 failed attempts per user and IP, 100 per user, each within 15 minutes.
- **Daily cron**: The sweep (FR-043) runs on demand at most once per hour for all instances combined (timestamp in `maintenance_runs`), in the background and not from the polling endpoints. In addition, Vercel Cron calls `/api/cron/sweep` once a day (protected with `CRON_SECRET`). FR-042 has explicitly allowed this since October 2026.
- **Retention**: Guest sessions that carry orders are not deleted after 7 days (otherwise the order's reference would be lost); they disappear with their event. Orders, payments, refunds, cash-ups (Kassenabschluss, drawer close) and the audit log are retained for accounting (Constitution, Principle IV).
- **Tips**: Recorded when collecting payment (change as tip, round up, free amount) and stored on the payment (`payments.tip_cents`). Not revenue; they stay in the drawer and count towards its expected amount. Report "Tips" per waiter and in total. Rehearsal payments and refunds do not change it.
- **End and delete an event**: "End event" shows open tables, open cash drawers and finished but unserved items, then ends the event (audit `event_end` with the checklist); open drawers stay open and can still be closed. An ended event can be deleted permanently after the CSV export (audit `event_delete`); the deletion runs in one transaction in foreign-key order, the audit log is kept.
- **Shift lead (`lead`)**: Hands out tables to waiters at the start of a shift ("Distribute tables") and sees the tables nobody looks after. Waiter screens stay limited to ordering, serving and cashing up (Constitution IX).
- **Own confirmation dialogs**: Closing the drawer (with expected, counted and difference), removing a passkey and renewing the join link use the app's own dialog instead of browser dialogs. PIN and password are changed inline in the staff list.
- **For the club festival** (#21–#28, details in the [README, "At the festival"](../../README.md#at-the-festival)): notes per item, cash-up per waiter (Bedienung), bottle deposit (Pfand), stock levels with a "sold out" switch for kitchen/bar, staff meals (Helferverpflegung), promotional prices, imprint and privacy policy per event, receipt printing, "My tables" with table takeover, and table grid.
