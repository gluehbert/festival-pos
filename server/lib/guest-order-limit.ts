import { and, count, eq, gte } from 'drizzle-orm'
import type { Db } from '../db/client'
import { orders } from '../db/schema'
import { AppError } from './errors'
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
