import { getRouterParam, type H3Event } from 'h3'
import type { Db } from '../db/client'
import { AppError } from './errors'
import { requireActiveEvent } from './active-event'
import { parseTicketKey } from './tickets'

// Waiters may also serve tables outside the QR range, so only sanity-check the number.
const MAX_TABLE_NO = 9999

// The table ticket key (`t-<n>`) of a route plus the active event.
export async function requireTableTarget(event: H3Event, db: Db): Promise<{ eventId: string; tableNo: number; key: string }> {
  const key = getRouterParam(event, 'id') ?? ''
  const parsed = parseTicketKey(key)
  if (!parsed || parsed.kind !== 'table') {
    throw new AppError('VALIDATION', 400, `Invalid table ticket key '${key}'`)
  }
  const tableNo = parsed.tableNo!
  if (tableNo < 1 || tableNo > MAX_TABLE_NO) {
    throw new AppError('VALIDATION', 400, `Invalid table number ${tableNo}`)
  }
  const ev = await requireActiveEvent(db)
  return { eventId: ev.id, tableNo, key }
}
