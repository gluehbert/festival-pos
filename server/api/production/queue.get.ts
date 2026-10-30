import { defineEventHandler, getQuery } from 'h3'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { events, menuItems, orderItems, orders } from '../../db/schema'
import { AppError, sendAppError } from '../../lib/errors'
import { requireRole } from '../../lib/rbac'
import { activeLanes, fillLanes } from '../../lib/production-lanes'
import {
  ProductionQueueQuerySchema,
  ProductionQueueSchema,
  type ProductionQueueItem,
  type Station,
} from '../../lib/contracts/production'

export default defineEventHandler(async (event) => {
  try {
    const staff = requireRole(event, ['kitchen', 'bar', 'admin'])
    const query = ProductionQueueQuerySchema.parse(getQuery(event))

    let station: Station
    if (staff.role === 'kitchen' || staff.role === 'bar') {
      station = staff.role
    }
    else {
      if (!query.station) {
        throw new AppError('VALIDATION', 400, 'station query parameter required for admin')
      }
      station = query.station
    }

    const db = getDb()
    const evRows = await db.select().from(events).where(eq(events.isActive, true)).limit(1)
    const ev = evRows[0]
    if (!ev) {
      throw new AppError('NOT_FOUND', 404, 'No active event')
    }

    const rows = await db
      .select({
        orderItemId: orderItems.id,
        orderId: orders.id,
        tableNo: orders.tableNo,
        orderKind: orders.kind,
        nameDe: menuItems.nameDe,
        nameEn: menuItems.nameEn,
        quantity: orderItems.quantity,
        note: orderItems.note,
        productionStatus: orderItems.productionStatus,
        orderedAt: orders.createdAt,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
      .where(
        and(
          eq(orders.eventId, ev.id),
          eq(orderItems.station, station),
          inArray(orderItems.productionStatus, ['pending', 'in_progress']),
        ),
      )
      // Within an order in menu order, so lines never swap places between polls.
      .orderBy(asc(orders.createdAt), asc(orders.id), asc(menuItems.sortOrder), asc(orderItems.id))

    const items: ProductionQueueItem[] = rows.map((r) => {
      const orderedAt = r.orderedAt instanceof Date
        ? r.orderedAt
        : new Date(r.orderedAt as unknown as string)
      return {
        orderItemId: r.orderItemId,
        orderId: r.orderId,
        tableNo: r.tableNo,
        orderKind: r.orderKind as ProductionQueueItem['orderKind'],
        nameDe: r.nameDe,
        nameEn: r.nameEn,
        quantity: r.quantity,
        note: r.note,
        productionStatus: r.productionStatus as 'pending' | 'in_progress',
        orderedAt: orderedAt.toISOString(),
      }
    })

    const lanes = await fillLanes(db, ev.id, station, activeLanes(ev), items)
    return ProductionQueueSchema.parse({ station, items, lanes })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
