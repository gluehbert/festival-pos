import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePaymentsStore } from '~/stores/payments'
import { useProductionStore } from '~/stores/production'
import { useMenuStore } from '~/stores/menu'
import { useTicketsStore } from '~/stores/tickets'
import { useStaffAdminStore } from '~/stores/staff-admin'
import { useAdminStore } from '~/stores/admin'
import { useCookie } from './setup/imports'
import { apiFailure } from './setup/api-error'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => vi.unstubAllGlobals())

const call = (i: number) => ({ path: fetchMock.mock.calls[i]![0] as string, opts: fetchMock.mock.calls[i]![1] as { method: string; body: unknown } })

describe('payments store', () => {
  it('records a payment', async () => {
    fetchMock.mockResolvedValue({ paymentId: 'p', totalCents: 900, ticketStatusAfter: 'paid' })
    const s = usePaymentsStore()
    await expect(s.createPayment('t-3', ['a'])).resolves.toMatchObject({ totalCents: 900 })
    expect(call(0)).toMatchObject({ path: '/api/payments', opts: { method: 'POST', body: { ticketKey: 't-3', orderItemIds: ['a'] } } })
    expect(s.lastReceipt?.paymentId).toBe('p')
  })

  it('exposes lock conflicts', async () => {
    const details = { lockedBy: 'x', expiresAt: new Date().toISOString() }
    fetchMock.mockRejectedValue(apiFailure(409, 'LOCK_CONFLICT', { message: 'locked', details }))
    const s = usePaymentsStore()
    await expect(s.createPayment('t-3', ['a'])).resolves.toBeNull()
    expect(s.lockConflict).toEqual(details)
    expect(s.error).toBe('locked')
  })

  it('keeps the idempotency key while the same payment is retried after no answer', async () => {
    const s = usePaymentsStore()
    const keyOf = (i: number) => (fetchMock.mock.calls[i]![1] as { headers: Record<string, string> }).headers['idempotency-key']
    // No answer at all: every automatic try is used up, then it is unconfirmed.
    vi.useFakeTimers()
    for (let i = 0; i < 5; i++) fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const first = s.createPayment('t-3', ['a'], { a: 1 })
    await vi.advanceTimersByTimeAsync(16000)
    await expect(first).resolves.toBeNull()
    vi.useRealTimers()
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(s.unconfirmed).toBe(true)
    fetchMock.mockResolvedValueOnce({ paymentId: 'p', totalCents: 400, ticketStatusAfter: 'open' })
    await s.createPayment('t-3', ['a'], { a: 1 })
    expect(keyOf(4)).toBe(keyOf(0))
    expect(keyOf(5)).toBe(keyOf(0))
    expect(s.unconfirmed).toBe(false)

    // After the answer, the next payment is a new one.
    fetchMock.mockResolvedValueOnce({ paymentId: 'q', totalCents: 400, ticketStatusAfter: 'paid' })
    await s.createPayment('t-3', ['a'], { a: 1 })
    expect(keyOf(6)).not.toBe(keyOf(5))

    // A clear "no" from the server also starts over.
    fetchMock.mockRejectedValueOnce(apiFailure(409, 'CONFLICT', { message: 'paid' }))
    await s.createPayment('t-3', ['b'])
    expect(s.unconfirmed).toBe(false)
    fetchMock.mockResolvedValueOnce({ paymentId: 'r', totalCents: 400, ticketStatusAfter: 'paid' })
    await s.createPayment('t-3', ['b'])
    expect(keyOf(8)).not.toBe(keyOf(7))
  })

  it('voids and refunds, reporting failures', async () => {
    const s = usePaymentsStore()
    fetchMock.mockResolvedValue({})
    await expect(s.voidItem('i1', 'cold')).resolves.toBe(true)
    await expect(s.refundItem('i2', 'cold')).resolves.toBe(true)
    expect(call(0)).toMatchObject({ path: '/api/order-items/i1/void', opts: { body: { reason: 'cold' } } })
    expect(call(1)).toMatchObject({ path: '/api/admin/order-items/i2/refund', opts: { body: { reason: 'cold' } } })
    fetchMock.mockRejectedValue(apiFailure(409, 'CONFLICT', { message: 'nope' }))
    await expect(s.refundItem('i2', 'cold')).resolves.toBe(false)
    expect(s.error).toBe('nope')
    fetchMock.mockRejectedValue(apiFailure(403, 'VOID_ADMIN_ONLY', { message: 'admin only' }))
    await expect(s.voidItem('i1', 'cold')).resolves.toBe(false)
    expect(s.errorCode).toBe('VOID_ADMIN_ONLY')
  })
})

describe('production store', () => {
  const item = (id: string) => ({ orderItemId: id, tableNo: 1, nameDe: 'P', nameEn: 'F', quantity: 1, productionStatus: 'pending', orderedAt: new Date().toISOString(), station: 'kitchen' })

  it('loads the queue and advances optimistically, rolling back on errors', async () => {
    fetchMock.mockResolvedValueOnce({ station: 'kitchen', lanes: [], items: [item('a'), item('b')] })
    const s = useProductionStore()
    await s.fetchQueue('kitchen')
    expect(call(0).path).toBe('/api/production/queue?station=kitchen')
    expect(s.queue).toHaveLength(2)

    fetchMock.mockResolvedValueOnce({})
    await s.advance('a', 'in_progress')
    expect(s.queue[0]!.productionStatus).toBe('in_progress')

    fetchMock.mockRejectedValueOnce({ statusCode: 409 })
    await expect(s.advance('b', 'done')).rejects.toBeTruthy()
    expect(s.queue.map((i) => i.orderItemId)).toEqual(['a', 'b'])
  })
})

describe('menu, tickets, staff-admin and admin stores', () => {
  it('menu groups items by category', async () => {
    fetchMock.mockResolvedValue({ eventId: 'e', items: [
      { id: '1', category: 'Beer' }, { id: '2', category: 'Snacks' }, { id: '3', category: 'Beer' },
    ] })
    const s = useMenuStore()
    await s.refresh()
    expect(s.eventId).toBe('e')
    expect([...s.byCategory.entries()].map(([k, v]) => [k, v.length])).toEqual([['Beer', 2], ['Snacks', 1]])
  })

  it('tickets list and detail', async () => {
    const s = useTicketsStore()
    fetchMock.mockResolvedValueOnce({ tickets: [{ ticketKey: 't-1' }] })
    await s.refresh({ status: 'open' })
    expect(call(0).path).toBe('/api/tickets?status=open')
    expect(s.tickets).toHaveLength(1)
    fetchMock.mockResolvedValueOnce({ ticketKey: 'w-1', items: [] })
    await s.load('w-1')
    expect(call(1).path).toBe('/api/tickets/w-1')
    expect(s.selected?.ticketKey).toBe('w-1')
  })

  it('staff admin keeps the list sorted and applies updates', async () => {
    const s = useStaffAdminStore()
    fetchMock.mockResolvedValueOnce({ staff: [{ id: '1', username: 'zoe' }] })
    await s.fetchAll()
    fetchMock.mockResolvedValueOnce({ id: '2', username: 'anna' })
    await s.create({ username: 'anna', role: 'waiter', pin: '1234' })
    expect(s.members.map((m) => m.username)).toEqual(['anna', 'zoe'])
    fetchMock.mockResolvedValueOnce({ id: '1', username: 'zoe', isActive: false })
    await s.update('1', { isActive: false })
    expect(call(2)).toMatchObject({ path: '/api/admin/staff/1', opts: { method: 'PATCH' } })
    expect(s.members.find((m) => m.id === '1')?.isActive).toBe(false)
  })

  it('admin activates one event and deactivates the rest', async () => {
    const s = useAdminStore()
    fetchMock.mockResolvedValueOnce({ events: [{ id: 'a', isActive: true }, { id: 'b', isActive: false }] })
    await s.fetchEvents()
    fetchMock.mockResolvedValueOnce({ id: 'b', isActive: true })
    await s.activateEvent('b')
    expect(s.events.map((e) => [e.id, e.isActive])).toEqual([['a', false], ['b', true]])
  })
})

describe('payments store retry', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const keys = () => fetchMock.mock.calls.map((c) => (c[1] as { headers: Record<string, string> }).headers['idempotency-key'])

  it('books once when the first two tries get no answer, with one key throughout', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ paymentId: 'p', totalCents: 400, ticketStatusAfter: 'paid' })
    const s = usePaymentsStore()
    const p = s.createPayment('t-3', ['a'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(s.sending).toEqual({ attempt: 1, max: 4 })
    await vi.advanceTimersByTimeAsync(2000)
    await expect(p).resolves.toMatchObject({ paymentId: 'p' })
    expect(new Set(keys()).size).toBe(1)
    expect(keys()).toHaveLength(3)
    expect(s.unconfirmed).toBe(false)
    expect(s.sending).toBeNull()
  })

  it('does not retry a lock conflict', async () => {
    fetchMock.mockRejectedValue(apiFailure(409, 'LOCK_CONFLICT', { message: 'locked', details: { lockedBy: 'x', expiresAt: 'e' } }))
    const s = usePaymentsStore()
    await expect(s.createPayment('t-3', ['a'])).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(s.lockConflict).not.toBeNull()
  })

  it('cancel stops further tries, keeps the key and marks the payment unconfirmed', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const s = usePaymentsStore()
    const p = s.createPayment('t-3', ['a'])
    await vi.advanceTimersByTimeAsync(1000)
    s.cancelSending()
    await vi.advanceTimersByTimeAsync(20000)
    await expect(p).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(s.unconfirmed).toBe(true)
    fetchMock.mockReset().mockResolvedValueOnce({ paymentId: 'p', totalCents: 400, ticketStatusAfter: 'paid' })
    await s.createPayment('t-3', ['a'])
    expect(keys()).toEqual([expect.any(String)])
  })
})
