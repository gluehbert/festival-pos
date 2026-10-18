export type TicketKind = 'table' | 'walkin'

export interface ParsedTicketKey {
  kind: TicketKind
  tableNo: number | null
  orderId: string | null
}

const TABLE_RE = /^t-(\d+)$/
const WALK_RE = /^w-([0-9a-f-]{36})$/i

export function makeTableKey(tableNo: number): string {
  return `t-${tableNo}`
}

export function makeWalkKey(orderId: string): string {
  return `w-${orderId}`
}

export function parseTicketKey(key: string): ParsedTicketKey | null {
  const t = TABLE_RE.exec(key)
  if (t) {
    return { kind: 'table', tableNo: Number.parseInt(t[1]!, 10), orderId: null }
  }
  const w = WALK_RE.exec(key)
  if (w) {
    return { kind: 'walkin', tableNo: null, orderId: w[1]! }
  }
  return null
}
