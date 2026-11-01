import { and, count, eq, gte, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { orderItems, orders } from '../db/schema'
import type { Tx } from './audit'
import { AppError } from './errors'
import { lineTotalCents, lineTotalSql } from './line-total'
import { GUEST_MAX_ITEMS_PER_ORDER, type CreateOrder } from './contracts/guest'

// Guest limits against a photographed QR code or a script: a table may send
// a few orders per window, each of a size a real table orders at once
// (GUEST_MAX_ITEMS_PER_ORDER). Waiters are not limited.
const GUEST_ORDER_WINDOW_MS = 10 * 60 * 1000
const GUEST_MAX_ORDERS_PER_TABLE = 15

export async function assertGuestOrderAllowed(
  db: Db,
  eventId: string,
  tableNo: number,
  input: CreateOrder,
): Promise<void> {
  const itemCount = input.items.reduce((sum, i) => sum + i.quantity, 0)
  if (itemCount > GUEST_MAX_ITEMS_PER_ORDER) {
    throw new AppError('ORDER_TOO_LARGE', 400, `At most ${GUEST_MAX_ITEMS_PER_ORDER} items per order`)
  }
  const since = new Date(Date.now() - GUEST_ORDER_WINDOW_MS)
  const [row] = await db
    .select({ n: count() })
    .from(orders)
    .where(and(
      eq(orders.eventId, eventId),
      eq(orders.tableNo, tableNo),
      eq(orders.kind, 'guest'),
      gte(orders.createdAt, since),
    ))
  if (Number(row?.n ?? 0) >= GUEST_MAX_ORDERS_PER_TABLE) {
    throw new AppError('RATE_LIMITED', 429, 'Too many orders from this table, please ask the staff', {
      retryAfterSeconds: GUEST_ORDER_WINDOW_MS / 1000,
    })
  }
}

type Station = 'bar' | 'kitchen'
export interface OpenLimits {
  guestOpenLimitBarCents: number | null
  guestOpenLimitKitchenCents: number | null
}

// Paying happens when the order is brought, so a phone has little open at a
// time. A cap per kind (drinks incl. the cafe counter, food) stops someone walking past a table
// from loading it with orders. Runs inside the order transaction, with the
// booked prices of the new lines.
export async function assertGuestOpenLimit(
  tx: Tx,
  limits: OpenLimits,
  guestSessionId: string,
  lines: Array<{ station: string; unitPriceCents: number; depositCents: number; quantity: number }>,
): Promise<void> {
  const caps: Record<Station, number | null> = { bar: limits.guestOpenLimitBarCents, kitchen: limits.guestOpenLimitKitchenCents }
  const lineBucket = (l: { station: string }): Station => (l.station === 'kitchen' ? 'kitchen' : 'bar')
  const stations = (['bar', 'kitchen'] as const).filter((st) => caps[st] !== null && lines.some((l) => lineBucket(l) === st))
  if (stations.length === 0) return
  const rows = await tx
    .select({ station: orderItems.station, sum: sql<string | number | null>`COALESCE(SUM(${lineTotalSql}), 0)` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(
      eq(orders.guestSessionId, guestSessionId),
      eq(orderItems.paymentStatus, 'unpaid'),
      ne(orderItems.productionStatus, 'cancelled'),
    ))
    .groupBy(orderItems.station)
  for (const station of stations) {
    const open = rows.filter((r) => lineBucket(r) === station).reduce((s, r) => s + Number(r.sum ?? 0), 0)
    const added = lines.filter((l) => lineBucket(l) === station).reduce((s, l) => s + lineTotalCents(l), 0)
    if (open + added > caps[station]!) {
      throw new AppError('OPEN_LIMIT', 409, `At most ${caps[station]} cents of ${station} items may be unpaid per phone`, {
        station,
        limitCents: caps[station],
      })
    }
  }
}
