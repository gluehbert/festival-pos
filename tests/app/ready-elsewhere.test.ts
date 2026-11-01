import { describe, expect, it } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { readyElsewhere } from '~/utils/table-grid'
import ReadyElsewhere from '~/components/staff/ReadyElsewhere.vue'
import type { TicketSummary } from '~/../server/lib/contracts/staff'
import type { TableAssignment } from '~/../server/lib/contracts/tables'

const ANNA = { staffId: '00000000-0000-4000-8000-00000000000a', username: 'anna' }
const BEN = { staffId: '00000000-0000-4000-8000-00000000000b', username: 'ben' }
const AT = '2026-10-16T18:00:00.000Z'

function ticket(tableNo: number, ready = { kitchen: 0, bar: 0 }, over: Partial<TicketSummary> = {}): TicketSummary {
  return {
    ticketKey: `t-${tableNo}`, tableNo, status: 'open', totalCents: 800, unpaidCents: 800, lockedBy: null,
    ready, foodToPay: 0, oldestItemAt: AT, lastOrderAt: AT, lastCheckAt: null, assignee: null, ...over,
  }
}
const held = (tableNo: number, who: typeof ANNA): TableAssignment => ({ tableNo, ...who, assignedAt: AT })

describe('readyElsewhere', () => {
  it('lists finished trays of other and unattended tables, not own ones or walk-ins', () => {
    const tickets = [
      ticket(2, { kitchen: 1, bar: 0 }),
      ticket(5, { kitchen: 0, bar: 3 }),
      ticket(6, { kitchen: 2, bar: 0 }),
      ticket(7),
      ticket(0, { kitchen: 1, bar: 0 }, { ticketKey: 'w-1', assignee: BEN }),
    ]
    const assignments = [held(2, ANNA), held(5, BEN), held(7, BEN)]
    expect(readyElsewhere(tickets, assignments, ANNA.staffId).map((t) => t.tableNo)).toEqual([5, 6])
    // Taken over a moment ago: the assignments list counts, not the stale ticket.
    expect(readyElsewhere([ticket(5, { kitchen: 0, bar: 1 }, { assignee: BEN })], [held(5, ANNA)], ANNA.staffId)).toEqual([])
  })
})

describe('ReadyElsewhere', () => {
  it('links each tray to its table with what is ready and whose table it is', () => {
    const w = mount(ReadyElsewhere, {
      props: { tickets: [ticket(5, { kitchen: 1, bar: 2 }), ticket(6, { kitchen: 0, bar: 1 })], assignments: [held(5, BEN)] },
      global: { stubs: { NuxtLink: RouterLinkStub } },
    })
    const rows = w.findAll('[data-test="ready-elsewhere-table"]')
    expect(rows.map((r) => r.findComponent(RouterLinkStub).props('to'))).toEqual(['/staff/5', '/staff/6'])
    expect(rows[0]!.text()).toContain('staff.ticket.foodReady:{"n":1}')
    expect(rows[0]!.text()).toContain('staff.ticket.drinksReady:{"n":2}')
    expect(rows[0]!.text()).toContain('ben')
    expect(rows[1]!.text()).toContain('staff.calls.nobody')
  })

  it('is hidden when nothing waits', () => {
    const w = mount(ReadyElsewhere, { props: { tickets: [], assignments: [] }, global: { stubs: { NuxtLink: RouterLinkStub } } })
    expect(w.find('[data-test="ready-elsewhere"]').exists()).toBe(false)
  })
})
