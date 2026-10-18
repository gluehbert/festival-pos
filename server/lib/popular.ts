import { and, desc, eq, ne, sql, type SQL } from 'drizzle-orm'
import type { getDb } from '../db/client'
import { menuItems, orderItems, orders } from '../db/schema'
import type { PopularItems } from './contracts/guest'

type Db = ReturnType<typeof getDb>

export const POPULAR_TABLE_LIMIT = 8
export const POPULAR_EVENT_LIMIT = 8

// Available menu items ranked by how often they were ordered (cancelled items
// do not count); ties go to the most recently ordered.
async function ranked(db: Db, where: SQL | undefined, limit: number): Promise<string[]> {
  const qty = sql<number>`SUM(${orderItems.quantity})`
  const rows = await db
    .select({ id: orderItems.menuItemId, qty, last: sql<string>`MAX(${orders.createdAt})` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .where(and(ne(orderItems.productionStatus, 'cancelled'), eq(menuItems.isAvailable, true), where))
    .groupBy(orderItems.menuItemId)
    .orderBy(desc(qty), desc(sql`MAX(${orders.createdAt})`))
    .limit(limit)
  return rows.map((r) => r.id)
}

// What this table usually orders (walk-in sales at the counter are not a
// table's), then the event's best sellers that are not already in that list.
export async function popularItems(db: Db, eventId: string, tableNo: number | null): Promise<PopularItems> {
  const table = tableNo === null
    ? []
    : await ranked(db, and(eq(orders.eventId, eventId), eq(orders.tableNo, tableNo), ne(orders.kind, 'walkin')), POPULAR_TABLE_LIMIT)
  const top = await ranked(db, eq(orders.eventId, eventId), POPULAR_EVENT_LIMIT + table.length)
  const seen = new Set(table)
  return { tableNo, table, event: top.filter((id) => !seen.has(id)).slice(0, POPULAR_EVENT_LIMIT) }
}
