import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { tableChecks } from '../db/schema-service'

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v)
}

// Last "asked, nothing wanted" per table of the event.
export async function loadTableChecks(db: Db, eventId: string): Promise<Map<number, Date>> {
  const rows = await db
    .select({ tableNo: tableChecks.tableNo, checkedAt: tableChecks.checkedAt })
    .from(tableChecks)
    .where(eq(tableChecks.eventId, eventId))
  return new Map(rows.map((r) => [r.tableNo, toDate(r.checkedAt)]))
}

export async function loadTableCheck(db: Db, eventId: string, tableNo: number): Promise<Date | null> {
  const rows = await db
    .select({ checkedAt: tableChecks.checkedAt })
    .from(tableChecks)
    .where(and(eq(tableChecks.eventId, eventId), eq(tableChecks.tableNo, tableNo)))
    .limit(1)
  return rows[0] ? toDate(rows[0].checkedAt) : null
}

// Overwrites the previous check: only the latest one matters.
export async function recordTableCheck(db: Db, eventId: string, tableNo: number, staffId: string): Promise<Date> {
  const checkedAt = new Date()
  await db
    .insert(tableChecks)
    .values({ eventId, tableNo, staffId, checkedAt })
    .onConflictDoUpdate({
      target: [tableChecks.eventId, tableChecks.tableNo],
      set: { staffId, checkedAt },
    })
  return checkedAt
}
