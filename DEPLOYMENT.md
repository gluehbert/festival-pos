# Deploying to Vercel + Neon

Effort: about 30 minutes. Cost: €0 (Vercel Hobby + Neon Free).

Steps: create the Neon database → import the repo into Vercel → set environment variables → deploy → create the first admin.

---

## 1. Neon database

1. Sign in at [neon.tech](https://neon.tech) with GitHub and choose **Create Project**:
   - Name: `festival-pos`, database: `festival_pos`
   - Region: **AWS Europe Central (Frankfurt)**, matching the Vercel region `fra1`
2. **Connection Details** → enable **Pooled connection** → copy the connection string:
   ```
   postgresql://user:pass@ep-xxxx-pooler.eu-central-1.aws.neon.tech/festival_pos?sslmode=require
   ```
3. Optional but recommended: under **Branches**, create a branch `preview` and note its pooled URL as well. This way preview deployments never touch production data.

## 2. Vercel project

1. Sign in at [vercel.com](https://vercel.com) with GitHub → **Add New… → Project** → import the repository `festival-pos`.
2. The framework is detected as **Nuxt**. Root directory, build command (`pnpm build`) and output stay at their defaults.
3. Set the **Environment Variables** before you click Deploy:

| Variable | Production | Preview |
| --- | --- | --- |
| `DATABASE_URL` | pooled URL of the main DB | pooled URL of the `preview` branch |
| `JWT_SECRET` | `openssl rand -base64 48` | a separate value |
| `CRON_SECRET` | any random value | – |

Leave `COOKIE_DOMAIN` and `NUXT_PUBLIC_APP_URL` empty. The app automatically uses the current domain, including on preview URLs. Table QR codes and the helper join link also use the address the admin opened the app on when `NUXT_PUBLIC_APP_URL` is unset. So always generate the QR PDF and the join link from the production domain (for example `festival-pos.vercel.app`), not from a deployment URL such as `festival-pos-abc123-team.vercel.app`: that one requires a Vercel login, and guests would get stuck. Set `NUXT_PUBLIC_APP_URL` if you have a custom domain and want the QR codes to point to it permanently. When the variable is set, it always takes precedence: if the join link or QR codes point to a wrong address, first check `NUXT_PUBLIC_APP_URL` in Vercel (Settings → Environment Variables) and then redeploy.

Passkeys are bound to a domain. Without `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`, that is the domain the app runs on. A passkey from the production domain therefore does not work on preview URLs, and after a domain change everyone has to set up their passkeys again (PIN and password keep working).

**Quick sign-in on previews:** On preview deployments (`VERCEL_ENV=preview`), the start page `/` redirects to `/staff/login` (the guest landing stays reachable as `/?table=N`), and `/staff/login` additionally shows buttons for waiter, shift lead, kitchen, bar, admin and guest. One tap signs in without a PIN or password. The accounts `preview-waiter`, `preview-admin` etc. are created by the app on the first tap, with a password nobody knows. "Guest" sits at the first table of the active event. If the preview database has no active event, the first tap creates the "Preview-Fest": tables 1–20, event PIN `PREVIEW1`, a demo menu with deposit and staff meals, and open orders at table 3 (in progress), 5 and 7 (ready to serve), all three assigned to `preview-waiter`. An existing active event is left untouched. For the schema to be correct, set `MIGRATE=1` on previews that have their own database branch (see below). In production and locally the buttons do not exist, and the server rejects the endpoint there. The only protection is the Vercel login in front of preview URLs: **keep Deployment Protection enabled for previews** and run previews against their own `preview` database branch, otherwise the preview accounts end up in your production data.

4. **Deploy**.

### What happens on deploy

- `pnpm build` first runs `scripts/migrate.ts`. The script migrates **only on production deployments** (`VERCEL_ENV=production`). Preview builds skip the migration; if a preview has its own Neon branch DB, set `MIGRATE=1` as a preview variable when needed.
- `vercel.json` sets the region `fra1` and a daily cron (04:00 UTC) on `/api/cron/sweep`. It cleans up expired payment locks, guest sessions, old failed login attempts, expired passkey challenges and the flyers of events that ended more than 90 days ago. Orders and revenue are kept because of record-keeping obligations. The number of phone sign-ins per table (table `guest_scans`, no personal data) is also kept for the "App usage" report. In addition, API traffic triggers the sweep, but at most once per hour across all instances (timestamp in the table `maintenance_runs`) and in the background, without delaying the request. The polling endpoints (`/api/tickets`, payments) do not clean up anything themselves: expired payment locks are ignored there via `expires_at` and replaced on the next payment. Without Vercel (your own server), any cron can call `/api/cron/sweep` with `Authorization: Bearer $CRON_SECRET`.

## 3. Verify

```bash
curl https://<your-app>.vercel.app/api/healthz
# {"status":"ok","dbLatencyMs":12}
```

A 503 response names the missing variable, for example `JWT_SECRET is missing or shorter than 32 characters`. Add the variable in Vercel and **Redeploy**. Values are read at runtime, but a redeploy applies them to all running instances.

## 4. Create the first admin

Locally, once, with the production URL (do not use the demo data from `db:seed`; it refuses to run against production anyway):

```bash
DATABASE_URL='postgresql://…pooler…/festival_pos?sslmode=require' pnpm admin:create
# Admin username: board
# Password (min. 12 chars): ************
```

The same command resets the password of an existing account.

## 5. Set up an event

Each event has its own workspace. At the top of `/admin/events` is the event that is currently running, below it all other events with their status (**Draft**, **Live**, **Rehearsal**, **Ended**). **"Edit"** opens an event's workspace. It always shows "You are editing: …" at the top, followed by the tabs **Overview**, **Design**, **Price list**, **QR codes** and **Reports**. Everything in these tabs applies to that one event only. This lets you prepare the next event (for example its price list) in peace while another one is live. For the live event, a green header points out that changes are immediately visible to guests.

1. `https://<your-app>/staff/login` → sign in as admin → `/admin/events`: create a **"New event"**. It opens as a draft. Only **"Activate"** (with a confirmation) makes it live. While another event is live, activating is refused: end that event first (step 6).
   In the **"Design"** tab you give the event its own look: accent color, logo (PNG/JPEG/WebP, max. 1 MB), welcome text, program and flyer (image or PDF, max. 4 MB). Guests see this on the start and order pages, so they can tell they are on the right page. Colors that are too light are automatically darkened for text so everything stays readable. The flyer is deleted automatically 90 days after the event ends (event end = "End event", see step 6); logo and texts are kept as a template.
   Under "Design" you can also change the event's **name** later, for example to fix a typo. QR codes stay valid. There (or already when creating the event) you can also enter the **date**. Guests see it below the event name. It is informational only: orders are enabled exclusively by **"Activate"**.
2. **"Price list"** tab: maintain the menu (station kitchen or bar). It is faster with **"Download template / current menu"**: fill in the `.xlsx` file in Excel, LibreOffice or Google Sheets and import it with **"Upload file"** (`.csv` works too). Before applying, a preview shows what will be created and what will be changed; items are matched by their name (DE).
3. **"QR codes"** tab: generate and print the QR code PDF for the tables. Each QR code contains a key for exactly this table and this event; without it, a guest can only reach the table with the event PIN (printed below the QR code). If `JWT_SECRET` is changed, the QR codes must be printed again.
4. `/admin/staff`: create accounts for waiters, kitchen and bar (PIN, 4–8 digits) and additional admins (password, at least 12 characters). Deactivating or changing a role takes effect immediately, including on devices that are already signed in.
   Helpers for a single evening do not need an account: in the event's **"Staff"** tab, create a join link and show it as a QR code or send it to the group. Whoever opens it enters a name (unique per event) and waits until you approve them in the tab (role selectable, default waiter). Access is only valid while this event is active; "Deactivate" removes someone immediately, "Create new link" invalidates a link that was passed around. If a known name signs in on a new device, that also needs your approval.
5. **Rehearsal for onboarding:** For the active event, in the "Overview" tab, click **"Start rehearsal"**. All orders and payments are then marked as test data, a yellow "REHEARSAL" banner appears everywhere, and the reports do not count them. **"Delete test data"** starts a new practice round. **"End rehearsal"** deletes all test orders and payments and switches to real operation. Real orders are never touched.
6. **End the event after the festival:** In the live event's "Overview" tab, **"End event"** shows a checklist: open tables with their amounts, open cash drawers and finished items that were not served. If everything is clear, confirm once. If something is still open, the button reads "End anyway" and needs a second tap; open amounts are recorded as not collected. Waiters can still close a drawer that belongs to an ended event. Helpers who joined by link are signed out when their event ends, so close their drawers before ending the event.
7. **Delete an ended event permanently (optional):** At the bottom of an ended event's "Overview" tab, first download all reports as CSV, then **"Delete event"** becomes available and asks you to type the event name. Orders, payments, cash closings and helper accounts of this event are deleted for good; the audit log keeps a record of the deletion. Clarify the retention periods for your accounting before you do this.

## 6. Optional

- **Custom domain:** Vercel → Settings → Domains. Then set `NUXT_PUBLIC_APP_URL=https://pos.example.org` and print the QR codes again.
- **Branch protection:** GitHub → Settings → Branches → rule for `main` with the required checks `lint`, `typecheck`, `test`, `build`, `db-e2e`.

## Troubleshooting

| Symptom | Cause / solution |
| --- | --- |
| Build fails at `migrate` | `DATABASE_URL` is missing or wrong (check the Production scope). |
| `/api/healthz` → 503 | See the message; set the variable, redeploy. |
| Login → 429 | 10 failed attempts in 15 minutes for this user. Wait, or run `DELETE FROM login_attempts WHERE username = '…'` in Neon. |
| Guest sees "Your session has expired" | Scan the QR code again; guest sessions last 7 days. |
| Logs | Vercel → Project → Logs. Every response has an `x-request-id` header, which also appears in the JSON logs. |

## Go-live checklist before the festival

- [ ] The [legal notes](README.md#legal-notes) are sorted out (fiscal compliance/TSE, data processing agreements with Vercel and Neon, the organization's privacy policy).
- [ ] CI on `main` is green and the production deployment is the expected one (check the commit in Vercel).
- [ ] `/api/healthz` responds with `ok`.
- [ ] **Backup branch "before" created** (see [Backup](#backup)), name noted.
- [ ] Rehearsal played through: guest orders via QR → kitchen/bar reports ready → waiter collects payment (including a partial payment) → report shows the numbers. Then "End rehearsal".
- [ ] All waiter, kitchen and bar accounts can sign in; accounts that are not needed are deactivated.
- [ ] Someone with admin access is on site and knows how to do a [rollback](#rollback).

## Backup

Neon stores the history of the database. Two approaches build on that:

- **Branch before and after the festival (recommended):** Neon → **Branches** → **Create branch** from `main`, for example `backup-2026-07-04-before` in the morning and `backup-2026-07-04-after` after cash closing. A branch is a complete, immediately usable state of the database and is kept until you delete it. The Free plan allows only a few branches, so delete old backup branches after settlement.
- **Point-in-time restore:** Neon → **Restore** (or branch "from a point in time") restores any point within the retention window. How far back that reaches depends on the Neon plan (Free: only briefly; check the current value in the project settings under "History retention"). For anything more than a few hours back, use the branch approach.

Also save the numbers outside the database: after the festival, in the admin's **"Reports"** tab, download each table via **Export CSV** and file it together with the cash report.

To restore: set the backup branch as the new primary branch in Neon (**Set as primary**), or enter its pooled URL as `DATABASE_URL` in Vercel and **Redeploy**.

## Rollback

Vercel → Deployments → an older deployment → **Promote to Production**.

- **App errors only** (pages, flows): rolling back the app is enough. Migrations are planned to be additive only, so the older deployment also runs on the newer schema.
- **Broken migration or data:** First roll back the app, then restore the database from the "before" backup branch (see [Backup](#backup)). Orders since the backup are lost; pull the CSV exports first.

Afterwards, quickly check: `/api/healthz` is `ok`, and staff login, guest ordering via QR, payment and the kitchen/bar view work.

Before risky schema changes, always create a backup branch first.
