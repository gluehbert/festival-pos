import { defineEventHandler, getRouterParam } from 'h3'
import { and, asc, eq, gt } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { events, menuItems, orderItems, orders, paymentLocks } from '../../db/schema'
import { AppError, sendAppError } from '../../lib/errors'
import { requireRole, SERVICE_ROLES } from '../../lib/rbac'
import {
  TicketDetailSchema,
  type TicketDetailItem,
} from '../../lib/contracts/staff'
import { parseTicketKey } from '../../lib/tickets'
import { lineTotalCents } from '../../lib/line-total'
import { loadTableCheck } from '../../lib/table-checks'
import { loadAssignee, loadUsernames } from '../../lib/table-assignments'

// A walk-in belongs to whoever took it.
async function walkinOwner(db: ReturnType<typeof getDb>, staffId: string | null) {
  if (!staffId) return null
  const username = (await loadUsernames(db, [staffId])).get(staffId)
  return username ? { staffId, username } : null
}

export default defineEventHandler(async (event) => {
  try {
    requireRole(event, SERVICE_ROLES)
    const id = getRouterParam(event, 'id') ?? ''
    const parsed = parseTicketKey(id)
    if (!parsed) {
      throw new AppError('VALIDATION', 400, `Invalid ticket key '${id}'`)
    }
    const db = getDb()

    const evRows = await db.select().from(events).where(eq(events.isActive, true)).limit(1)
    const ev = evRows[0]
    if (!ev) {
      throw new AppError('NOT_FOUND', 404, 'No active event')
    }

    const baseWhere = parsed.kind === 'walkin'
      ? and(eq(orders.eventId, ev.id), eq(orders.id, parsed.orderId!))
      : and(eq(orders.eventId, ev.id), eq(orders.tableNo, parsed.tableNo!))

    const rows = await db
      .select({
        orderItemId: orderItems.id,
        orderId: orders.id,
        menuItemId: menuItems.id,
        nameDe: menuItems.nameDe,
        nameEn: menuItems.nameEn,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        depositCents: orderItems.depositCents,
        note: orderItems.note,
        station: orderItems.station,
        productionStatus: orderItems.productionStatus,
        paymentStatus: orderItems.paymentStatus,
        servedAt: orderItems.servedAt,
        createdAt: orderItems.createdAt,
        kind: orders.kind,
        createdByStaff: orders.createdByStaff,
        guestSessionId: orders.guestSessionId,
        tableNo: orders.tableNo,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
      .where(baseWhere)
      .orderBy(asc(orderItems.createdAt))

    // A walk-in can carry the same table number; it is not part of the table ticket.
    const filtered = rows.filter((r) => {
      if (parsed.kind === 'walkin') return r.kind === 'walkin'
      return r.kind !== 'walkin' && r.kind !== 'staff_meal'
    })

    if (filtered.length === 0) {
      throw new AppError('NOT_FOUND', 404, `Ticket '${id}' not found`)
    }

    let totalCents = 0
    let unpaidCents = 0
    let tableNo = parsed.kind === 'walkin' ? filtered[0]!.tableNo : parsed.tableNo!
    const items: TicketDetailItem[] = []
    // Rows come oldest first, so a phone keeps its number as more phones order.
    const devices = new Map<string, number>()
    let lastOrderAt: Date | null = null
    for (const r of filtered) {
      const lineCents = lineTotalCents(r)
      if (r.productionStatus !== 'cancelled') {
        totalCents += lineCents
        if (r.paymentStatus === 'unpaid') unpaidCents += lineCents
      }
      if (r.guestSessionId && !devices.has(r.guestSessionId)) devices.set(r.guestSessionId, devices.size + 1)
      const createdAt = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt as unknown as string)
      if (r.productionStatus !== 'cancelled' && (!lastOrderAt || createdAt > lastOrderAt)) lastOrderAt = createdAt
      items.push({
        orderItemId: r.orderItemId,
        orderId: r.orderId,
        menuItemId: r.menuItemId,
        nameDe: r.nameDe,
        nameEn: r.nameEn,
        quantity: r.quantity,
        unitPriceCents: r.unitPriceCents,
        depositCents: r.depositCents,
        note: r.note,
        station: r.station as 'kitchen' | 'bar',
        productionStatus: r.productionStatus as 'pending' | 'in_progress' | 'done' | 'cancelled',
        paymentStatus: r.paymentStatus as 'unpaid' | 'paid',
        served: r.servedAt !== null,
        createdAt: createdAt.toISOString(),
        device: r.guestSessionId ? devices.get(r.guestSessionId)! : null,
      })
      tableNo = r.tableNo
    }

    const status: 'open' | 'paid' = unpaidCents > 0 ? 'open' : 'paid'

    // active lock
    const locks = await db
      .select({
        staffId: paymentLocks.staffId,
        expiresAt: paymentLocks.expiresAt,
        orderId: paymentLocks.orderId,
        tableNo: paymentLocks.tableNo,
      })
      .from(paymentLocks)
      .where(and(eq(paymentLocks.eventId, ev.id), gt(paymentLocks.expiresAt, new Date())))
    const match = locks.find((l) =>
      parsed.kind === 'walkin'
        ? l.orderId === parsed.orderId
        : l.tableNo === parsed.tableNo && l.orderId === null,
    )
    const lockedBy = match?.staffId ?? null
    const lockExpiresAt = match
      ? (match.expiresAt instanceof Date ? match.expiresAt : new Date(match.expiresAt as unknown as string)).toISOString()
      : null

    const lastCheckAt = parsed.kind === 'walkin' ? null : await loadTableCheck(db, ev.id, parsed.tableNo!)
    const assignee = parsed.kind === 'walkin' ? await walkinOwner(db, filtered[0]!.createdByStaff) : await loadAssignee(db, ev.id, parsed.tableNo!)

    return TicketDetailSchema.parse({
      ticketKey: id,
      tableNo,
      status,
      totalCents,
      unpaidCents,
      items,
      lockedBy,
      lockExpiresAt,
      // Everything voided: the last order is still when it came in.
      lastOrderAt: (lastOrderAt ?? new Date(items[items.length - 1]!.createdAt)).toISOString(),
      lastCheckAt: lastCheckAt?.toISOString() ?? null,
      assignee,
      serverNow: new Date().toISOString(),
    })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
