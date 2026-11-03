import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { buildTiles, LATE_AFTER_MINUTES, matchesOwner, needsSomeone, ticketAssignee, tileState } from '~/utils/table-grid'
import { useStaffView } from '~/composables/useStaffView'
import TableTile from '~/components/staff/TableTile.vue'
import TableGrid from '~/components/staff/TableGrid.vue'
import OverviewControls from '~/components/staff/OverviewControls.vue'
import TicketCard from '~/components/staff/TicketCard.vue'
import NeedsSomeone from '~/components/staff/NeedsSomeone.vue'
import TableAssignmentsTable from '~/components/admin/reports/TableAssignmentsTable.vue'
import type { TicketSummary } from '~/../server/lib/contracts/staff'
import type { TableAssignment } from '~/../server/lib/contracts/tables'

const NOW = Date.parse('2026-10-13T20:00:00Z')
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()
const ANNA = { staffId: '00000000-0000-4000-8000-00000000000a', username: 'anna' }
const BEN = { staffId: '00000000-0000-4000-8000-00000000000b', username: 'ben' }
const stubs = { NuxtLink: RouterLinkStub }

function ticket(over: Partial<TicketSummary> = {}): TicketSummary {
  return {
    ticketKey: 't-4', tableNo: 4, status: 'open', totalCents: 800, unpaidCents: 800, lockedBy: null,
    ready: { kitchen: 0, bar: 0 }, foodToPay: 0, oldestItemAt: ago(5), lastOrderAt: ago(5), lastCheckAt: null, assignee: null, ...over,
  }
}
const held = (tableNo: number, who = ANNA): TableAssignment => ({ tableNo, ...who, assignedAt: ago(1) })

describe('table grid helpers', () => {
  it('colours a table by what is to do there', () => {
    expect(tileState(null, NOW)).toBe('free')
    expect(tileState(ticket(), NOW)).toBe('busy')
    expect(tileState(ticket({ lastOrderAt: ago(LATE_AFTER_MINUTES) }), NOW)).toBe('late')
    // Asking at the table ("nachgefragt") resets the clock.
    expect(tileState(ticket({ lastOrderAt: ago(40), lastCheckAt: ago(3) }), NOW)).toBe('busy')
    expect(tileState(ticket({ lastOrderAt: ago(40), ready: { kitchen: 1, bar: 0 } }), NOW)).toBe('ready')
    expect(tileState(ticket({ status: 'paid', unpaidCents: 0 }), NOW)).toBe('free')
    // Food prepay: the kitchen waits for the money, so cashing comes first.
    expect(tileState(ticket({ foodToPay: 2, ready: { kitchen: 0, bar: 1 } }), NOW)).toBe('pay')
  })

  it('lists the whole range plus served tables outside it, without walk-ins', () => {
    const tiles = buildTiles(
      { from: 1, to: 3 },
      [ticket({ ticketKey: 't-2', tableNo: 2 }), ticket({ ticketKey: 'w-x', tableNo: 0 }), ticket({ ticketKey: 't-40', tableNo: 40 })],
      [held(3), held(55, BEN)],
      NOW,
    )
    expect(tiles.map((t) => [t.tableNo, t.state, t.assignee?.username ?? null])).toEqual([
      [1, 'free', null], [2, 'busy', null], [3, 'free', 'anna'], [40, 'busy', null], [55, 'free', 'ben'],
    ])
    expect(buildTiles(null, [], [], NOW)).toEqual([])
  })

  it('filters by owner and reads table owners from the assignments', () => {
    expect(matchesOwner(null, 'all', ANNA.staffId)).toBe(true)
    expect(matchesOwner(ANNA, 'mine', ANNA.staffId)).toBe(true)
    expect(matchesOwner(BEN, 'mine', ANNA.staffId)).toBe(false)
    expect(matchesOwner(null, 'mine', undefined)).toBe(false)

    const t4 = ticket({ assignee: BEN })
    expect(ticketAssignee(t4, [held(4)])).toEqual(ANNA)
    // Given back a moment ago: the stale ticket owner no longer counts.
    expect(ticketAssignee(t4, [])).toBeNull()
    expect(ticketAssignee(ticket({ ticketKey: 'w-1', assignee: BEN }), [])).toEqual(BEN)
  })

  it('finds open tables nobody looks after', () => {
    const open = [
      ticket({ ticketKey: 't-4', tableNo: 4 }),
      ticket({ ticketKey: 't-5', tableNo: 5 }),
      ticket({ ticketKey: 't-6', tableNo: 6, status: 'paid', unpaidCents: 0 }),
      ticket({ ticketKey: 'w-1', tableNo: 0 }),
    ]
    expect(needsSomeone(open, [held(5)]).map((t) => t.tableNo)).toEqual([4])
  })
})

describe('useStaffView', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('remembers filter and view per device', () => {
    const a = useStaffView()
    a.restore()
    expect([a.owner.value, a.view.value]).toEqual(['all', 'list'])
    a.setOwner('mine')
    a.setView('grid')
    const b = useStaffView()
    b.restore()
    expect([b.owner.value, b.view.value]).toEqual(['mine', 'grid'])
    localStorage.setItem('staff-owner-filter', 'bogus')
    b.restore()
    expect(b.owner.value).toBe('all')
    // "Free" was dropped: a device that remembered it falls back to "All".
    localStorage.setItem('staff-owner-filter', 'free')
    b.restore()
    expect(b.owner.value).toBe('all')
  })

  it('starts with the given owner filter until one is remembered', () => {
    const v = useStaffView()
    v.restore('mine')
    expect(v.owner.value).toBe('mine')
    v.setOwner('all')
    v.restore('mine')
    expect(v.owner.value).toBe('all')
  })

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const v = useStaffView()
    v.restore()
    expect(v.owner.value).toBe('all')
    v.setOwner('mine')
    v.setView('grid')
    expect([v.owner.value, v.view.value]).toEqual(['mine', 'grid'])
  })
})

describe('TableTile and TableGrid', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('shows state, amount and owner and marks own tables with a star', () => {
    const late = mount(TableTile, {
      props: { tile: { tableNo: 4, state: 'late', ticket: ticket({ lastOrderAt: ago(25) }), assignee: BEN }, mine: false, nowMs: NOW },
      global: { stubs },
    })
    expect(late.attributes('data-state')).toBe('late')
    expect(late.text()).toContain('staff.grid.state.late:{"n":25}')
    expect(late.text()).toContain('ben')
    expect(late.findComponent(RouterLinkStub).props('to')).toBe('/staff/4')

    const ready = mount(TableTile, {
      props: { tile: { tableNo: 5, state: 'ready', ticket: ticket({ ready: { kitchen: 2, bar: 1 } }), assignee: ANNA }, mine: true, nowMs: NOW },
      global: { stubs },
    })
    expect(ready.attributes('data-mine')).toBe('true')
    // No ring: the brand colour may be red, which already means "late".
    expect(ready.classes()).not.toContain('ring-4')
    expect(ready.find('[data-test="tile-mine"]').exists()).toBe(true)
    expect(ready.text()).toContain('staff.grid.state.ready:{"n":3}')
    expect(ready.text()).not.toContain('anna')

    const pay = mount(TableTile, {
      props: { tile: { tableNo: 7, state: 'pay', ticket: ticket({ foodToPay: 2 }), assignee: ANNA }, mine: true, nowMs: NOW },
      global: { stubs },
    })
    expect(pay.text()).toContain('staff.grid.state.pay:{"n":2}')

    const free = mount(TableTile, { props: { tile: { tableNo: 6, state: 'free', ticket: null, assignee: null }, mine: false, nowMs: NOW }, global: { stubs } })
    expect(free.text()).toContain('staff.grid.state.free')
    expect(free.attributes('data-mine')).toBeUndefined()
    expect(free.find('[data-test="tile-mine"]').exists()).toBe(false)

    const hidden = mount(TableTile, {
      props: { tile: { tableNo: 7, state: 'busy', ticket: ticket(), assignee: BEN }, mine: false, nowMs: NOW, showOwner: false },
      global: { stubs },
    })
    expect(hidden.text()).not.toContain('ben')
    const mineHidden = mount(TableTile, {
      props: { tile: { tableNo: 8, state: 'free', ticket: null, assignee: ANNA }, mine: true, nowMs: NOW, showOwner: false },
      global: { stubs },
    })
    expect(mineHidden.find('[data-test="tile-mine"]').exists()).toBe(false)
  })

  it('filters tiles by owner and lists walk-ins separately', () => {
    const tickets = [ticket(), ticket({ ticketKey: 'w-1', tableNo: 0, assignee: ANNA }), ticket({ ticketKey: 'w-2', tableNo: 0, assignee: BEN })]
    const props = { tickets, assignments: [held(2), held(3, BEN)], tableRange: { from: 1, to: 4 }, owner: 'all' as const, myId: ANNA.staffId }
    const all = mount(TableGrid, { props, global: { stubs } })
    expect(all.findAll('[data-test="table-tile"]')).toHaveLength(4)
    expect(all.findAll('[data-mine="true"]')).toHaveLength(1)
    expect(all.find('[data-test="grid-walkins"]').findAll('li')).toHaveLength(2)

    const mine = mount(TableGrid, { props: { ...props, owner: 'mine' }, global: { stubs } })
    expect(mine.findAll('[data-test="table-tile"]').map((t) => t.text().match(/\d+/)![0])).toEqual(['2'])
    expect(mine.find('[data-test="grid-walkins"]').findAll('li')).toHaveLength(1)
    expect(mine.find('[data-test="ticket-assignee"]').exists()).toBe(false)

    const none = mount(TableGrid, { props: { ...props, assignments: [], owner: 'mine', tickets: [] }, global: { stubs } })
    expect(none.text()).toContain('staff.grid.noneMine')
    all.unmount()
  })
})

describe('OverviewControls', () => {
  it('emits the owner filter and the view', async () => {
    const w = mount(OverviewControls, { props: { owner: 'all', view: 'list' } })
    expect(w.find('[data-test="owner-all"]').attributes('aria-pressed')).toBe('true')
    await w.find('[data-test="owner-mine"]').trigger('click')
    await w.find('[data-test="view-grid"]').trigger('click')
    expect(w.emitted('owner')).toEqual([['mine']])
    expect(w.emitted('view')).toEqual([['grid']])
  })

  it('leaves out the list/grid switch for waiters', () => {
    const w = mount(OverviewControls, { props: { owner: 'mine', view: 'grid', showView: false } })
    expect(w.find('[data-test="owner-mine"]').exists()).toBe(true)
    expect(w.find('[data-test="view-list"]').exists()).toBe(false)
  })
})

describe('TicketCard owner line', () => {
  const owner = (props: Record<string, unknown>) => mount(TicketCard, { props: { ticket: ticket(), ...props }, global: { stubs } })
    .find('[data-test="ticket-assignee"]').text()

  it('says whose table it is', () => {
    expect(owner({})).toBe('staff.assign.free')
    expect(owner({ assignee: BEN })).toBe('staff.assign.heldBy:{"name":"ben"}')
    expect(owner({ assignee: ANNA, mine: true })).toBe('staff.assign.mine')
  })

  it('drops the owner line under "My tables"', () => {
    const w = mount(TicketCard, { props: { ticket: ticket(), assignee: ANNA, mine: true, showOwner: false }, global: { stubs } })
    expect(w.find('[data-test="ticket-assignee"]').exists()).toBe(false)
    expect(w.classes()).not.toContain('ring-2')
  })
})

describe('NeedsSomeone', () => {
  it('links every unattended table and hides when there is none', () => {
    const w = mount(NeedsSomeone, { props: { tickets: [ticket(), ticket({ ticketKey: 't-9', tableNo: 9 })] }, global: { stubs } })
    expect(w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))).toEqual(['/staff/4', '/staff/9'])
    expect(w.text()).toContain('staff.needsSomeone.heading')
    expect(mount(NeedsSomeone, { props: { tickets: [] }, global: { stubs } }).find('[data-test="needs-someone"]').exists()).toBe(false)
  })
})

describe('TableAssignmentsTable', () => {
  it('groups the tables per waiter', () => {
    const w = mount(TableAssignmentsTable, { props: { rows: [held(5), held(2), held(9, BEN)] } })
    const rows = w.findAll('tbody tr').map((r) => r.findAll('td').map((c) => c.text()))
    expect(rows).toEqual([['anna', '2', '2, 5'], ['ben', '1', '9']])
    expect(mount(TableAssignmentsTable, { props: { rows: [] } }).text()).toContain('admin.reports.noAssignments')
  })
})
