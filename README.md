# Festival POS

Ordering and point-of-sale system for club and community festivals: guests order from their table via QR code, waiters collect cash at the table, kitchen and bar see their queues, and the admin manages the event, menu, QR codes and reports.

**Stack:** Nuxt 4 (Vue 3, Nitro) · Tailwind 4 / Nuxt UI · Pinia · nuxt-i18n (EN/DE) · PWA · Drizzle ORM · Postgres (Neon) · Vercel

The UI defaults to English. German stays selectable and is selected automatically for browsers that prefer German.

| Guest menu | Service: tables | Kitchen |
| --- | --- | --- |
| ![Guest menu](docs/screenshots/overview/guest-menu.png) | ![Table overview](docs/screenshots/overview/staff-grid.png) | ![Kitchen queue](docs/screenshots/overview/production-orders.png) |

Every screen also has a dark theme; more screenshots are in `docs/screenshots/overview/`.

## Running locally

Requirements: Node.js 22, pnpm 10 (`corepack enable`), a Postgres database (local, Docker or Neon).

```bash
pnpm install
cp .env.example .env          # fill in DATABASE_URL + JWT_SECRET
# With a local Postgres, also set: DB_DRIVER=pg
pnpm db:migrate               # create the schema
pnpm db:seed                  # demo event, menu, demo accounts (local only!)
pnpm dev                      # http://localhost:3000
```

Demo logins from `db:seed`: `admin` / `admin123` (password), `lead1` (shift lead), `waiter1`, `kitchen1`, `bar1`, `cafe1` with PIN `1111`. Guest view: `http://localhost:3000/t/3`.

**Passkeys:** After a login with PIN or password, the app offers once per device to set up a passkey (not on the shared kitchen and bar tablets). Afterwards people sign in with fingerprint, face, device PIN or a password manager, without typing a username. Passkeys are managed under "Passkeys" (`/staff/passkeys`); admins can see and delete them in staff management. If an admin deletes a passkey (for example because a phone was lost), that person is signed out on all devices. Passkeys require HTTPS or `localhost`; an IP address such as `127.0.0.1` does not work.

## At the festival

- **Rehearsal**: [one-page checklist](docs/rehearsal-checklist.md) for a dress rehearsal with real phones at the venue; `pnpm perf:flow` drives the whole flow (guests, waiters, kitchen, bar, cafe, admin) as a load test.
- **Cake and coffee counter** as a third station next to kitchen and bar: each menu item picks its station (Kitchen, Bar or Cafe; Excel import accepts "Cafe"). Cake made in the kitchen stays on "Kitchen", a separate counter uses "Cafe" and a staff role of the same name with its own screen. Like the bar it skips "Start"; its open amount counts toward the guests' drinks limit. Waiters get a "Cake & coffee ready" hint and a serve button of its own. After the coffee hour the counter closes itself ("Close cake counter" in its app bar, or Event → Features): new orders of coffee and cake then go to the kitchen, which can also mark them sold out; what is already at the counter is finished there. Guests see those items under food, and with food prepay on they wait for payment like other food. "Open cake counter" reverses it.
- **Notes per item** ("no onions", max. 80 characters) from guests and waiters; kitchen and bar see them highlighted, and items with different notes are never merged.
- **Cash register and closing** per waiter (`/staff/cash`): opening float, expected = opening + collected − refunds paid out from this drawer − deposit returns (excluding rehearsal mode), counted amount and difference; all closings appear in the reports.
- **Deposit** per item, included when ordering; returns are handled at `/staff/deposit`; reported separately from revenue.
- **Stock** per item (optional): decremented atomically when ordering, sold out at 0, a cancellation gives it back. Kitchen and bar can mark items as sold out themselves (the "Sold out" button in the app bar; the bar also holds the station name, so the kitchen/bar screen keeps its whole height for orders).
- **Editing items later** (Event → Menu): click the price directly in the table, or use the pencil to edit name, price, deposit, category, station, stock, sort order and allergens, also after a spreadsheet import. Changes apply to new orders; booked items keep their name and price, and every change is written to the audit log.
- **Staff meals**: waiters book "Helper / staff" items at €0 with a reason; the report shows quantity and goods value, no revenue.
- **Promotional prices** (Event → "Promotions"): time-based prices such as "Happy Hour 5–6 pm beer €3" or "from 10 pm bratwurst €2" – a fixed price or a discount in % or €, for items and/or whole categories, optionally only on certain weekdays or dates, also across midnight (times in `Europe/Berlin`). The price is calculated server-side when ordering and stored on the item together with the promotion's name; deposit stays unchanged. If promotions overlap, the **lowest price** applies (no stacking), and on a tie the promotion that names the item individually wins; a promotion can only lower prices. Menu and waiter pad show the old price struck through with "Happy Hour until 18:00"; if the server books a different price than shown (a promotion started or ended), a notice shows the booked prices. The "Promotions" report shows quantity, revenue and discount per promotion.
- **Legal notice & privacy policy** per event (Admin → Design), shown as links at the bottom of the guest pages.
- **Print a receipt** after payment (not a tax receipt).
- **Tips**: when collecting payment, the waiter can tap "Change as tip" or "Round up" (to the next full euro, above €20 to the next €5) or enter any amount. Tips are not revenue; they stay in the cash drawer and count towards the expected amount, and the receipt and the "Tips" report per waiter show them, so they can be shared out after the festival.
- **End event**: the live event's workspace has its own button. It lists open tables, open cash drawers and finished items that were not served; the app makes open items visible but does not block. Another event can only be activated once the live one has ended. An ended event can be deleted permanently after exporting its reports as CSV.
- **Rehearsal mode** does not change stock levels, and cancellations in rehearsal mode give nothing back. "Delete test data" removes only test data. "End rehearsal" also resets table assignments and "asked at the table" marks, so the festival starts clean.
- **Confirmations** (closing the drawer, removing a passkey, renewing the join link) appear as the app's own dialog. Changing a PIN or password happens inline in the row under Admin → Staff.
- **Against orders from passers-by**: a guest phone stays signed in to its table for 12 hours; under "Hand out tables" the shift lead can also sign out all guest phones at the end of a shift ("Sign out guest phones"), after which guests scan the QR code on their table again. Each phone may have only so much ordered and not yet paid, separately for drinks (bar) and food (kitchen); the admin sets both amounts per event (Event → "Guest order limits", default €50 / €80, empty = no limit). The table bill shows which guest phone ordered a line ("Phone 2"). An item brought to a table where nobody ordered it is voided with the one-tap reason "Not ordered by this table"; the shift lead may void items that are already finished, and the voids report shows the table.
- **Call the service** (Event → Features, off by default): guests tap "Call the service" and pick a reason (order, question; they pay when served). The table's waiter sees it at the top of the service screen with tone and vibration; if nobody holds the table or nobody answers within 2 minutes, every waiter sees it. The shift lead sees all calls with table, waiting time and waiter, and the bar screen shows every call, so waiters without a phone see it when they pick up drinks. "On my way" (or "Passed on" at the bar) answers the call, and the guest sees for 3 minutes that someone is coming; a payment, a waiter's order or "asked" at the table answers it too and means the service was there: the table then cannot call for 5 minutes and the guest sees why. One open call per table. Switched off, the button and the lists are gone.
- **Buzzers at the kitchen/bar** (Event → Features, off until a buzzer is added): up to four big buttons per station (kitchen and bar each have their own list), each a one-key keyboard (USB or Bluetooth HID, e.g. a one-key macro pad or a DIY arcade button; cheap camera remotes that send "volume up" do not work in the browser). The admin taps "Add buzzer" at the station and presses the buzzer once; removing one moves the buzzers after it up a lane. With buzzers the station's screen shows one lane per buzzer (1 green, 2 blue, 3 amber, 4 violet) instead of the cards: the order its person works on, with large items and the table number as a plate; the other orders wait below under "Next up". A press finishes the lane's order (toast with the table and "Undo") and the lane takes the oldest waiting order; the other lanes keep their orders. Lanes are stored on the server, so every screen of a station shows the same, and a newly taken order counts as "in preparation" for the guest. In lane mode a later round of a table only joins its card when ordered within a minute of the card's first order; anything that arrives after the lane took the card shows apart as "New" on an amber line, so a changed quantity cannot slip by. A later round waits as its own card tagged "Later order". A tap finishes any order, lane or waiting, without moving the lanes. On a tablet or TV the view fills the screen exactly: each lane's type shrinks (then spreads over two columns) until the whole order fits, the waiting orders stand on the right, and a lane that still cannot show everything says so in red (zoom out in the display menu). A second signal within a second is ignored, so a hard slap finishes one order; typing in a field is left alone. Test with any keyboard first.
- **Pay for food when ordering** (Event → Features, off by default): the kitchen only gets food once it is paid, so food runners can hand it out without cashing. A waiter's table order has "Send & food paid cash", which cashes only the food. A guest's food (QR code) waits: the guest sees "waiting for payment", the table turns blue with "Cash food" and a tone, and "Cash food" in the table view opens the payment with only the food selected. Once it is paid the kitchen sees it. Drinks still go to the bar at once and are paid when brought. Food the kitchen had already started when the switch was turned on stays on its screen.
- **Automatic retry when the network is busy**: ordering and collecting payment retry by themselves (after 1, 2, 4 and 8 seconds, at most 20 seconds in total). The button shows "attempt n of 4" and can be cancelled. If it is unclear whether a payment was booked, simply collect again: the same request is never booked twice.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres URL (Neon: *pooled* connection string) |
| `JWT_SECRET` | yes | ≥ 32 characters, signs the login cookies |
| `CRON_SECRET` | on Vercel | protects `/api/cron/sweep` (daily cleanup run, see DEPLOYMENT.md) |
| `COOKIE_DOMAIN` | no | leave empty unless you need a shared parent domain |
| `NUXT_PUBLIC_APP_URL` | no | fixed URL for QR codes and the join link (default: the address the admin opened the app on) |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | no | domain and origin for passkeys (default: current domain), e.g. `pos.example.org` / `https://pos.example.org` |
| `SENTRY_DSN` | no | error tracking with Sentry (server and browser, errors only, see DEPLOYMENT.md → Monitoring); empty = off |
| `DB_DRIVER` | no | `pg` = plain Postgres over TCP (local/CI); default is the Neon WebSocket driver |

Server values are read at runtime, not baked into the build (exception: the browser part of `SENTRY_DSN` is read at build time). `/api/healthz` responds with 503 if something is missing.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Development / build (migrates only on Vercel production or with `MIGRATE=1`) / start |
| `pnpm lint`, `pnpm lint:layers`, `pnpm typecheck` | ESLint, 300-line rule, types |
| `pnpm test` / `pnpm test:coverage` | Server: unit, contract and integration tests (pg-mem). App: stores, composables and components (happy-dom). Coverage thresholds per area |
| `pnpm test:pg` | Integration tests against a real Postgres (`TEST_DATABASE_URL`, completely rebuilt) |
| `pnpm test:e2e` | Playwright smoke tests against a running app (`PLAYWRIGHT_BASE_URL`, seeded DB) |
| `pnpm db:generate` / `pnpm db:migrate` | Generate a migration from `server/db/schema.ts` / apply migrations |
| `pnpm db:seed` | Demo data (refuses to run in production) |
| `pnpm admin:create` | Create an admin account or reset its password |
| `pnpm perf:flow` | Full-flow load test against `PERF_BASE_URL` (seeded app; `PERF_TABLES`, `PERF_GUESTS`, `PERF_WAITERS`, `PERF_DURATION_S`, `PERF_ORDERS_PER_HOUR`): p50/p95/p99 per endpoint, visibility delays, report consistency; exits 1 on p95 > 500 ms, errors > 1 %, visibility > 5 s. Books real orders: use a rehearsal event or a throwaway database |
| `pnpm screenshots` | Screenshots of the scenes (light/dark) against a local Postgres, e.g. `--scene staff-grid --out docs/screenshots/<package>`; starts the app and database if needed |

## CI

`.github/workflows/ci.yml` runs on every PR and every push to `main`:

- **lint**, **typecheck**, **test** (with a coverage report in the job summary), **build** (as on Vercel)
- **db-e2e**: Postgres service → migrations from scratch → `test:pg` → seed → start the Node build → Playwright smoke tests for all flows (guest, waiter, kitchen/bar, admin, reports, refund, cash closing/receipt/staff meals/legal notice, PWA, CSP, axe accessibility)

`perf-smoke.yml` manually measures p95 latencies against a deployment URL. Dependabot keeps npm packages and Actions up to date.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md), which also covers backup and rollback.

## Legal notes

> **Not legal advice.** The following notes are the developers' assessment and do not replace advice from a tax advisor, the tax authority or a data protection officer. The organization that runs the app is responsible for its operation.

### Fiscal compliance (TSE)

This app is an ordering system, not a certified cash register. In some countries, electronic systems that record cash sales must meet fiscal requirements. In Germany, for example, § 146a AO (the fiscal code) and the KassenSichV (cash register security ordinance) apply to **electronic recording systems with a cash function**, and there is no exemption for non-profit clubs. The app records orders and books cash payments per waiter, so it is very likely such a system. It has **no** certified technical security module (TSE, *technische Sicherheitseinrichtung*), does not issue receipts that meet these requirements and is not registered with the tax authority.

Before the app books real money at an actual festival, there are two options:

1. **Run it as an ordering system only.** The app forwards orders to kitchen and bar and shows the open amount. Cash is settled separately through an **open cash box** with a cash report (opening float, closing balance, withdrawals, takings). The app's reports and cash closing are then internal aids only, not a cash record; the printed receipt is not a tax receipt. The cash and reports pages say so in a short note: "Internal control, not a tax-compliant cash closing".
2. **Ask a tax advisor first** whether and how the specific use (charitable or commercial activity, revenue level, type of cash register) is permitted.

### Data protection

The app is designed for data minimization (no guest accounts, no tracking, no analytics). Even so, it processes personal data, and the operator needs a legal notice and a privacy policy. The admin enters the texts per event under "Design"; the app shows them as links on the guest pages but does not prescribe their content.

- **Cookies:** Technically necessary cookies that do not require consent (in Germany § 25 para. 2 TDDDG, the implementation of the ePrivacy rules): guest session (HttpOnly, 12 hours, links orders to the table), staff login (HttpOnly, 12 hours), CSRF protection, and `pos_theme` (light/dark setting). The view selection in kitchen/bar is stored in the device's `localStorage`.
- **Stored data:** Orders and payments with table number and waiter, audit log (who collected, cancelled or refunded, and when), staff accounts (username, hash of password/PIN; for join-link users only the name they entered, bound to one event). Failed logins store the username and IP address for 15 minutes.
- **Logs:** Vercel logs requests (including IP address, URL and user agent) according to its own retention periods. The app writes JSON logs with request ID, route, staff ID, table number and amounts, but without IP addresses or order contents. Unexpected errors are logged with their message and stack frames; query parameters are removed from database error messages.
- **Error tracking (optional):** With `SENTRY_DSN` set, unexpected errors from the server and the browser go to **Sentry** (EU data storage, Frankfurt). Reports contain the error, route, role, release, browser and device type, but no IP addresses, names, order contents, cookies or query strings; browser reports are passed through the app's own server so Sentry never sees the visitor's IP. No cookies are set and guest phones store nothing; staff screens buffer unsent reports in IndexedDB. Legal basis is typically the operator's legitimate interest in a working system (Art. 6(1)(f) GDPR). Sentry then needs a DPA and a sentence in the privacy policy, for example: „Zur Fehleranalyse übermitteln wir bei technischen Fehlern eine Fehlerbeschreibung (Fehlermeldung, aufgerufene Seite ohne Parameter, Browser- und Gerätetyp, App-Version) an Functional Software Inc. (Sentry), Speicherort EU (Frankfurt). IP-Adressen und Bestellinhalte werden nicht übermittelt. Rechtsgrundlage ist unser berechtigtes Interesse an einem fehlerfreien Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Die Fehlerberichte werden nach [Frist laut Sentry-Tarif] gelöscht.“ Fill in the retention period of your Sentry plan.
- **Data processors:** **Vercel** (hosting, logs) and **Neon** (database), plus **Sentry** if error tracking is enabled. A data processing agreement (DPA, in the EU under Art. 28 GDPR; German "AVV") is required with both. Both offer standard DPAs. Region: Frankfurt (`fra1`, AWS `eu-central-1`); Vercel and Neon are US companies, so transfers rely on their standard contractual clauses or the EU-US Data Privacy Framework.
- **Deletion:** A daily sweep deletes guest sessions without orders, payment locks and old login attempts. Orders, payments, refunds, cash closings and the audit log are kept for accounting (rule in `.specify/memory/constitution.md`, principle IV). There is not yet a tool to delete old events together with their orders.

## More documentation

- [`AGENTS.md`](AGENTS.md): short rules for AI agents and contributors
- [`specs/001-festival-pos-third-variant/`](specs/001-festival-pos-third-variant/spec.md): the current specification, with a section "Added since the spec"
- [`specs/002-kellner-bestellung-tischansicht/`](specs/002-kellner-bestellung-tischansicht/plan.md): waiter ordering and table view

## License

[MIT](LICENSE)
