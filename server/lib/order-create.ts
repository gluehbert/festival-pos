import { and, eq, gte, inArray, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { auditLog, menuItems, orderItems, orders } from '../db/schema'
import { AppError, isForeignKeyViolation, isUniqueViolation } from './errors'
import { lineTotalSql } from './line-total'
import { takeStock } from './stock'
import { loadPricingRules, priceItems } from './price-rules'
import type { EffectivePrice } from './pricing'
import type { CreateOrder, OrderResponseItem } from './contracts/guest'

const IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000

export interface OrderContext {
  kind: 'guest' | 'staff_table' | 'walkin' | 'staff_meal'
  guestSessionId: string | null
  createdByStaff: string | null
  tableNo: number
  staffMealReason?: string
}

async function computeTableBalance(
  db: Db,
  eventId: string,
  tableNo: number,
): Promise<number> {
  const rows = await db
    .select({
      sum: sql<string | number | null>`COALESCE(SUM(${lineTotalSql}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.eventId, eventId),
        eq(orders.tableNo, tableNo),
        eq(orderItems.paymentStatus, 'unpaid'),
        ne(orderItems.productionStatus, 'cancelled'),
        ne(orders.kind, 'walkin'),
      ),
    )
  const raw = rows[0]?.sum ?? 0
  return typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw)
}

export async function loadOrderResponse(
  db: Db,
  orderId: string,
  eventId: string,
  tableNo: number,
  isWalkin: boolean,
): Promise<{
  orderId: string
  tableNo: number
  items: OrderResponseItem[]
  tableBalanceCents: number
}> {
  const items = await db
    .select({
      id: orderItems.id,
      menuItemId: orderItems.menuItemId,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
      depositCents: orderItems.depositCents,
      regularPriceCents: orderItems.regularPriceCents,
      priceRuleName: orderItems.priceRuleName,
      note: orderItems.note,
      paymentStatus: orderItems.paymentStatus,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
  const tableBalanceCents = isWalkin ? 0 : await computeTableBalance(db, eventId, tableNo)
  return {
    orderId,
    tableNo,
    items: items.map((i) => ({
      orderItemId: i.id,
      menuItemId: i.menuItemId,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      depositCents: i.depositCents,
      regularPriceCents: i.regularPriceCents,
      priceRuleName: i.priceRuleName,
      note: i.note,
      productionStatus: 'pending' as const,
      paymentStatus: i.paymentStatus as 'unpaid' | 'paid',
    })),
    tableBalanceCents,
  }
}

// Owner of an idempotency key: the guest session, or the waiter for staff
// orders (matching the two unique indexes on orders).
export type KeyOwner = { guestSessionId: string } | { staffId: string }

export async function reuseExisting(
  db: Db,
  eventId: string,
  owner: KeyOwner,
  key: string,
  windowMs: number | null = IDEMPOTENCY_WINDOW_MS,
): Promise<string | null> {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.eventId, eventId),
        'guestSessionId' in owner
          ? eq(orders.guestSessionId, owner.guestSessionId)
          : and(sql`${orders.guestSessionId} IS NULL`, eq(orders.createdByStaff, owner.staffId)),
        eq(orders.idempotencyKey, key),
        windowMs === null ? undefined : gte(orders.createdAt, new Date(Date.now() - windowMs)),
      ),
    )
    .limit(1)
  return rows[0]?.id ?? null
}

export async function createOrderRow(
  db: Db,
  ev: { id: string; trialMode: boolean; depositEnabled: boolean },
  input: CreateOrder,
  ctx: OrderContext,
  key: string | null,
): Promise<string> {
  const ids = input.items.map((i) => i.menuItemId)
  const menuRows = await db
    .select()
    .from(menuItems)
    .where(and(eq(menuItems.eventId, ev.id), inArray(menuItems.id, ids)))
  const menuById = new Map(menuRows.map((m) => [m.id, m]))
  for (const requested of input.items) {
    const m = menuById.get(requested.menuItemId)
    if (!m) {
      throw new AppError(
        'NOT_FOUND',
        404,
        `Menu item ${requested.menuItemId} not found in active event`,
      )
    }
  }
  // Sold out: nothing is booked, the client takes the named articles off.
  const soldOut = menuRows.filter((m) => !m.isAvailable)
  if (soldOut.length > 0) {
    throw new AppError('SOLD_OUT', 409, `Menu item ${soldOut.map((m) => m.nameDe).join(', ')} is not available`, {
      menuItemIds: soldOut.map((m) => m.id),
    })
  }
  // Price at booking time from the menu and the running price rules; the
  // client never sends a price.
  const prices = priceItems(menuRows, await loadPricingRules(db, ev.id), new Date())
  try {
    return await insertOrder(db, ev, input, ctx, key, menuById, prices)
  }
  catch (err) {
    // A concurrent retry with the same Idempotency-Key won the insert race.
    // No time window here: the unique index has none either.
    if (key && isUniqueViolation(err)) {
      const owner: KeyOwner = ctx.guestSessionId
        ? { guestSessionId: ctx.guestSessionId }
        : { staffId: ctx.createdByStaff! }
      const existing = await reuseExisting(db, ev.id, owner, key, null)
      if (existing) return existing
    }
    // The guest session row was swept (expired) while the cookie survived.
    if (ctx.guestSessionId && isForeignKeyViolation(err)) {
      throw new AppError('UNAUTHORIZED', 401, 'Guest session expired, please scan the table QR code again')
    }
    throw err
  }
}

async function insertOrder(
  db: Db,
  ev: { id: string; trialMode: boolean; depositEnabled: boolean },
  input: CreateOrder,
  ctx: OrderContext,
  key: string | null,
  menuById: Map<string, typeof menuItems.$inferSelect>,
  prices: Map<string, EffectivePrice>,
): Promise<string> {
  return await db.transaction(async (tx) => {
    // Stock first: a sold-out article fails the order before anything is written.
    // Rehearsals must not eat into the real stock; the sold-out check stays active.
    if (!ev.trialMode) await takeStock(tx, input.items, (id) => menuById.get(id)!.nameDe)
    const inserted = await tx
      .insert(orders)
      .values({
        eventId: ev.id,
        tableNo: ctx.tableNo,
        kind: ctx.kind,
        guestSessionId: ctx.guestSessionId,
        createdByStaff: ctx.createdByStaff,
        idempotencyKey: key,
        isTrial: ev.trialMode,
        staffMealReason: ctx.staffMealReason ?? null,
      })
      .returning({ id: orders.id })
    const oid = inserted[0]!.id
    const meal = ctx.kind === 'staff_meal'
    const rows = input.items.map((it) => {
      const m = menuById.get(it.menuItemId)!
      const rule = meal ? null : prices.get(m.id)?.rule ?? null
      return {
        orderId: oid,
        menuItemId: m.id,
        quantity: it.quantity,
        // Staff meals cost nothing and are settled at once; the menu price
        // is kept as goods value for the report.
        unitPriceCents: meal ? 0 : prices.get(m.id)?.priceCents ?? m.priceCents,
        depositCents: meal || !ev.depositEnabled ? 0 : m.depositCents,
        listPriceCents: meal ? m.priceCents : null,
        // Pfand stays as it is; a promotion only changes the price.
        priceRuleId: rule?.id ?? null,
        priceRuleName: rule?.name ?? null,
        regularPriceCents: rule ? m.priceCents : null,
        paymentStatus: meal ? 'paid' : 'unpaid',
        station: m.station,
        note: it.note,
        nameDe: m.nameDe,
        nameEn: m.nameEn,
        category: m.category,
      }
    })
    await tx.insert(orderItems).values(rows)
    if (meal) {
      await tx.insert(auditLog).values({
        action: 'staff_meal',
        staffId: ctx.createdByStaff,
        targetKind: 'order',
        targetId: oid,
        reason: ctx.staffMealReason,
        payload: {
          items: rows.map((r) => ({ menuItemId: r.menuItemId, quantity: r.quantity, listPriceCents: r.listPriceCents })),
          valueCents: rows.reduce((s, r) => s + (r.listPriceCents ?? 0) * r.quantity, 0),
        },
      })
    }
    return oid
  })
}
