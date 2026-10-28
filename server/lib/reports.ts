import { and, eq, gt, isNotNull, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  menuItems,
  orderItems,
  orders,
  paymentItems,
  payments,
  staff,
} from '../db/schema'
import { refunds } from '../db/schema-cash'
import type {
  OrdersPerHourRow,
  PaymentsByStaffRow,
  RevenueByCategoryRow,
  TopItemRow,
  VoidRow,
} from './contracts/reports'

// Orders and payments recorded in rehearsal mode (is_trial) never count.
// Staff meals are not revenue (see reports-extra.ts).
//
// Revenue (by category, top items) counts what was actually paid, net of
// refunds (a refund cancels the item) and without Pfand, so it adds up with
// the payments per staff minus the Pfand collected. Name and category come
// from the order row (snapshot at order time); rows from before that column
// existed fall back to the current menu entry.

// Festivals run in Germany; hours are bucketed in local time (DST-aware).
export const REPORT_TIME_ZONE = 'Europe/Berlin'

export const itemNameDe = sql<string>`COALESCE(${orderItems.nameDe}, ${menuItems.nameDe})`
export const itemNameEn = sql<string>`COALESCE(${orderItems.nameEn}, ${menuItems.nameEn})`
const itemCategory = sql<string>`COALESCE(${orderItems.category}, ${menuItems.category})`

// Paid, not refunded/voided, real (no trial payment), no staff meal.
export function paidRevenueWhere(eventId: string) {
  return and(
    eq(orders.eventId, eventId),
    eq(payments.isTrial, false),
    ne(orders.kind, 'staff_meal'),
    eq(orderItems.paymentStatus, 'paid'),
    ne(orderItems.productionStatus, 'cancelled'),
  )
}

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString()
}

export async function loadRevenueByCategory(
  db: Db,
  eventId: string,
): Promise<RevenueByCategoryRow[]> {
  const rows = await db
    .select({
      category: itemCategory,
      total: sql<number>`COALESCE(SUM(${orderItems.unitPriceCents} * ${orderItems.quantity}), 0)`,
      itemCount: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .innerJoin(paymentItems, eq(paymentItems.orderItemId, orderItems.id))
    .innerJoin(payments, eq(payments.id, paymentItems.paymentId))
    .where(paidRevenueWhere(eventId))
    .groupBy(itemCategory)
  return rows
    .map((r) => ({
      category: r.category,
      totalCents: Number(r.total ?? 0),
      itemCount: Number(r.itemCount ?? 0),
    }))
    .sort((a, b) => b.totalCents - a.totalCents)
}

export async function loadTopItems(
  db: Db,
  eventId: string,
): Promise<TopItemRow[]> {
  const rows = await db
    .select({
      menuItemId: menuItems.id,
      nameDe: itemNameDe,
      nameEn: itemNameEn,
      quantity: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
      total: sql<number>`COALESCE(SUM(${orderItems.unitPriceCents} * ${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .innerJoin(paymentItems, eq(paymentItems.orderItemId, orderItems.id))
    .innerJoin(payments, eq(payments.id, paymentItems.paymentId))
    .where(paidRevenueWhere(eventId))
    // A renamed article shows as its own line: what was sold under which name.
    .groupBy(menuItems.id, itemNameDe, itemNameEn)
  return rows
    .map((r) => ({
      menuItemId: r.menuItemId,
      nameDe: r.nameDe,
      nameEn: r.nameEn,
      quantity: Number(r.quantity ?? 0),
      totalCents: Number(r.total ?? 0),
    }))
    .sort((a, b) => b.quantity - a.quantity || b.totalCents - a.totalCents)
    .slice(0, 10)
}

export async function loadVoids(db: Db, eventId: string): Promise<VoidRow[]> {
  const rows = await db
    .select({
      orderItemId: orderItems.id,
      nameDe: itemNameDe,
      nameEn: itemNameEn,
      tableNo: orders.tableNo,
      reason: orderItems.voidReason,
      voidedAt: orderItems.voidedAt,
      voidedByStaffId: orderItems.voidedByStaff,
      refundedCents: refunds.amountCents,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .leftJoin(refunds, eq(refunds.orderItemId, orderItems.id))
    .where(
      and(
        eq(orders.eventId, eventId),
        eq(orders.isTrial, false),
        eq(orderItems.productionStatus, 'cancelled'),
        isNotNull(orderItems.voidedAt),
      ),
    )
  return rows
    .map((r) => ({
      orderItemId: r.orderItemId,
      nameDe: r.nameDe,
      nameEn: r.nameEn,
      tableNo: r.tableNo,
      reason: r.reason ?? '',
      voidedAt: toIso(r.voidedAt!),
      voidedByStaffId: r.voidedByStaffId,
      refundedCents: Number(r.refundedCents ?? 0),
    }))
    .sort((a, b) => b.voidedAt.localeCompare(a.voidedAt))
}

export async function loadPaymentsByStaff(
  db: Db,
  eventId: string,
): Promise<PaymentsByStaffRow[]> {
  const rows = await db
    .select({
      staffId: staff.id,
      username: staff.username,
      paymentCount: sql<number>`COUNT(${payments.id})`,
      total: sql<number>`COALESCE(SUM(${payments.totalCents}), 0)`,
      tips: sql<number>`COALESCE(SUM(${payments.tipCents}), 0)`,
    })
    .from(payments)
    .innerJoin(staff, eq(staff.id, payments.staffId))
    // 0-€ settlements (only free items) are no cash payments.
    .where(and(eq(payments.eventId, eventId), eq(payments.isTrial, false), gt(payments.totalCents, 0)))
    .groupBy(staff.id, staff.username)
  // Refunds are paid out of the drawer of the person who hands the cash back
  // (shift lead or admin), who may not have collected anything themselves.
  const refundRows = await db
    .select({ staffId: refunds.staffId, username: staff.username, refunded: sql<number>`COALESCE(SUM(${refunds.amountCents}), 0)` })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .innerJoin(staff, eq(staff.id, refunds.staffId))
    .where(and(eq(refunds.eventId, eventId), eq(payments.isTrial, false)))
    .groupBy(refunds.staffId, staff.username)
  const refundedBy = new Map(refundRows.map((r) => [r.staffId, Number(r.refunded ?? 0)]))
  const perStaff = rows.map((r) => ({
    staffId: r.staffId,
    username: r.username,
    paymentCount: Number(r.paymentCount ?? 0),
    total: Number(r.total ?? 0),
    tipCents: Number(r.tips ?? 0),
  }))
  for (const r of refundRows) {
    if (!perStaff.some((p) => p.staffId === r.staffId)) {
      perStaff.push({ staffId: r.staffId, username: r.username, paymentCount: 0, total: 0, tipCents: 0 })
    }
  }
  return perStaff
    .map(({ total, ...r }) => {
      const refundedCents = refundedBy.get(r.staffId) ?? 0
      return { ...r, totalCents: total - refundedCents, refundedCents }
    })
    .sort((a, b) => b.totalCents - a.totalCents)
}

// Bucketed in SQL by the local (Berlin) hour; `hour` is that wall-clock
// hour without offset, e.g. "2026-07-04T18:00".
const localHour = sql<string>`to_char(timezone(${sql.raw(`'${REPORT_TIME_ZONE}'`)}, ${orders.createdAt}), 'YYYY-MM-DD"T"HH24:00')`

export async function loadOrdersPerHour(
  db: Db,
  eventId: string,
): Promise<OrdersPerHourRow[]> {
  const rows = await db
    .select({
      hour: localHour,
      orderCount: sql<number>`COUNT(*)`,
      guestOrderCount: sql<number>`SUM(CASE WHEN ${orders.kind} = 'guest' THEN 1 ELSE 0 END)`,
    })
    .from(orders)
    .where(and(eq(orders.eventId, eventId), eq(orders.isTrial, false), ne(orders.kind, 'staff_meal')))
    .groupBy(localHour)
  return rows
    .map((r) => ({ hour: String(r.hour), orderCount: Number(r.orderCount), guestOrderCount: Number(r.guestOrderCount ?? 0) }))
    .sort((a, b) => a.hour.localeCompare(b.hour))
}
