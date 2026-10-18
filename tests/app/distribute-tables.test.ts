import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { useAuthStore } from '~/stores/auth'
import DistributePage from '~/pages/staff/tables.vue'
import { navigateTo, useCookie } from './setup/imports'

const ANNA = { staffId: '00000000-0000-4000-8000-00000000000a', username: 'anna' }
const BEN = { staffId: '00000000-0000-4000-8000-00000000000b', username: 'ben' }
const fetchMock = vi.fn()
const stubs = { NuxtLink: RouterLinkStub }

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
  useAuthStore().staff = { staffId: 'l', username: 'lena', role: 'lead', theme: 'system' }
})
afterEach(() => vi.unstubAllGlobals())

function serve(assignments: Array<{ tableNo: number } & typeof ANNA>) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/tickets/team') return { team: [ANNA, BEN] }
    return { tickets: [], assignments: assignments.map((a) => ({ ...a, assignedAt: '2026-10-16T18:00:00.000Z' })), tableRange: { from: 1, to: 4 }, serverNow: new Date().toISOString() }
  })
}

const tiles = (w: ReturnType<typeof mount>) => w.findAll('[data-test="distribute-table"]')

describe('Distribute tables', () => {
  it('shows the team with their table count and every table with its holder', async () => {
    serve([{ tableNo: 2, ...ANNA }, { tableNo: 6, ...BEN }])
    const w = mount(DistributePage, { global: { stubs } })
    await flushPromises()
    const people = w.findAll('[data-test="distribute-person"]')
    expect(people.map((p) => p.text())).toEqual(['annastaff.distribute.count:{"n":1}', 'benstaff.distribute.count:{"n":1}'])
    // Range 1–4 plus table 6 outside it that ben already holds.
    expect(tiles(w).map((t) => t.text())).toEqual(['1staff.distribute.free', '2anna', '3staff.distribute.free', '4staff.distribute.free', '6ben'])
    // Nothing to tap until a person is picked.
    expect(w.get('[data-test="distribute-hint"]').text()).toBe('staff.distribute.pickFirst')
    expect(tiles(w).every((t) => t.attributes('disabled') !== undefined)).toBe(true)
  })

  it('gives a tapped table to the picked person and frees it on a second tap', async () => {
    serve([{ tableNo: 2, ...ANNA }])
    const w = mount(DistributePage, { global: { stubs } })
    await flushPromises()
    await w.findAll('[data-test="distribute-person"]')[1]!.trigger('click')
    expect(w.get('[data-test="distribute-hint"]').text()).toBe('staff.distribute.tapHint:{"name":"ben"}')

    fetchMock.mockResolvedValueOnce({ tableNo: 2, assignee: BEN })
    await tiles(w)[1]!.trigger('click')
    await flushPromises()
    const post = fetchMock.mock.calls.find((c) => c[0] === '/api/tickets/t-2/assign')!
    expect(post[1]).toMatchObject({ method: 'POST', body: { takeOver: true, staffId: BEN.staffId } })
    expect(tiles(w)[1]!.text()).toBe('2ben')
    expect(tiles(w)[1]!.attributes('aria-pressed')).toBe('true')

    fetchMock.mockResolvedValueOnce({ tableNo: 2, assignee: null })
    await tiles(w)[1]!.trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls.at(-1)![1]).toMatchObject({ method: 'DELETE' })
    expect(tiles(w)[1]!.text()).toBe('2staff.distribute.free')
  })

  it('says which table failed', async () => {
    serve([])
    const w = mount(DistributePage, { global: { stubs } })
    await flushPromises()
    await w.findAll('[data-test="distribute-person"]')[0]!.trigger('click')
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await tiles(w)[0]!.trigger('click')
    await flushPromises()
    expect(w.get('[role="alert"]').text()).toBe('staff.distribute.failed:{"n":1}')
  })

  it('sends waiters back to the service screen', async () => {
    useAuthStore().staff = { staffId: 'a', username: 'anna', role: 'waiter', theme: 'system' }
    serve([])
    mount(DistributePage, { global: { stubs } })
    await flushPromises()
    expect(navigateTo).toHaveBeenCalledWith('/staff')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
