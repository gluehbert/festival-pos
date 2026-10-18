import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { events, type Event } from '../db/schema'
import { AppError } from './errors'

export async function requireActiveEvent(db: Db): Promise<Event> {
  const rows = await db.select().from(events).where(eq(events.isActive, true)).limit(1)
  if (!rows[0]) throw new AppError('NOT_FOUND', 404, 'No active event')
  return rows[0]
}
