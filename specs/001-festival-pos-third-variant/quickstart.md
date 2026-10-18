# Quickstart: Festival POS — Serverless MVP

**Feature**: `001-festival-pos-third-variant`
**Date**: 2026-05-28

## Prerequisites

- Node.js 22 LTS
- pnpm 10+ (project pins `pnpm@10.33.2` via `packageManager`)
- A Neon account (free tier is enough) with an empty Postgres branch
- Optional: Vercel CLI (`npm i -g vercel`) for preview deployments

## Setup (one-time)

```bash
pnpm install
cp .env.example .env
# Fill .env with your own values:
#   DATABASE_URL=postgresql://<user>:<pass>@<host>/<db>?sslmode=require
#   JWT_SECRET=<min 32 random characters>
#   COOKIE_DOMAIN=localhost
#   NUXT_PUBLIC_APP_URL=http://localhost:3000
pnpm db:migrate    # drizzle-kit migrate
pnpm db:seed       # creates demo event, 10 items, 20 tables, staff
```

## Local development (single-command start)

```bash
pnpm dev
```

`pnpm dev` starts Nuxt + Nitro on `http://localhost:3000`. There are **no** separate processes for backend, worker or database. The DB is remote (Neon) — no Docker required.

## Demo flows

1. **Guest**: `http://localhost:3000/t/3` (table 3) → menu, place an order.
2. **Service**: `http://localhost:3000/staff/login` with `waiter1 / 1111` → tickets, partial payment.
3. **Kitchen**: `http://localhost:3000/staff/login` with `kitchen1 / 1111` → `/production`.
4. **Admin**: `http://localhost:3000/staff/login` with `admin / admin123` → `/admin/events`; each event has the tabs Overview, Design, Price list, QR codes and Reports under `/admin/events/{id}`.

## Tests

```bash
pnpm test           # Vitest (unit + contract + integration against an ephemeral DB)
pnpm test:e2e       # Playwright (smoke flows; headless Chromium) — currently skipped until the deploy harness exists
pnpm lint           # ESLint
pnpm lint:layers    # FR-045 (≤300 lines) + SC-008 (forbidden layer folders)
pnpm typecheck      # nuxt typecheck (equivalent to `npx tsc --noEmit -p tsconfig.json`)
pnpm perf:smoke     # autocannon p95 smoke against PERF_BASE_URL (default http://localhost:3000)
```

## Deployment on Vercel

1. Push the repo to GitHub.
2. In Vercel: **New Project → Import**. Nuxt is detected automatically, preset `vercel`.
3. Set ENV variables: `DATABASE_URL` (Neon pooled URL), `JWT_SECRET`, `COOKIE_DOMAIN` (e.g. `pos.example.org`), `NUXT_PUBLIC_APP_URL`.
4. Production branch: `main`. Preview deployments active for all other branches.
5. Neon: two branches — `main` for production, `dev` for preview deployments (branch-specific `DATABASE_URL` via Vercel Preview Env).
6. Build command: `pnpm build` (internally runs `drizzle-kit migrate` + `nuxt build`).

## Free-tier sanity checks

- Do not lower polling intervals below the defaults (4 / 5 / 8 s).
- Max. ~50 tables × 200 orders/h stays under the Neon free connection limits, because `@neondatabase/serverless` is HTTP-based.
- Function duration of all endpoints stays < 1 s (health check as smoke test).

## Common errors

| Symptom                                          | Cause                                    | Solution                                                  |
|--------------------------------------------------|------------------------------------------|-----------------------------------------------------------|
| `ECONNREFUSED` on first request                  | Wrong `DATABASE_URL`                     | Check the Neon pooled URL (`?sslmode=require`)            |
| 401 after login                                  | Cookie domain does not match             | Adjust `COOKIE_DOMAIN` to the hostname                    |
| 403 on mutating requests                         | CSRF token missing                       | Call `GET /api/csrf-token` before the mutating call       |
| QR code PDF empty                                | `from`/`to` range invalid                | Check both query parameters; they must lie within the event range |
