import { createHmac, timingSafeEqual } from 'node:crypto'
import { serverEnv } from './env'

// Each printed QR code carries a key bound to (event, table). Without it (or
// the event PIN) nobody can open a guest session for a table from outside
// the venue just by guessing /t/<n>. 16 base64url chars = 96 bits.
export function tableKey(eventId: string, tableNo: number): string {
  return createHmac('sha256', serverEnv().jwtSecret)
    .update(`table-key:${eventId}:${tableNo}`)
    .digest('base64url')
    .slice(0, 16)
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function isValidTableKey(eventId: string, tableNo: number, key: string): boolean {
  return safeEqual(tableKey(eventId, tableNo), key)
}
