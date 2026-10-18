import { and, eq, inArray, ne, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { orderItems } from '../db/schema'
import { AppError } from './errors'

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export interface SettleLine {
  orderItemId: string
  // Quantity of the line when it was read; guards against concurrent changes.
  quantity: number
  payQuantity: number
}

interface SettleCandidate {
  id: string
  quantity: number
  paymentStatus: string
  productionStatus: string
}

// Validates the chosen lines against what was read and derives the quantities to pay.
export function buildSettleLines(rows: SettleCandidate[], quantities?: Record<string, number>): SettleLine[] {
  return rows.map((r) => {
    const payQuantity = quantities?.[r.id] ?? r.quantity
    if (payQuantity > r.quantity) {
      throw new AppError('VALIDATION', 400, `Item ${r.id} has only ${r.quantity} to pay`)
    }
    if (r.paymentStatus === 'paid') {
      throw new AppError('CONFLICT', 409, `Item ${r.id} is already paid`)
    }
    if (r.productionStatus === 'cancelled') {
      throw new AppError('VALIDATION', 400, `Item ${r.id} is cancelled`)
    }
    return { orderItemId: r.id, quantity: r.quantity, payQuantity }
  })
}

const concurrent = () => new AppError('CONFLICT', 409, 'One or more items were paid or voided concurrently')

// Marks the lines paid and returns the ids of the paid rows. A line paid only
// partly ("2 of 5 beers") is split: the original row keeps the unpaid rest,
// a new row with the paid quantity is created and returned instead.
// Whatever was finished counts as brought once it is paid: drinks are
// brought and cashed right away, nobody taps "Gebracht" in the rush.
export async function settleLines(tx: Tx, lines: SettleLine[]): Promise<string[]> {
  const fullLines = lines.filter((l) => l.payQuantity === l.quantity)
  const full = fullLines.map((l) => l.orderItemId)
  const partial = lines.filter((l) => l.payQuantity < l.quantity)
  const paidIds: string[] = []

  if (full.length > 0) {
    const marked = await tx
      .update(orderItems)
      .set({
        paymentStatus: 'paid',
        servedAt: sql`CASE WHEN ${orderItems.productionStatus} = 'done' THEN COALESCE(${orderItems.servedAt}, now()) ELSE ${orderItems.servedAt} END`,
      })
      .where(and(
        inArray(orderItems.id, full),
        eq(orderItems.paymentStatus, 'unpaid'),
        ne(orderItems.productionStatus, 'cancelled'),
        // A part-payment in between shrinks the line: paying the old quantity
        // in full would charge units that are already settled.
        or(...fullLines.map((l) => and(eq(orderItems.id, l.orderItemId), eq(orderItems.quantity, l.quantity)))),
      ))
      .returning({ id: orderItems.id })
    if (marked.length !== full.length) throw concurrent()
    paidIds.push(...full)
  }

  for (const line of partial) {
    const rest = await tx
      .update(orderItems)
      .set({ quantity: line.quantity - line.payQuantity })
      .where(and(
        eq(orderItems.id, line.orderItemId),
        eq(orderItems.quantity, line.quantity),
        eq(orderItems.paymentStatus, 'unpaid'),
        ne(orderItems.productionStatus, 'cancelled'),
      ))
      .returning()
    const orig = rest[0]
    if (!orig) throw concurrent()
    const inserted = await tx
      .insert(orderItems)
      .values({
        orderId: orig.orderId,
        menuItemId: orig.menuItemId,
        quantity: line.payQuantity,
        unitPriceCents: orig.unitPriceCents,
        depositCents: orig.depositCents,
        station: orig.station,
        note: orig.note,
        nameDe: orig.nameDe,
        nameEn: orig.nameEn,
        category: orig.category,
        // The split-off part was sold under the same price rule.
        priceRuleId: orig.priceRuleId,
        priceRuleName: orig.priceRuleName,
        regularPriceCents: orig.regularPriceCents,
        productionStatus: orig.productionStatus,
        servedAt: orig.productionStatus === 'done' ? orig.servedAt ?? new Date() : orig.servedAt,
        paymentStatus: 'paid',
        // Same order time, so the split part keeps its place in queues and reports.
        createdAt: orig.createdAt,
      })
      .returning({ id: orderItems.id })
    paidIds.push(inserted[0]!.id)
  }

  return paidIds
}
