import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TableAssignment from '~/components/staff/TableAssignment.vue'
import { useAuthStore } from '~/stores/auth'
import { useTicketsStore } from '~/stores/tickets'
import { useCookie } from './setup/imports'
import { apiFailure } from './setup/api-error'

const ANNA = { staffId: '00000000-0000-4000-8000-00000000000a', username: 'anna' }
const BEN = { staffId: '00000000-0000-4000-8000-00000000000b', username: 'ben' }
const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => vi.unstubAllGlobals())

const taken = (assignee: typeof BEN) => apiFailure(409, 'TABLE_TAKEN', { message: 'held', details: { assignee } })

describe('tickets store: assignments', () => {
  it('keeps assignments and table range from the poll', async () => {
    const s = useTicketsStore()
    fetchMock.mockResolvedValueOnce({ tickets: [], assignments: [{ tableNo: 2, ...ANNA, assignedAt: '2026-10-13T20:00:00.000Z' }], tableRange: { from: 1, to: 9 }, serverNow: new Date().toISOString() })
    await s.refresh({ status: 'open' })
    expect(s.assignments.map((a) => a.tableNo)).toEqual([2])
    expect(s.tableRange).toEqual({ from: 1, to: 9 })
    // An older server without the fields does not break the screen.
    fetchMock.mockResolvedValueOnce({ tickets: [], serverNow: new Date().toISOString() })
    await s.refresh()
    expect(s.assignments).toEqual([])
    expect(s.tableRange).toBeNull()
  })

  it('takes, takes over and gives back a table, updating locally', async () => {
    const s = useTicketsStore()
    fetchMock.mockResolvedValueOnce({ tableNo: 3, assignee: ANNA })
    expect(await s.assign(3)).toEqual({ ok: true })
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/tickets/t-3/assign')
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: { takeOver: false } })
    expect(s.assignments.map((a) => [a.tableNo, a.username])).toEqual([[3, 'anna']])

    fetchMock.mockRejectedValueOnce(taken(BEN))
    expect(await s.assign(4)).toEqual({ ok: false, heldBy: BEN })
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    expect(await s.assign(4)).toEqual({ ok: false, heldBy: null })

    s.selected = { ticketKey: 't-3', assignee: ANNA } as never
    fetchMock.mockResolvedValueOnce({ tableNo: 3, assignee: null })
    expect(await s.release(3)).toBe(true)
    expect(fetchMock.mock.calls.at(-1)![1]).toMatchObject({ method: 'DELETE' })
    expect(s.assignments).toEqual([])
    expect(s.selected!.assignee).toBeNull()
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    expect(await s.release(3)).toBe(false)
  })

  it('treats a table without orders as empty, not as a sync failure', async () => {
    const s = useTicketsStore()
    fetchMock.mockRejectedValueOnce({ statusCode: 404 })
    expect(await s.load('t-8')).toBeNull()
    expect(s.missing).toBe(true)
    expect(s.syncFailed).toBe(false)
    fetchMock.mockRejectedValueOnce({ statusCode: 500 })
    await s.load('t-8')
    expect(s.syncFailed).toBe(true)
  })
})

describe('TableAssignment', () => {
  function setup(assignee: typeof ANNA | null, role: 'waiter' | 'lead' | 'admin' = 'lead') {
    useAuthStore().staff = { ...ANNA, role, theme: 'system' }
    return mount(TableAssignment, { props: { tableNo: 5, assignee } })
  }

  it('offers "My table" on a free table', async () => {
    const w = setup(null)
    expect(w.text()).toContain('staff.assign.free')
    fetchMock.mockResolvedValueOnce({ tableNo: 5, assignee: ANNA })
    await w.find('[data-test="assign-take"]').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ body: { takeOver: false } })
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })

  it('gives back an own table', async () => {
    const w = setup(ANNA)
    expect(w.text()).toContain('staff.assign.mine')
    expect(w.find('[data-test="assign-take"]').exists()).toBe(false)
    fetchMock.mockResolvedValueOnce({ tableNo: 5, assignee: null })
    await w.find('[data-test="assign-release"]').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'DELETE' })
  })

  it('takes someone else\'s table only after confirming', async () => {
    const w = setup(BEN)
    expect(w.text()).toContain('staff.assign.heldBy:{"name":"ben"}')
    // The shift lead may also just free it.
    expect(w.find('[data-test="assign-release"]').text()).toContain('staff.assign.unassign')
    await w.find('[data-test="assign-takeover"]').trigger('click')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(w.text()).toContain('staff.assign.confirm:{"n":5,"name":"ben"}')
    await w.find('[data-test="assign-cancel"]').trigger('click')
    expect(w.find('[data-test="assign-confirm"]').exists()).toBe(false)

    await w.find('[data-test="assign-takeover"]').trigger('click')
    fetchMock.mockResolvedValueOnce({ tableNo: 5, assignee: ANNA })
    await w.find('[data-test="assign-confirm"]').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: { takeOver: true } })
    expect(w.find('[data-test="assign-confirm"]').exists()).toBe(false)
  })

  it('asks when the table was taken meanwhile and reports failures', async () => {
    const w = setup(null)
    fetchMock.mockRejectedValueOnce(taken(BEN))
    await w.find('[data-test="assign-take"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('staff.assign.confirm:{"n":5,"name":"ben"}')
    await w.find('[data-test="assign-cancel"]').trigger('click')

    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await w.find('[data-test="assign-take"]').trigger('click')
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toBe('staff.assign.failed')
  })

  it('lets an admin free someone else\'s table', () => {
    const w = setup(BEN, 'admin')
    expect(w.find('[data-test="assign-release"]').text()).toContain('staff.assign.unassign')
  })

  it('only tells a waiter who is in charge: the shift lead hands out tables', () => {
    for (const assignee of [null, ANNA, BEN]) {
      const w = setup(assignee, 'waiter')
      expect(w.find('[data-test="table-assignment"]').exists()).toBe(true)
      expect(w.findAll('button')).toHaveLength(0)
    }
    expect(setup(ANNA, 'waiter').text()).toContain('staff.assign.mine')
    expect(setup(BEN, 'waiter').text()).toContain('staff.assign.heldBy:{"name":"ben"}')
  })
})
