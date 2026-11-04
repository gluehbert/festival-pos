import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { useCashStore } from '~/stores/cash'
import { useAuthStore } from '~/stores/auth'
import CashPage from '~/pages/staff/cash.vue'
import { parseEuroInput } from '~/utils/euro-input'
import CashBreakdown from '~/components/staff/CashBreakdown.vue'
import CashSessionsTable from '~/components/admin/reports/CashSessionsTable.vue'
import type { CashSessionDto } from '~/../server/lib/contracts/cash'
import { useCookie } from './setup/imports'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => vi.unstubAllGlobals())

const session: CashSessionDto = {
  id: '00000000-0000-4000-8000-000000000001',
  staffId: '00000000-0000-4000-8000-000000000002',
  username: 'anna',
  openedAt: '2026-06-14T16:00:00.000Z',
  closedAt: null,
  openingCents: 5000,
  collectedCents: 12_300,
  tipCents: 0,
  refundedCents: 400,
  expectedCents: 16_900,
  countedCents: null,
  differenceCents: null,
  note: null,
}

describe('euro input', () => {
  it('parses German and English amounts into cents', () => {
    expect(parseEuroInput('150')).toBe(15_000)
    expect(parseEuroInput('12,5')).toBe(1250)
    expect(parseEuroInput(' 1.234,56 € ')).toBe(123_456)
    expect(parseEuroInput('0.07')).toBe(7)
    expect(parseEuroInput('')).toBeNull()
    expect(parseEuroInput('-3')).toBeNull()
    expect(parseEuroInput('1,234')).toBeNull()
  })
})

describe('cash store', () => {
  it('remembers the ended event whose drawer is still open', async () => {
    const s = useCashStore()
    fetchMock.mockResolvedValueOnce({ session, otherEventName: 'Summer festival' })
    await s.load()
    expect(s.otherEventName).toBe('Summer festival')
    fetchMock.mockResolvedValueOnce({ ...session, closedAt: '2026-06-14T23:00:00.000Z', countedCents: 16_900, differenceCents: 0 })
    await s.close(16_900)
    expect(s.otherEventName).toBeNull()
  })

  it('loads, opens and closes the drawer', async () => {
    const s = useCashStore()
    fetchMock.mockResolvedValueOnce({ session: null })
    await s.load()
    expect(s.session).toBeNull()

    fetchMock.mockResolvedValueOnce(session)
    expect(await s.open(5000)).toBe(true)
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: 'POST', body: { openingCents: 5000 } })
    expect(s.session?.username).toBe('anna')

    fetchMock.mockResolvedValueOnce({ ...session, closedAt: '2026-06-14T23:00:00.000Z', countedCents: 16_800, differenceCents: -100 })
    expect(await s.close(16_800, 'Coin')).toBe(true)
    expect(fetchMock.mock.calls[2]![0]).toBe('/api/cash/session/close')
    expect(s.session).toBeNull()
    expect(s.lastClosed?.differenceCents).toBe(-100)
  })

  it('keeps the server message on failure', async () => {
    const s = useCashStore()
    fetchMock.mockRejectedValueOnce({ statusCode: 409, data: { message: 'Cash drawer is already open' } })
    expect(await s.open(0)).toBe(false)
    expect(s.error).toBe('Cash drawer is already open')
  })
})

describe('cash components', () => {
  it('shows expected and a live difference while counting', () => {
    const w = mount(CashBreakdown, { props: { session, countedCents: 16_850 } })
    expect(w.find('[data-test="cash-expected"]').text()).toContain('169.00')
    const diff = w.find('[data-test="cash-difference"]')
    expect(diff.text()).toContain('staff.cash.diffShort')
    expect(diff.classes()).toContain('text-rose-700')
    expect(mount(CashBreakdown, { props: { session } }).find('[data-test="cash-difference"]').exists()).toBe(false)
  })

  it('lists closed and open drawers for the admin', () => {
    const rows = [session, { ...session, id: '00000000-0000-4000-8000-000000000003', closedAt: '2026-06-14T23:00:00.000Z', countedCents: 17_000, differenceCents: 100 }]
    const w = mount(CashSessionsTable, { props: { rows } })
    expect(w.findAll('[data-test="cash-session-row"]')).toHaveLength(2)
    expect(w.text()).toContain('admin.reports.cash.stillOpen')
    expect(w.text()).toContain('+€1.00')
  })
})

describe('cash page', () => {
  it('shows the open form only once it knows there is no drawer', async () => {
    useAuthStore().staff = { staffId: 's', username: 'alice', role: 'waiter', theme: 'system' }
    let answer!: (v: unknown) => void
    fetchMock.mockReturnValueOnce(new Promise((r) => { answer = r }))
    const w = mount(CashPage)
    expect(w.find('[data-test="cash-opening"]').exists()).toBe(false)
    answer({ session: null, otherEventName: null })
    await flushPromises()
    expect(w.find('[data-test="cash-opening"]').exists()).toBe(true)
  })
})

describe('first cashing with drawers switched on', () => {
  const paid = { paymentId: 'p', totalCents: 700, tipCents: 0, ticketStatusAfter: 'paid', receipt: null }
  const url = (i: number) => String(fetchMock.mock.calls[i]![0])

  it('asks for the float, opens the drawer and then books the payment', async () => {
    const { usePaymentsStore } = await import('~/stores/payments')
    const CashOpenPrompt = (await import('~/components/staff/CashOpenPrompt.vue')).default
    const cash = useCashStore()
    const w = mount(CashOpenPrompt, { global: { stubs: { NuxtLink: true } } })
    cash.required = true
    fetchMock.mockImplementation(async (u: string, opts?: { method?: string }) => {
      if (u === '/api/cash/session' && opts?.method === 'POST') return session
      if (u === '/api/cash/session') return { session: null, otherEventName: null, required: true }
      return paid
    })

    const paying = usePaymentsStore().createPayment('t-4', ['i1'])
    await flushPromises()
    expect(cash.prompting).toBe(true)
    expect(w.text()).toContain('staff.cash.promptTitle')
    // Nothing booked while the float is not counted.
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/payments')).toBe(false)

    await w.find('[data-test="cash-prompt-opening"]').setValue('50')
    await w.find('[data-test="confirm-ok"]').trigger('click')
    expect(await paying).toEqual(paid)
    expect(url(fetchMock.mock.calls.length - 1)).toBe('/api/payments')
    expect(cash.session?.openingCents).toBe(5000)
    expect(cash.prompting).toBe(false)
  })

  it('cancelling books nothing; with drawers off nobody is asked', async () => {
    const { usePaymentsStore } = await import('~/stores/payments')
    const cash = useCashStore()
    cash.required = true
    fetchMock.mockResolvedValueOnce({ session: null, otherEventName: null, required: true })
    const paying = usePaymentsStore().createPayment('t-4', ['i1'])
    await flushPromises()
    cash.finishPrompt(false)
    expect(await paying).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    cash.required = false
    fetchMock.mockResolvedValueOnce(paid)
    expect(await usePaymentsStore().createPayment('t-4', ['i1'])).toEqual(paid)
    expect(cash.prompting).toBe(false)
  })
})
