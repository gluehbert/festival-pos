# Plan: Waiter Ordering, Cashing Up and Table View in Kitchen/Bar

Status: 2026-10-13 · Branch `ccr-03f2d7c3-gk0ibg`

## Implementation status

| Phase | Status |
| --- | --- |
| 1 – `orders.kind` | ✅ implemented (migration `0005_staff_table_orders`, existing data is carried over as `walkin`) |
| 2 – Waiter ordering | ✅ implemented: `/staff/order` (table), `/staff/order?walkin=1` (counter, "Send & paid in cash"), "Order more" in the table view |
| 3 – Cashing up | ✅ Partial quantities per item ("2 of 10 beers"), "Select all", change helper · `payments.method` only with the second payment method (existing data is then carried over as `cash`) |
| 4 – Kitchen/bar grouped by order | ✅ one tile per order, "Table N all done" (`POST /api/production/orders/:id/done`, own station only), per-device toggle "By order"/"Individually"; the waiter (Kellner) sees "Food ready (n)"/"Drinks ready (n)" and confirms with "Delivered ✓" (`order_items.served_at`, `POST /api/tickets/:key/served`) |

Decisions (2026-10-13): Kitchen/bar groups **per order**; waiters may use **any table number ≥ 1**, even outside the QR table range.

Partial quantities, technically: If only part of an item is paid, the item is split – the original row keeps the open remainder, a new row with the same order time carries the paid quantity (`server/lib/payment-settle.ts`). Reports, void and refund therefore keep working unchanged on whole rows. The cash-up page merges open items of the same article and price and distributes the selected quantity to the oldest rows first.

## 1. Findings – what is missing and why

### 1.1 Waiter takes an order → missing in the frontend

| Where | Status |
| --- | --- |
| First specification `docs/archive/001-festival-pos-system-dotnet/spec.md` (archived, no longer in the repository), **User Story 4 "Staff Order Management"** | planned: waiter creates orders **for a table**, adds to open tables, table overview, take over a table |
| Master Plan v2 (`docs/archive/MASTER-PLAN-v2.md`, archived, no longer in the repository), sections 5A, 5D, 5F, 6.2 | planned: collective ticket per table, walk-in with "Pay now", favorite tables, table grid |
| Old Nuxt UI (`frontend/pages/staff/tickets/new.vue`, `frontend/pages/staff/menu.vue`, `StaffMenuSelector.vue`) | **was implemented** (enter table number, pick items with +/−, "pay immediately") |
| Third variant `specs/001-festival-pos-third-variant/spec.md` (= current code) | **reduced to "walk-in"**: US4 is called "Admin management" there, the waiter table order no longer appears (FR-013 walk-in only) |
| Commit `4b1e879` "remove legacy frontend/backend variants" | deleted the old UI including the waiter order pages |
| Current code | The server supports **walk-in only** (`POST /api/orders` with `createWalkin: true`). There is **no page** that calls it. A waiter order **for a table** is not possible on the server at all |

Cause in one sentence: When rewriting as the "third variant", the specification was slimmed down; the waiter table order dropped out of the specification, the walk-in UI was never built, and the cleanup commit removed the old implementation.

Additional technical catch: Today the code distinguishes "walk-in" from "table" via `orders.created_by_staff IS NOT NULL`
(`server/api/tickets/index.get.ts:69`, `server/api/tickets/[id].get.ts:67`, `server/api/payments/index.post.ts:74/83/232`, `server/api/orders/index.post.ts:36`).
A waiter order for table 12 would thus end up as its own walk-in ticket instead of on the table bill. This has to be decoupled first.

### 1.2 Cashing up → exists

Cash payment at the table already works: `/staff` (open tables) → open a table → **"Collect payment"** (`/staff/[table]/pay`), select/deselect items (partial payment), book the payment. When all items are paid, the table automatically switches to "paid". Only convenience points are missing (see Phase 3).

### 1.3 Kitchen/bar: work through tables one after another → missing

The production view (`app/pages/production/index.vue`) shows **each item as its own tile**, sorted by time. There is no grouping by table/order and no "Table all done". The old UI did not have it as grouping either (also per item there), so this is a genuine novelty.

> Assumption: "Copying tables" is meant as "**grouping**/bundling tables" – see all items of a table together, finish the table, then the next. Please correct if something else was meant.

## 2. Target picture (flow at the festival)

```
Guest (young)  ── QR code ──┐
                            ├─► Bill of table 12 ─► Kitchen/bar (tile "Table 12") ─► done
Guest (older)  ── waiter ───┘                                   │
                                                                ▼
                                Waiter sees "Table 12: food ready" ─► delivers ─► collects cash
```

- Both order paths end up on the **same table bill** (collective ticket).
- Walk-in/counter stays standalone, optionally with "paid in cash immediately".
- Payment initially **cash only**; the payment method is already stored, however, so that SumUp/PayPal or similar can dock on later.

## 3. Implementation in phases

Each phase is runnable on its own and is delivered as its own PR.

### Phase 1 – Decouple the data model (foundation, small)

- New column `orders.kind TEXT NOT NULL` with `CHECK (kind IN ('guest','staff_table','walkin'))`.
  - Migration fills existing data: `guest_session_id IS NOT NULL → 'guest'`, otherwise `'walkin'`.
  - The existing CHECK (exactly one of guest session/staff) is replaced: `guest` ⇒ session set; `staff_table`/`walkin` ⇒ `created_by_staff` set.
- Switch all places that today read `created_by_staff IS NULL/NOT NULL` as "table/walk-in" to `kind = 'walkin'` or `kind <> 'walkin'` (list see 1.1).
- Tests: existing walk-in, payment and ticket tests must stay green unchanged; new schema test for the CHECK.

### Phase 2 – Waiter takes an order

**Server**
- Extend `CreateOrderSchema`: `mode: 'guest' | 'staff_table' | 'walkin'` (legacy field `createWalkin` remains compatible), `payNow?: boolean` (walk-in only).
- `POST /api/orders` with `mode: 'staff_table'`: role `waiter`/`admin`, the table number must lie within the event's table range, the order goes onto the table bill `t-<nr>`. Idempotency key as before (double tap on a bad network).
- Walk-in with `payNow`: order + cash payment in **one** transaction; items still go to kitchen/bar.

**UI**
- `/staff` gets two large buttons at the top: **"New order"** and **"Walk-in / counter"**.
- New page `/staff/order` (or `/staff/[table]/order` directly from the table view – button **"Order more"**):
  1. Choose the table number (number field/table grid); for walk-in this is omitted.
  2. Menu by kitchen/bar or categories, large +/− buttons (like the guest menu, reused from `app/components/guest/MenuList.vue`), sold-out items greyed out.
  3. Summary with total → **"Send to kitchen/bar"**; for walk-in additionally **"Send & paid in cash"**.
- New store `app/stores/staffOrder.ts` (waiter's cart, idempotency key per submit).
- i18n DE/EN.

**Tests**: Contract (roles, table range, idempotency, `payNow`), integration (guest + waiter land on the same table bill, cashing up via both order paths), component tests, Playwright `us6-waiter-order.spec.ts`.

### Phase 3 – More convenient cashing up (cash)

- Cash-up page: buttons **"Pay all"** and **"Pay selection"**, display **"Given" → "Change"** (calculation helper, not stored).
- Items with quantity > 1 splittable (e.g. pay 1 of 3 beers) – today only whole items.
- After completion a clear confirmation "Table 12 paid ✓" and back to the overview.
- Store `payments.method` (default `'cash'`) and show it in the reports – preparation for later card payment, without building it now.

### Phase 4 – Kitchen/bar: group by table

- `GET /api/production/queue` additionally returns groups: per order (or per table) all open items of the station, sorted by oldest item.
- View with toggle **"by table" / "individually"** (default: by table, setting remembered per device):
  - One large tile per table: "Table 12 · for 6 min", below it all items with quantity.
  - Tapping individual items ticks them off; button **"Table 12 all done"** sets all items of the tile to done in one step (new endpoint `PATCH /api/production/orders/:id` or bulk update, one transaction).
  - The oldest tile is always at the top left → "finish one table, then the next".
- The waiter overview shows per table **"Food ready"/"Drinks ready"** (Master Plan 6.2, red marking), so it is clear when delivery can happen.

### Phase 5 (optional, later)

- "My tables"/take over a table (Master Plan 5F) – implemented: `table_assignments`, filter "Mine/All" (hint "Needs someone" for open tables without an assignee), table grid, strip "Ready at the counter" under "Mine" for finished trays of other tables (any waiter brings and cashes them).
- Status "served" after "done", so the waiter marking disappears after delivery.
- Further payment methods (SumUp, PayPal, …) via `payments.method`.

## 4. Order and effort (rough)

| Phase | Content | Effort |
| --- | --- | --- |
| 1 | `orders.kind` + switching the queries | small (½ day) |
| 2 | Waiter order table + walk-in incl. "paid in cash immediately" | medium (1–2 days) |
| 3 | Cash-up convenience, change, partial quantities, `payments.method` | small–medium (1 day) |
| 4 | Kitchen/bar grouped by table, "Table all done", ready notice for the waiter | medium (1–1½ days) |

Recommendation: Phases 1+2 first (this is the actual gap closure for older guests), then 4, then 3.

## 5. Resolved questions

1. "Copying tables" = group by table – yes.
2. Grouping per order – yes.
3. Table numbers outside the QR range – yes.
