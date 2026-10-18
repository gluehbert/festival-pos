import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { orderItems, orders } from '../db/schema'
import { guestScans } from '../db/schema-service'
import type { AppUsageRow } from './contracts/reports'

// App usage per table: who signed in, who ordered on their own phone and
// what the waiters took at the same table. Rehearsal orders never count.
export async function loadAppUsage(db: Db, eventId: string): Promise<AppUsageRow[]> {
  const tableOrders = and(
    eq(orders.eventId, eventId),
    eq(orders.isTrial, false),
    inArray(orders.kind, ['guest', 'staff_table']),
  )
  const scans = await db
    .select({ tableNo: guestScans.tableNo, count: guestScans.count })
    .from(guestScans)
    .where(eq(guestScans.eventId, eventId))
  const orderRows = await db
    .select({
      tableNo: orders.tableNo,
      kind: orders.kind,
      orderCount: sql<number>`COUNT(*)`,
      devices: sql<number>`COUNT(DISTINCT ${orders.guestSessionId})`,
    })
    .from(orders)
    .where(tableOrders)
    .groupBy(orders.tableNo, orders.kind)
  const itemRows = await db
    .select({
      tableNo: orders.tableNo,
      kind: orders.kind,
      quantity: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(tableOrders, ne(orderItems.productionStatus, 'cancelled')))
    .groupBy(orders.tableNo, orders.kind)

  const rows = new Map<number, AppUsageRow>()
  const row = (tableNo: number) => {
    let r = rows.get(tableNo)
    if (!r) {
      r = { tableNo, scans: 0, orderingDevices: 0, guestOrders: 0, staffOrders: 0, guestItems: 0, staffItems: 0 }
      rows.set(tableNo, r)
    }
    return r
  }
  for (const s of scans) row(s.tableNo).scans = s.count
  for (const o of orderRows) {
    const r = row(o.tableNo)
    if (o.kind === 'guest') {
      r.guestOrders = Number(o.orderCount)
      r.orderingDevices = Number(o.devices)
    }
    else r.staffOrders = Number(o.orderCount)
  }
  for (const i of itemRows) {
    const r = row(i.tableNo)
    if (i.kind === 'guest') r.guestItems = Number(i.quantity)
    else r.staffItems = Number(i.quantity)
  }
  return Array.from(rows.values()).sort((a, b) => a.tableNo - b.tableNo)
}
