import { getRouterParam, type H3Event } from 'h3'
import { and, count, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { auditLog, events, orders, payments, type Event } from '../db/schema'
import { depositReturns } from '../db/schema-cash'
import { tableAssignments, tableChecks } from '../db/schema-service'
import { AppError } from './errors'
import { EventSchema, type EventDto } from './contracts/admin'

function toIso(d: Date | string | null): string | null {
  if (d === null) return null
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString()
}

// `date` columns come back as 'YYYY-MM-DD' from Postgres; pg-mem may hand
// out a Date instead.
export function toDay(d: Date | string | null): string | null {
  if (d === null) return null
  return d instanceof Date ? d.toISOString().slice(0, 10) : d.slice(0, 10)
}

export async function trialOrderCounts(db: Db, eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map()
  const rows = await db
    .select({ eventId: orders.eventId, n: count() })
    .from(orders)
    .where(and(eq(orders.isTrial, true), inArray(orders.eventId, eventIds)))
    .groupBy(orders.eventId)
  return new Map(rows.map((r) => [r.eventId, Number(r.n)]))
}

export function toEventDto(row: Event, trialOrders: number): EventDto {
  return EventSchema.parse({
    id: row.id,
    name: row.name,
    pinCode: row.pinCode,
    isActive: row.isActive,
    tableRangeFrom: row.tableRangeFrom,
    tableRangeTo: row.tableRangeTo,
    createdAt: toIso(row.createdAt)!,
    activatedAt: toIso(row.activatedAt),
    startsOn: toDay(row.startsOn),
    endsOn: toDay(row.endsOn),
    trialMode: row.trialMode,
    trialOrders,
    depositEnabled: row.depositEnabled,
    staffMealsEnabled: row.staffMealsEnabled,
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The `[id]` of /api/admin/events/[id]/… routes.
export function eventIdParam(event: H3Event): string {
  const id = getRouterParam(event, 'id') ?? ''
  if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 400, 'Invalid event id')
  return id
}

export async function loadEvent(db: Db, id: string): Promise<Event> {
  const row = (await db.select().from(events).where(eq(events.id, id)).limit(1))[0]
  if (!row) throw new AppError('NOT_FOUND', 404, 'Event not found')
  return row
}

export async function loadEventDto(db: Db, id: string): Promise<EventDto> {
  const row = await loadEvent(db, id)
  const counts = await trialOrderCounts(db, [id])
  return toEventDto(row, counts.get(id) ?? 0)
}

// Removes everything recorded during rehearsals. Payments go first; deleting
// them cascades to payment_items and refunds, deleting the orders cascades to
// their items and payment locks.
export async function deleteTrialData(db: Db, eventId: string, staffId: string): Promise<{ orders: number; payments: number }> {
  return await db.transaction(async (tx) => {
    const deletedPayments = await tx
      .delete(payments)
      .where(and(eq(payments.eventId, eventId), eq(payments.isTrial, true)))
      .returning({ id: payments.id })
    const deletedOrders = await tx
      .delete(orders)
      .where(and(eq(orders.eventId, eventId), eq(orders.isTrial, true)))
      .returning({ id: orders.id })
    await tx.delete(depositReturns).where(and(eq(depositReturns.eventId, eventId), eq(depositReturns.isTrial, true)))
    const result = { orders: deletedOrders.length, payments: deletedPayments.length }
    await tx.insert(auditLog).values({
      action: 'event_trial_data_delete',
      staffId,
      targetKind: 'event',
      targetId: eventId,
      payload: { deletedOrders: result.orders, deletedPayments: result.payments },
    })
    return result
  })
}

// Ends the rehearsal's side effects on the floor plan: waiter-to-table
// assignments and "asked at the table" marks start fresh for the real event.
export async function resetTableState(tx: Pick<Db, 'delete'>, eventId: string): Promise<void> {
  await tx.delete(tableChecks).where(eq(tableChecks.eventId, eventId))
  await tx.delete(tableAssignments).where(eq(tableAssignments.eventId, eventId))
}
