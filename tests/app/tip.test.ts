import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PaymentSummary from '~/components/staff/PaymentSummary.vue'
import PaymentDone from '~/components/staff/PaymentDone.vue'
import ReceiptPrint from '~/components/staff/ReceiptPrint.vue'
import CashBreakdown from '~/components/staff/CashBreakdown.vue'
import TipsTable from '~/components/admin/reports/TipsTable.vue'
import PerStaffTable from '~/components/admin/reports/PerStaffTable.vue'
import { usePaymentsStore } from '~/stores/payments'
import { roundUpTipCents } from '~/utils/tip'
import { useCookie } from './setup/imports'
import type { CashSessionDto } from '~/../server/lib/contracts/cash'
import type { Receipt } from '~/../server/lib/contracts/staff'

const pay = (w: ReturnType<typeof mount>) => w.find('[data-test="pay-submit"]')
const mountSummary = (selectedCents: number) => mount(PaymentSummary, { props: { selectedCents, totalCents: selectedCents } })

async function book(w: ReturnType<typeof mount>) {
  await pay(w).trigger('click')
  vi.advanceTimersByTime(400)
  await w.vm.$nextTick()
  await pay(w).trigger('click')
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('roundUpTipCents', () => {
  it('rounds up to the next euro, above €20 to the next €5, and is 0 for full amounts', () => {
    expect(roundUpTipCents(1750)).toBe(50)
    expect(roundUpTipCents(2310)).toBe(190)
    expect(roundUpTipCents(2000)).toBe(0)
    expect(roundUpTipCents(2001)).toBe(499)
    expect(roundUpTipCents(2500)).toBe(0)
    expect(roundUpTipCents(1800)).toBe(0)
  })
})

describe('PaymentSummary — tip', () => {
  it('"Change as tip" turns the change into tip and the change to 0', async () => {
    const w = mountSummary(1750)
    expect(w.find('[data-test="tip-change"]').exists()).toBe(false)
    await w.find('[data-test="pay-given"]').setValue('20')
    expect(w.find('[data-test="pay-change"]').text()).toContain('2.50')
    await w.find('[data-test="tip-change"]').trigger('click')
    expect((w.find('[data-test="tip-input"]').element as HTMLInputElement).value).toBe('2,50')
    expect(w.find('[data-test="pay-change"]').text()).toContain('0.00')
    expect(w.find('[data-test="tip-line"]').text()).toMatch(/17\.50.*2\.50.*20\.00/s)
    expect(pay(w).text()).toMatch(/€20\.00/)
    await book(w)
    expect(w.emitted('submit')).toEqual([[{ givenCents: 2000, tipCents: 250 }]])
  })

  it('"Round up" rounds the bill up: 17.50 → 18.00 and 23.10 → 25.00; inactive for full amounts', async () => {
    const w = mountSummary(1750)
    await w.find('[data-test="tip-round"]').trigger('click')
    expect((w.find('[data-test="tip-input"]').element as HTMLInputElement).value).toBe('0,50')
    await w.setProps({ selectedCents: 2310, totalCents: 2310 })
    await w.find('[data-test="tip-round"]').trigger('click')
    expect((w.find('[data-test="tip-input"]').element as HTMLInputElement).value).toBe('1,90')
    expect(w.find('[data-test="tip-line"]').text()).toMatch(/23\.10.*1\.90.*25\.00/s)
    await w.setProps({ selectedCents: 1800, totalCents: 1800 })
    expect(w.find('[data-test="tip-round"]').attributes('disabled')).toBeDefined()
  })

  it('takes a free amount with comma, reduces the change by it and resets with the selection', async () => {
    const w = mountSummary(1750)
    await w.find('[data-test="pay-given"]').setValue('30')
    await w.find('[data-test="tip-input"]').setValue('1,5')
    expect(w.find('[data-test="pay-change"]').text()).toContain('11.00')
    expect(pay(w).text()).toMatch(/€19\.00/)
    await w.setProps({ selectedCents: 900 })
    expect((w.find('[data-test="tip-input"]').element as HTMLInputElement).value).toBe('')
  })

  it('without a tip nothing changes: no summary line, tip 0', async () => {
    const w = mountSummary(1750)
    expect(w.find('[data-test="tip-line"]').exists()).toBe(false)
    await book(w)
    expect(w.emitted('submit')).toEqual([[{ givenCents: null, tipCents: 0 }]])
  })

  it('asks once more for a tip over €50 or over the bill', async () => {
    const w = mountSummary(10_000)
    await w.find('[data-test="tip-input"]').setValue('60')
    await pay(w).trigger('click')
    expect(pay(w).text()).toContain('staff.pay.tip.confirm')
    expect(pay(w).text()).toMatch(/€60\.00/)
    vi.advanceTimersByTime(400)
    await w.vm.$nextTick()
    await pay(w).trigger('click')
    expect(w.emitted('submit')).toEqual([[{ givenCents: null, tipCents: 6000 }]])

    const small = mountSummary(500)
    await small.find('[data-test="tip-input"]').setValue('6')
    await pay(small).trigger('click')
    expect(pay(small).text()).toContain('staff.pay.tip.confirm')

    const normal = mountSummary(500)
    await normal.find('[data-test="tip-input"]').setValue('1')
    await pay(normal).trigger('click')
    expect(pay(normal).text()).toContain('staff.pay.confirm')
  })

  it('no tip block for a selection of only free items', () => {
    const w = mountSummary(0)
    expect(w.find('[data-test="tip-input"]').exists()).toBe(false)
  })
})

describe('PaymentDone — tip', () => {
  it('shows the tip next to the amount', () => {
    const stubs = { NuxtLink: true }
    const w = mount(PaymentDone, { props: { amountCents: 1750, tipCents: 250, changeCents: null }, global: { stubs } })
    expect(w.find('[data-test="pay-done-tip"]').text()).toContain('2.50')
    const none = mount(PaymentDone, { props: { amountCents: 1750, tipCents: 0, changeCents: null }, global: { stubs } })
    expect(none.find('[data-test="pay-done-tip"]').exists()).toBe(false)
  })
})

describe('payments store — tip', () => {
  it('sends the tip only when there is one and starts a new key when it changes', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
    const s = usePaymentsStore()
    const sent = (i: number) => fetchMock.mock.calls[i]![1] as { body: Record<string, unknown>; headers: Record<string, string> }
    // No answer at all (all automatic tries used up): the key stays pending.
    for (let i = 0; i < 5; i++) fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const first = s.createPayment('t-3', ['a'], undefined, 250)
    await vi.advanceTimersByTimeAsync(16000)
    await first
    expect(sent(0).body).toMatchObject({ tipCents: 250 })
    fetchMock.mockResolvedValueOnce({ paymentId: 'p', totalCents: 400, tipCents: 300, ticketStatusAfter: 'open' })
    await s.createPayment('t-3', ['a'], undefined, 300)
    expect(sent(5).body).toMatchObject({ tipCents: 300 })
    expect(sent(5).headers['idempotency-key']).not.toBe(sent(0).headers['idempotency-key'])
    fetchMock.mockResolvedValueOnce({ paymentId: 'q', totalCents: 400, tipCents: 0, ticketStatusAfter: 'paid' })
    await s.createPayment('t-3', ['b'])
    expect(sent(6).body).not.toHaveProperty('tipCents')
    vi.unstubAllGlobals()
  })
})

const receipt: Receipt = {
  paymentId: '00000000-0000-4000-8000-000000000009',
  eventName: 'Summer festival',
  tableNo: 12,
  lines: [{ nameDe: 'Bier', nameEn: 'Beer', quantity: 1, unitPriceCents: 1750, depositCents: 0, note: null }],
  totalCents: 1750,
  tipCents: 250,
  depositCents: 0,
  paidAt: '2026-06-14T18:30:00.000Z',
  staffUsername: 'anna',
}

describe('receipt, drawer and reports — tip', () => {
  it('receipt shows tip and grand total only when there is a tip', () => {
    const w = mount(ReceiptPrint, { props: { receipt } })
    expect(w.find('[data-test="receipt-tip"]').text()).toContain('2.50')
    expect(w.find('[data-test="receipt-grand-total"]').text()).toContain('20.00')
    const none = mount(ReceiptPrint, { props: { receipt: { ...receipt, tipCents: 0 } } })
    expect(none.find('[data-test="receipt-tip"]').exists()).toBe(false)
    expect(none.find('[data-test="receipt-grand-total"]').exists()).toBe(false)
  })

  it('cash breakdown has its own tip row and the explaining sentence', () => {
    const session: CashSessionDto = {
      id: '00000000-0000-4000-8000-000000000001', staffId: '00000000-0000-4000-8000-000000000002', username: 'anna',
      openedAt: '2026-06-14T16:00:00.000Z', closedAt: null, openingCents: 5000, collectedCents: 12_300, tipCents: 450,
      refundedCents: 400, depositReturnedCents: 0, expectedCents: 17_350, countedCents: null, differenceCents: null, note: null,
    }
    const w = mount(CashBreakdown, { props: { session } })
    expect(w.find('[data-test="cash-tip"]').text()).toContain('4.50')
    expect(w.text()).toContain('staff.cash.tipHint')
  })

  it('tips table lists waiters and the total row; per-staff table has a tip column', () => {
    const w = mount(TipsTable, {
      props: { rows: [
        { staffId: '00000000-0000-4000-8000-000000000002', username: 'anna', paymentCount: 2, tipCents: 200 },
        { staffId: null, username: null, paymentCount: 2, tipCents: 200 },
      ] },
    })
    const rows = w.findAll('tbody tr')
    expect(rows[0]!.text()).toContain('anna')
    expect(rows[1]!.text()).toContain('admin.reports.sections.tipsTotal')
    expect(rows[1]!.text()).toContain('2.00')
    const staff = mount(PerStaffTable, {
      props: { rows: [{ staffId: '00000000-0000-4000-8000-000000000002', username: 'anna', paymentCount: 2, totalCents: 800, refundedCents: 0, tipCents: 350 }] },
    })
    expect(staff.text()).toContain('3.50')
  })
})
