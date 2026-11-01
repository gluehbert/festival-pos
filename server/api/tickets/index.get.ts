import { defineEventHandler, getQuery, setResponseHeader } from 'h3'
import { and, eq, gt, ne, sql, type SQL } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { events, orderItems, orders, paymentLocks } from '../../db/schema'
import { AppError, sendAppError } from '../../lib/errors'
import { requireRole, SERVICE_ROLES } from '../../lib/rbac'
import {
  TicketsListSchema,
  TicketsQuerySchema,
  type TicketSummary,
} from '../../lib/contracts/staff'
import { makeTableKey, makeWalkKey } from '../../lib/tickets'
import { lineTotalSql } from '../../lib/line-total'
import { loadTableChecks } from '../../lib/table-checks'
import { loadAssignments, loadUsernames } from '../../lib/table-assignments'

// One row per ticket, summed up in Postgres: the poll runs every 4 s on
// every service device, and loading each item of the evening made its
// database traffic grow with every order (Neon Free caps egress at 5 GB).
const isWalk = sql`${orders.kind} = 'walkin'`
const walkinOrderId = sql<string | null>`CASE WHEN ${isWalk} THEN ${orders.id} END`
const walkinCreator = sql<string | null>`CASE WHEN ${isWalk} THEN ${orders.createdByStaff} END`
const sumInt = (expr: SQL) => sql<number>`SUM(${expr})`.mapWith(Number)
// At a table, paid items are not the waiter's to bring: food paid at
// ordering is handed out by other helpers (and paying marks finished items
// brought). A walk-in pays first and collects at the counter.
const readyAt = (station: 'kitchen' | 'bar' | 'cafe') => sumInt(sql`CASE WHEN ${orderItems.station} = ${station}
  AND ${orderItems.productionStatus} = 'done' AND ${orderItems.servedAt} IS NULL
  AND (${isWalk} OR ${orderItems.paymentStatus} = 'unpaid') THEN ${orderItems.quantity} ELSE 0 END`)
const heldFood = sumInt(sql`CASE WHEN ${orderItems.station} = 'kitchen' AND ${orderItems.paymentStatus} = 'unpaid'
  AND ${orderItems.productionStatus} = 'pending' THEN ${orderItems.quantity} ELSE 0 END`)
const hasStation = (station: 'kitchen' | 'bar' | 'cafe') =>
  sumInt(sql`CASE WHEN ${orderItems.station} = ${station} THEN 1 ELSE 0 END`)

const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d))

// A walk-in belongs to whoever took it.
function walkinOwner(createdByStaff: string | null, usernames: Map<string, string>) {
  const username = createdByStaff ? usernames.get(createdByStaff) : undefined
  return createdByStaff && username ? { staffId: createdByStaff, username } : null
}

export default defineEventHandler(async (event) => {
  try {
    requireRole(event, SERVICE_ROLES)
    const query = TicketsQuerySchema.parse(getQuery(event))
    const db = getDb()

    const evRows = await db.select().from(events).where(eq(events.isActive, true)).limit(1)
    const ev = evRows[0]
    if (!ev) {
      throw new AppError('NOT_FOUND', 404, 'No active event')
    }

    const rows = await db
      .select({
        walkinOrderId,
        walkinCreator,
        tableNo: orders.tableNo,
        totalCents: sumInt(lineTotalSql),
        unpaidCents: sumInt(sql`CASE WHEN ${orderItems.paymentStatus} = 'unpaid' THEN ${lineTotalSql} ELSE 0 END`),
        oldestItemAt: sql<Date | string>`MIN(${orderItems.createdAt})`,
        lastOrderAt: sql<Date | string>`MAX(${orderItems.createdAt})`,
        hasKitchen: hasStation('kitchen'),
        hasBar: hasStation('bar'),
        hasCafe: hasStation('cafe'),
        readyKitchen: readyAt('kitchen'),
        readyBar: readyAt('bar'),
        readyCafe: readyAt('cafe'),
        heldFood,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(
        eq(orders.eventId, ev.id),
        ne(orderItems.productionStatus, 'cancelled'),
        // Staff meals are settled when booked; they never form a ticket.
        ne(orders.kind, 'staff_meal'),
      ))
      .groupBy(walkinOrderId, walkinCreator, orders.tableNo)

    // Active locks
    const locks = await db
      .select({
        tableNo: paymentLocks.tableNo,
        orderId: paymentLocks.orderId,
        staffId: paymentLocks.staffId,
      })
      .from(paymentLocks)
      .where(and(eq(paymentLocks.eventId, ev.id), gt(paymentLocks.expiresAt, new Date())))
    const lockByKey = new Map<string, string>()
    for (const l of locks) {
      const key = l.orderId ? makeWalkKey(l.orderId) : makeTableKey(l.tableNo)
      lockByKey.set(key, l.staffId)
    }

    const checks = await loadTableChecks(db, ev.id)
    // Responsibility rides along with this poll instead of a second one.
    const assignments = await loadAssignments(db, ev.id)
    const byTable = new Map(assignments.map((a) => [a.tableNo, { staffId: a.staffId, username: a.username }]))
    const creators = new Set<string>()
    for (const r of rows) if (r.walkinCreator) creators.add(r.walkinCreator)
    const usernames = await loadUsernames(db, [...creators])

    const tickets: TicketSummary[] = []
    for (const r of rows) {
      const ticketKey = r.walkinOrderId ? makeWalkKey(r.walkinOrderId) : makeTableKey(r.tableNo)
      const status: 'open' | 'paid' = r.unpaidCents > 0 ? 'open' : 'paid'
      const ready = { kitchen: r.readyKitchen, bar: r.readyBar, cafe: r.readyCafe }
      // Paid but food/drinks still to bring (e.g. walk-in paid at once): keep it listed.
      const needsService = ready.kitchen + ready.bar + ready.cafe > 0
      if (query.status === 'open' && status !== 'open' && !needsService) continue
      if (query.status === 'paid' && status !== 'paid') continue
      if (query.station === 'kitchen' && !r.hasKitchen) continue
      if (query.station === 'bar' && !r.hasBar) continue
      if (query.station === 'cafe' && !r.hasCafe) continue
      tickets.push({
        ticketKey,
        tableNo: r.tableNo,
        status,
        totalCents: r.totalCents,
        unpaidCents: r.unpaidCents,
        oldestItemAt: toDate(r.oldestItemAt).toISOString(),
        lockedBy: lockByKey.get(ticketKey) ?? null,
        ready,
        foodToPay: ev.foodPrepayEnabled ? r.heldFood : 0,
        lastOrderAt: toDate(r.lastOrderAt).toISOString(),
        lastCheckAt: r.walkinOrderId ? null : checks.get(r.tableNo)?.toISOString() ?? null,
        assignee: r.walkinOrderId ? walkinOwner(r.walkinCreator, usernames) : byTable.get(r.tableNo) ?? null,
      })
    }

    tickets.sort((a, b) => a.oldestItemAt.localeCompare(b.oldestItemAt))

    // Staff-only data: must never be stored by the Vercel edge cache.
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return TicketsListSchema.parse({
      tickets,
      assignments,
      tableRange: { from: ev.tableRangeFrom, to: ev.tableRangeTo },
      serverNow: new Date().toISOString(),
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
