import { tableActivity } from '~/utils/table-activity'
import type { TicketSummary } from '~/../server/lib/contracts/staff'
import type { Assignee, TableAssignment } from '~/../server/lib/contracts/tables'

// Traffic light per table tile:
// free = nothing open, busy = open order in progress, ready = something to
// bring, late = open and nothing heard for a while (last order or "nachgefragt").
export type TileState = 'free' | 'busy' | 'ready' | 'late'
export const LATE_AFTER_MINUTES = 20

export type OwnerFilter = 'mine' | 'all'

export interface Tile {
  tableNo: number
  state: TileState
  ticket: TicketSummary | null
  assignee: Assignee | null
}

export function tileState(ticket: TicketSummary | null, nowMs: number): TileState {
  if (!ticket) return 'free'
  if (ticket.ready.kitchen + ticket.ready.bar > 0) return 'ready'
  if (ticket.status !== 'open') return 'free'
  const { minutes } = tableActivity(ticket.lastOrderAt, ticket.lastCheckAt, nowMs)
  return minutes >= LATE_AFTER_MINUTES ? 'late' : 'busy'
}

export const isWalkin = (t: TicketSummary): boolean => t.ticketKey.startsWith('w-')

// Every table of the event range, plus tables outside it that have a ticket
// or a waiter (staff may serve tables without a QR code).
export function buildTiles(
  range: { from: number; to: number } | null,
  tickets: TicketSummary[],
  assignments: TableAssignment[],
  nowMs: number,
): Tile[] {
  const byTable = new Map(tickets.filter((t) => !isWalkin(t)).map((t) => [t.tableNo, t]))
  const owners = new Map(assignments.map((a) => [a.tableNo, { staffId: a.staffId, username: a.username }]))
  const numbers = new Set<number>([...byTable.keys(), ...owners.keys()])
  if (range) for (let n = range.from; n <= range.to; n++) numbers.add(n)
  return [...numbers].sort((a, b) => a - b).map((tableNo) => {
    const ticket = byTable.get(tableNo) ?? null
    return { tableNo, ticket, state: tileState(ticket, nowMs), assignee: owners.get(tableNo) ?? ticket?.assignee ?? null }
  })
}

export function matchesOwner(assignee: Assignee | null, filter: OwnerFilter, myId: string | undefined): boolean {
  if (filter === 'all') return true
  return assignee !== null && assignee.staffId === myId
}

// The assignments list is updated right after "Mein Tisch"/"Abgeben", the
// tickets only with the next poll, so tables read their owner from it.
export function ticketAssignee(ticket: TicketSummary, assignments: TableAssignment[]): Assignee | null {
  if (isWalkin(ticket)) return ticket.assignee
  const a = assignments.find((x) => x.tableNo === ticket.tableNo)
  return a ? { staffId: a.staffId, username: a.username } : null
}

// Open tables nobody looks after (e.g. a guest ordered by QR at a table left
// out when the sections were handed out): shown to everyone until taken.
export function needsSomeone(tickets: TicketSummary[], assignments: TableAssignment[]): TicketSummary[] {
  return tickets.filter((t) => !isWalkin(t) && t.status === 'open' && ticketAssignee(t, assignments) === null)
}
