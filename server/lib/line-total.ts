import { sql } from 'drizzle-orm'
import { orderItems } from '../db/schema'

// What a guest pays for an order line: price plus Pfand, per unit. Revenue
// reports use unit_price_cents alone.
export const lineTotalSql = sql<number>`(${orderItems.unitPriceCents} + ${orderItems.depositCents}) * ${orderItems.quantity}`

export function lineTotalCents(l: { unitPriceCents: number; depositCents: number; quantity: number }): number {
  return (l.unitPriceCents + l.depositCents) * l.quantity
}
