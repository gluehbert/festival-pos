---
name: screenshots
description: Captures screenshots of the running app against a local Postgres; use when a visible change should be shown in a PR
---

# Capturing screenshots

Command (from the project folder):

```bash
pnpm screenshots --scene <name> --out docs/screenshots/<package>
```

- `pnpm screenshots` starts Postgres 16 if needed, migrates, seeds, builds (`NITRO_PRESET=node-server`, skipped if `app/` and `server/` are unchanged since the last build) and starts the app on port 3000. If it is already running, only the health check is done. A first run takes about three minutes, every further run a few seconds.
- Options: `--scene <name>` (repeatable, default all), `--out <folder>` (default `tests/screenshots/out/`, git-ignored), `--base <url>`, `--reset` (reset the database: drop, migrate, seed).
- Each scene writes `<name>.png` (light) and `<name>-dark.png` (dark). One line per file is printed to stdout at the end.
- After code changes in `app/` or `server/`, the next run rebuilds, but only if the old server has been stopped (`pkill -f .output/server/index.mjs`).
- Chromium runs from `/opt/pw-browsers/chromium` (or `PW_CHROMIUM_PATH`). Never run `playwright install`.

## Scenes

`guest-menu`, `guest-cart`, `guest-status`, `staff-grid`, `staff-table`, `staff-pay`, `staff-order`, `staff-cash`, `production-orders`, `admin-event`, `admin-menu`, `admin-reports`.

Viewports: guest and service use Pixel 5, kitchen/bar 1180×820, admin 1280×900. Language: English.

## Adding a new scene

One function per scene in `tests/screenshots/scenes-guest.ts`, `scenes-staff.ts` or `scenes-admin.ts` (`Scene = (ctx) => Promise<void>`): `ctx.open('<viewport>')` returns a page; prepare it like a user would (helpers in `setup.ts`), then call `ctx.shoot(page, '<name>')`. Then register it in `SCENES` in `scenes.ts`. Keep files under 300 lines.

## Showing it in a PR

1. Commit the PNGs under `docs/screenshots/<package>/`.
2. Embed them in the PR description:
   `![Scene](https://github.com/<owner>/<repo>/blob/<branch>/docs/screenshots/<package>/<file>.png?raw=true)`
3. Also send the PNGs to the user in the session (SendUserFile).
