import { defineEventHandler, getQuery, setResponseHeader } from 'h3'
import { and, eq, gt, ne } from 'drizzle-orm'
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
import { lineTotalCents } from '../../lib/line-total'
import { loadTableChecks } from '../../lib/table-checks'
import { loadAssignments, loadUsernames } from '../../lib/table-assignments'

interface ItemRow {
  orderId: string
  tableNo: number
  kind: string
  createdByStaff: string | null
  itemId: string
  quantity: number
  unitPriceCents: number
  depositCents: number
  station: 'kitchen' | 'bar'
  productionStatus: 'pending' | 'in_progress' | 'done' | 'cancelled'
  paymentStatus: 'unpaid' | 'paid'
  servedAt: Date | null
  createdAt: Date
}

interface TicketAccumulator {
  ticketKey: string
  tableNo: number
  createdByStaff: string | null
  totalCents: number
  unpaidCents: number
  oldestItemAt: Date
  lastOrderAt: Date
  stations: Set<string>
  ready: { kitchen: number; bar: number }
}

// A walk-in belongs to whoever took it.
function walkinOwner(acc: TicketAccumulator, usernames: Map<string, string>) {
  const username = acc.createdByStaff ? usernames.get(acc.createdByStaff) : undefined
  return acc.createdByStaff && username ? { staffId: acc.createdByStaff, username } : null
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
        orderId: orders.id,
        tableNo: orders.tableNo,
        kind: orders.kind,
        createdByStaff: orders.createdByStaff,
        itemId: orderItems.id,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        depositCents: orderItems.depositCents,
        station: orderItems.station,
        productionStatus: orderItems.productionStatus,
        paymentStatus: orderItems.paymentStatus,
        servedAt: orderItems.servedAt,
        createdAt: orderItems.createdAt,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(
        eq(orders.eventId, ev.id),
        ne(orderItems.productionStatus, 'cancelled'),
        // Staff meals are settled when booked; they never form a ticket.
        ne(orders.kind, 'staff_meal'),
      ))

    const buckets = new Map<string, TicketAccumulator>()
    for (const r of rows as unknown as ItemRow[]) {
      const isWalk = r.kind === 'walkin'
      const key = isWalk ? makeWalkKey(r.orderId) : makeTableKey(r.tableNo)
      const lineCents = lineTotalCents(r)
      let acc = buckets.get(key)
      if (!acc) {
        acc = {
          ticketKey: key,
          tableNo: r.tableNo,
          createdByStaff: isWalk ? r.createdByStaff : null,
          totalCents: 0,
          unpaidCents: 0,
          oldestItemAt: r.createdAt,
          lastOrderAt: r.createdAt,
          stations: new Set(),
          ready: { kitchen: 0, bar: 0 },
        }
        buckets.set(key, acc)
      }
      acc.totalCents += lineCents
      if (r.paymentStatus === 'unpaid') acc.unpaidCents += lineCents
      const created = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)
      if (created < acc.oldestItemAt) acc.oldestItemAt = created
      if (created > acc.lastOrderAt) acc.lastOrderAt = created
      acc.stations.add(r.station)
      // At a table, paid items are not the waiter's to bring: food paid at
      // ordering is handed out by other helpers (and paying marks finished
      // items brought). A walk-in pays first and collects at the counter.
      if (r.productionStatus === 'done' && !r.servedAt && (isWalk || r.paymentStatus === 'unpaid')) acc.ready[r.station] += r.quantity
    }

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
    for (const acc of buckets.values()) if (acc.createdByStaff) creators.add(acc.createdByStaff)
    const usernames = await loadUsernames(db, [...creators])

    const tickets: TicketSummary[] = []
    for (const acc of buckets.values()) {
      const status: 'open' | 'paid' = acc.unpaidCents > 0 ? 'open' : 'paid'
      // Paid but food/drinks still to bring (e.g. walk-in paid at once): keep it listed.
      const needsService = acc.ready.kitchen + acc.ready.bar > 0
      if (query.status === 'open' && status !== 'open' && !needsService) continue
      if (query.status === 'paid' && status !== 'paid') continue
      if (query.station && !acc.stations.has(query.station)) continue
      tickets.push({
        ticketKey: acc.ticketKey,
        tableNo: acc.tableNo,
        status,
        totalCents: acc.totalCents,
        unpaidCents: acc.unpaidCents,
        oldestItemAt: acc.oldestItemAt.toISOString(),
        lockedBy: lockByKey.get(acc.ticketKey) ?? null,
        ready: acc.ready,
        lastOrderAt: acc.lastOrderAt.toISOString(),
        lastCheckAt: acc.ticketKey.startsWith('w-') ? null : checks.get(acc.tableNo)?.toISOString() ?? null,
        assignee: walkinOwner(acc, usernames) ?? (acc.ticketKey.startsWith('w-') ? null : byTable.get(acc.tableNo) ?? null),
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
