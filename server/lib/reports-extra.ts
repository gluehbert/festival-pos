import { and, eq, gt, isNotNull, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { menuItems, orderItems, orders, paymentItems, payments, staff } from '../db/schema'
import { depositReturns } from '../db/schema-cash'
import type { DepositReportRow } from './contracts/deposit'
import type { StaffMealReportRow, TipRow } from './contracts/reports'
import type { PriceRuleReportRow } from './contracts/pricing'
import { itemNameDe, itemNameEn, paidRevenueWhere } from './reports'

// Reports that are not revenue: Pfand and staff meals. Test-mode bookings
// never count.

// Tips per waiter, biggest first, then one total row (staffId null).
export async function loadTips(db: Db, eventId: string): Promise<TipRow[]> {
  const rows = await db
    .select({
      staffId: staff.id,
      username: staff.username,
      paymentCount: sql<number>`COUNT(${payments.id})`,
      tips: sql<number>`COALESCE(SUM(${payments.tipCents}), 0)`,
    })
    .from(payments)
    .innerJoin(staff, eq(staff.id, payments.staffId))
    .where(and(eq(payments.eventId, eventId), eq(payments.isTrial, false), gt(payments.tipCents, 0)))
    .groupBy(staff.id, staff.username)
  const perStaff: TipRow[] = rows
    .map((r) => ({ staffId: r.staffId, username: r.username, paymentCount: Number(r.paymentCount), tipCents: Number(r.tips) }))
    .sort((a, b) => b.tipCents - a.tipCents)
  if (perStaff.length === 0) return []
  const total = perStaff.reduce((t, r) => ({ ...t, paymentCount: t.paymentCount + r.paymentCount, tipCents: t.tipCents + r.tipCents }), { staffId: null, username: null, paymentCount: 0, tipCents: 0 })
  return [...perStaff, total]
}

// Pfand per deposit value: collected with paid items, handed back, balance.
export async function loadDeposits(db: Db, eventId: string): Promise<DepositReportRow[]> {
  const issued = await db
    .select({
      unitCents: orderItems.depositCents,
      quantity: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(
      eq(orders.eventId, eventId),
      eq(orders.isTrial, false),
      eq(orderItems.paymentStatus, 'paid'),
      ne(orderItems.productionStatus, 'cancelled'),
      gt(orderItems.depositCents, 0),
    ))
    .groupBy(orderItems.depositCents)
  const returned = await db
    .select({
      unitCents: depositReturns.unitCents,
      quantity: sql<number>`COALESCE(SUM(${depositReturns.quantity}), 0)`,
      amount: sql<number>`COALESCE(SUM(${depositReturns.amountCents}), 0)`,
    })
    .from(depositReturns)
    .where(and(eq(depositReturns.eventId, eventId), eq(depositReturns.isTrial, false)))
    .groupBy(depositReturns.unitCents)

  const rows = new Map<number, DepositReportRow>()
  const row = (unitCents: number) => {
    let r = rows.get(unitCents)
    if (!r) {
      r = { unitCents, issuedQuantity: 0, issuedCents: 0, returnedQuantity: 0, returnedCents: 0, balanceCents: 0 }
      rows.set(unitCents, r)
    }
    return r
  }
  for (const i of issued) {
    const r = row(Number(i.unitCents))
    r.issuedQuantity = Number(i.quantity)
    r.issuedCents = r.unitCents * r.issuedQuantity
  }
  for (const d of returned) {
    const r = row(Number(d.unitCents))
    r.returnedQuantity = Number(d.quantity)
    r.returnedCents = Number(d.amount)
  }
  for (const r of rows.values()) r.balanceCents = r.issuedCents + r.returnedCents
  return Array.from(rows.values()).sort((a, b) => a.unitCents - b.unitCents)
}

// Helferverpflegung per article: units and goods value at menu price.
export async function loadStaffMeals(db: Db, eventId: string): Promise<StaffMealReportRow[]> {
  const rows = await db
    .select({
      menuItemId: menuItems.id,
      nameDe: itemNameDe,
      nameEn: itemNameEn,
      quantity: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
      value: sql<number>`COALESCE(SUM(${orderItems.listPriceCents} * ${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .where(and(
      eq(orders.eventId, eventId),
      eq(orders.isTrial, false),
      eq(orders.kind, 'staff_meal'),
      ne(orderItems.productionStatus, 'cancelled'),
    ))
    .groupBy(menuItems.id, itemNameDe, itemNameEn)
  return rows
    .map((r) => ({
      menuItemId: r.menuItemId,
      nameDe: r.nameDe,
      nameEn: r.nameEn,
      quantity: Number(r.quantity),
      valueCents: Number(r.value),
    }))
    .sort((a, b) => b.valueCents - a.valueCents)
}

// Sold under a price rule (Happy Hour & Co.), per rule and article: units,
// revenue at the promotion price and the discount given; paid items only. Uses the rule name
// stored on the order line, so renamed or deleted rules still show up.
export async function loadPriceRuleSales(db: Db, eventId: string): Promise<PriceRuleReportRow[]> {
  const rows = await db
    .select({
      ruleId: orderItems.priceRuleId,
      ruleName: orderItems.priceRuleName,
      menuItemId: menuItems.id,
      nameDe: itemNameDe,
      nameEn: itemNameEn,
      quantity: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
      total: sql<number>`COALESCE(SUM(${orderItems.unitPriceCents} * ${orderItems.quantity}), 0)`,
      discount: sql<number>`COALESCE(SUM((${orderItems.regularPriceCents} - ${orderItems.unitPriceCents}) * ${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .innerJoin(paymentItems, eq(paymentItems.orderItemId, orderItems.id))
    .innerJoin(payments, eq(payments.id, paymentItems.paymentId))
    // Like revenue by category: paid, not refunded, no trial payment.
    .where(and(paidRevenueWhere(eventId), isNotNull(orderItems.priceRuleName)))
    .groupBy(orderItems.priceRuleId, orderItems.priceRuleName, menuItems.id, itemNameDe, itemNameEn)
  return rows
    .map((r) => ({
      ruleId: r.ruleId,
      ruleName: r.ruleName ?? '',
      menuItemId: r.menuItemId,
      nameDe: r.nameDe,
      nameEn: r.nameEn,
      quantity: Number(r.quantity),
      totalCents: Number(r.total),
      discountCents: Number(r.discount),
    }))
    .sort((a, b) => a.ruleName.localeCompare(b.ruleName, 'de') || b.totalCents - a.totalCents)
}
