import { sql, type SQL } from 'drizzle-orm'
import { orderItems } from '../db/schema'

// In the rush nobody taps "Gebracht": the tray goes to the table and the
// waiter moves on. A finished item therefore counts as brought ten minutes
// after kitchen/bar finished it, so a table only shows green for something
// that is new. "Gebracht" and cashing still clear it at once.
export const SERVED_AFTER_MINUTES = 10

export function readyCutoff(now = new Date()): Date {
  return new Date(now.getTime() - SERVED_AFTER_MINUTES * 60_000)
}

// Finished, not brought, and finished recently enough to still need bringing.
export function awaitingService(now = new Date()): SQL<boolean> {
  return sql<boolean>`(${orderItems.productionStatus} = 'done' AND ${orderItems.servedAt} IS NULL
    AND ${orderItems.readyAt} IS NOT NULL AND ${orderItems.readyAt} > ${readyCutoff(now).toISOString()})`
}
