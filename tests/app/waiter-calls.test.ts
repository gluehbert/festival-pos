import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CallWaiter from '~/components/guest/CallWaiter.vue'
import WaiterCalls from '~/components/staff/WaiterCalls.vue'
import { useAuthStore } from '~/stores/auth'
import type { OpenCall } from '~/../server/lib/contracts/waiter-calls'
import { useCookie } from './setup/imports'

const openCall = (over: Partial<OpenCall>): OpenCall => ({
  id: '00000000-0000-4000-8000-000000000001', tableNo: 5, reason: 'pay', waitingSeconds: 30, assignee: null, escalated: true, ...over,
})

describe('calling the service', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset()
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('the guest picks a reason and then sees that the service knows', async () => {
    fetchMock.mockResolvedValueOnce(null)
    const w = mount(CallWaiter)
    await flushPromises()
    await w.get('[data-test="call-open"]').trigger('click')
    fetchMock.mockResolvedValueOnce({ reason: 'pay', createdAt: new Date().toISOString(), acknowledged: false })
    await w.get('[data-reason="pay"]').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls.at(-1)).toMatchObject(['/api/waiter-calls', { method: 'POST', body: { reason: 'pay' } }])
    expect(w.get('[data-test="call-waiting"]').text()).toBe('guest.call.waiting:{"reason":"guest.call.reasons.pay"}')
    w.unmount()
  })

  it('shows "someone is coming" and says when the table just called', async () => {
    fetchMock.mockResolvedValueOnce({ reason: 'order', createdAt: new Date().toISOString(), acknowledged: true })
    const coming = mount(CallWaiter)
    await flushPromises()
    expect(coming.get('[data-test="call-coming"]').text()).toBe('guest.call.coming')
    coming.unmount()

    fetchMock.mockResolvedValueOnce(null)
    const w = mount(CallWaiter)
    await flushPromises()
    await w.get('[data-test="call-open"]').trigger('click')
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('429'), { statusCode: 429, data: { code: 'RATE_LIMITED' } }))
    await w.get('[data-reason="question"]').trigger('click')
    await flushPromises()
    expect(w.get('[role="alert"]').text()).toBe('guest.call.tooSoon')
    w.unmount()
  })

  it('a waiter sees the calls of their tables and the escalated ones, and answers', async () => {
    useAuthStore().staff = { staffId: 'a', username: 'anna', role: 'waiter', theme: 'system' }
    fetchMock.mockResolvedValueOnce({
      calls: [
        openCall({ id: '00000000-0000-4000-8000-000000000001', tableNo: 3, assignee: { staffId: 'a', username: 'anna' }, escalated: false }),
        openCall({ id: '00000000-0000-4000-8000-000000000002', tableNo: 4, assignee: { staffId: 'b', username: 'ben' }, escalated: false }),
        openCall({ id: '00000000-0000-4000-8000-000000000003', tableNo: 9, reason: 'question', waitingSeconds: 190, escalated: true }),
      ],
    })
    const w = mount(WaiterCalls)
    await flushPromises()
    const rows = w.findAll('[data-test="waiter-call"]')
    expect(rows.map((r) => r.find('p').text())).toEqual([
      'staff.calls.table:{"table":3} · guest.call.reasons.pay',
      'staff.calls.table:{"table":9} · guest.call.reasons.question',
    ])
    expect(rows[1]!.text()).toContain('staff.calls.waiting:{"min":3}')
    expect(rows[1]!.text()).toContain('staff.calls.nobody')

    fetchMock.mockResolvedValueOnce({ ok: true })
    await rows[0]!.get('button').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls.at(-1)).toMatchObject(['/api/waiter-calls/00000000-0000-4000-8000-000000000001/ack', { method: 'POST' }])
    expect(w.findAll('[data-test="waiter-call"]')).toHaveLength(1)
    w.unmount()
  })

  it('the bar screen and the shift lead see every call', async () => {
    useAuthStore().staff = { staffId: 'x', username: 'bar', role: 'bar', theme: 'system' }
    const calls = [openCall({ assignee: { staffId: 'b', username: 'ben' }, escalated: false })]
    fetchMock.mockResolvedValue({ calls })
    const bar = mount(WaiterCalls, { props: { bar: true } })
    await flushPromises()
    expect(bar.get('[data-test="waiter-call"] button').text()).toBe('staff.calls.passedOn')
    bar.unmount()

    useAuthStore().staff = { staffId: 'l', username: 'lena', role: 'lead', theme: 'system' }
    const lead = mount(WaiterCalls)
    await flushPromises()
    expect(lead.get('[data-test="waiter-call"] button').text()).toBe('staff.calls.onMyWay')
    lead.unmount()

    fetchMock.mockResolvedValue({ calls: [] })
    const none = mount(WaiterCalls)
    await flushPromises()
    expect(none.find('[data-test="waiter-calls"]').exists()).toBe(false)
    none.unmount()
  })
})
