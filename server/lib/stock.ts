import { and, eq, gte, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { menuItems } from '../db/schema'
import { AppError } from './errors'

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

// Counts ordered units off the stock inside the order transaction. One
// conditional UPDATE per article: Postgres re-checks `stock >= n` against the
// latest row, so parallel orders can never sell more than is left. Reaching 0
// marks the article sold out. Articles without stock (NULL) pass unchanged.
// A sold-out flag set after the order's pre-check fails it here as well.
export async function takeStock(
  tx: Tx,
  lines: Array<{ menuItemId: string; quantity: number }>,
  nameOf: (menuItemId: string) => string,
): Promise<void> {
  const totals = new Map<string, number>()
  for (const l of lines) totals.set(l.menuItemId, (totals.get(l.menuItemId) ?? 0) + l.quantity)
  // Same lock order in every transaction, so two orders cannot deadlock.
  for (const [id, total] of [...totals].sort(([a], [b]) => a.localeCompare(b))) {
    const n = sql`${total}::integer`
    const rows = await tx
      .update(menuItems)
      .set({
        stock: sql`${menuItems.stock} - ${n}`,
        isAvailable: sql`CASE WHEN ${menuItems.stock} IS NOT NULL AND ${menuItems.stock} - ${n} <= 0 THEN false ELSE ${menuItems.isAvailable} END`,
      })
      .where(and(eq(menuItems.id, id), eq(menuItems.isAvailable, true), or(isNull(menuItems.stock), gte(menuItems.stock, total))))
      .returning({ id: menuItems.id })
    if (rows.length === 0) {
      throw new AppError('SOLD_OUT', 409, `Menu item ${nameOf(id)} is not available in this quantity`)
    }
  }
}

// A voided line goes back on the stock; an article sold out by its stock
// is available again.
export async function returnStock(tx: Tx, menuItemId: string, quantity: number): Promise<void> {
  await tx
    .update(menuItems)
    .set({
      stock: sql`${menuItems.stock} + ${quantity}::integer`,
      isAvailable: sql`CASE WHEN ${menuItems.stock} = 0 THEN true ELSE ${menuItems.isAvailable} END`,
    })
    .where(and(eq(menuItems.id, menuItemId), isNotNull(menuItems.stock)))
}
