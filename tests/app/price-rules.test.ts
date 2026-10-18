import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MenuItem from '~/components/guest/MenuItem.vue'
import OrderMenuRow from '~/components/staff/OrderMenuRow.vue'
import OrderConfirmation from '~/components/guest/OrderConfirmation.vue'
import PriceRuleForm from '~/components/admin/pricing/PriceRuleForm.vue'
import PriceRuleList from '~/components/admin/pricing/PriceRuleList.vue'
import PricePreview from '~/components/admin/pricing/PricePreview.vue'
import PriceRulesTable from '~/components/admin/reports/PriceRulesTable.vue'
import { useMenuStore } from '~/stores/menu'
import { useStaffOrderStore } from '~/stores/staffOrder'
import { usePriceRulesStore } from '~/stores/price-rules'
import { nextPromoEnd, priceChanges } from '~/utils/price-changes'
import type { MenuItemDto, Order } from '~/../server/lib/contracts/guest'
import type { AdminMenuItem } from '~/../server/lib/contracts/admin'
import type { PriceRuleDto } from '~/../server/lib/contracts/pricing'
import { useCookie } from './setup/imports'

const END = '2026-07-10T16:00:00.000Z' // 18:00 Berlin
const beer: MenuItemDto = {
  id: '00000000-0000-4000-8000-000000000001', nameDe: 'Bier', nameEn: 'Beer', priceCents: 300, regularPriceCents: 350,
  promo: { name: 'Happy Hour', endsAt: END }, depositCents: 200, stock: null, category: 'Drinks', subcategory: null,
  station: 'bar', isAvailable: true, sortOrder: 0,
}
const plain: MenuItemDto = { ...beer, id: '00000000-0000-4000-8000-000000000002', nameDe: 'Wasser', priceCents: 200, regularPriceCents: 200, promo: null }

const order = (unitPriceCents: number, priceRuleName: string | null): Order => ({
  orderId: '00000000-0000-4000-8000-0000000000aa', tableNo: 3, tableBalanceCents: 500,
  items: [{
    orderItemId: '00000000-0000-4000-8000-0000000000bb', menuItemId: beer.id, quantity: 1, unitPriceCents, depositCents: 200,
    regularPriceCents: priceRuleName ? 350 : null, priceRuleName, note: null, productionStatus: 'pending', paymentStatus: 'unpaid',
  }],
})

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Promotional prices — guest menu and waiter pad', () => {
  it('shows the old price struck through and "Happy Hour until 18:00"', () => {
    for (const w of [mount(MenuItem, { props: { item: beer } }), mount(OrderMenuRow, { props: { item: beer, quantity: 0 } })]) {
      expect(w.find('[data-test="regular-price"]').text()).toContain('3.50')
      expect(w.find('[data-test="price"]').text()).toContain('3.00')
      expect(w.find('[data-test="promo-hint"]').text()).toBe('common.promo.until:{"name":"Happy Hour","time":"18:00"}')
    }
    const w = mount(MenuItem, { props: { item: plain } })
    expect(w.find('[data-test="regular-price"]').exists()).toBe(false)
    expect(w.find('[data-test="promo-hint"]').exists()).toBe(false)
    expect(w.find('[data-test="price"]').text()).toContain('2.00')
  })

  it('finds booked prices that differ from the cart, and the next promotion end', () => {
    expect(priceChanges([{ menuItem: beer }], order(300, 'Happy Hour').items)).toEqual([])
    expect(priceChanges([{ menuItem: beer }, { menuItem: beer }], order(350, null).items)).toEqual([
      { menuItemId: beer.id, nameDe: 'Bier', nameEn: 'Beer', shownCents: 300, bookedCents: 350, ruleName: null },
    ])
    expect(nextPromoEnd([plain, beer, { ...beer, promo: { name: 'x', endsAt: '2026-07-10T15:00:00.000Z' } }])).toBe(Date.parse('2026-07-10T15:00:00.000Z'))
    expect(nextPromoEnd([plain])).toBeNull()
  })

  it('tells the guest which prices were booked instead', () => {
    const changes = priceChanges([{ menuItem: beer }], order(350, null).items)
    const w = mount(OrderConfirmation, { props: { order: order(350, null), changes } })
    expect(w.find('[data-test="price-change"]').exists()).toBe(true)
    expect(w.find('[data-test="price-change-line"]').text()).toContain('"booked":"€3.50')
    expect(mount(OrderConfirmation, { props: { order: order(300, 'Happy Hour'), changes: [] } }).find('[data-test="price-change"]').exists()).toBe(false)
  })

  it('reports changed prices after sending the pad and takes new menu prices', async () => {
    const pad = useStaffOrderStore()
    pad.add(beer)
    expect(pad.totalCents).toBe(500)
    expect(pad.valueCents).toBe(350) // staff-meal goods value at menu price
    fetchMock.mockResolvedValueOnce(order(350, null))
    const res = await pad.submit('staff_table', 3)
    expect(res?.priceChanges).toEqual([expect.objectContaining({ shownCents: 300, bookedCents: 350 })])
    // The request carries no price: the server prices the order.
    expect(JSON.stringify(fetchMock.mock.calls[0]![1].body)).not.toContain('300')

    pad.add(beer)
    pad.syncWithMenu([{ ...beer, priceCents: 350, promo: null }])
    expect(pad.totalCents).toBe(550)
  })

  it('reloads the menu when the running promotion ends', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-10T15:59:00Z'))
    fetchMock.mockResolvedValueOnce({ eventId: 'e', items: [beer] }).mockResolvedValueOnce({ eventId: 'e', items: [{ ...beer, priceCents: 350, promo: null }] })
    const menu = useMenuStore()
    await menu.refresh()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(menu.items[0]!.priceCents).toBe(350)
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

const items = [
  { ...plain, id: beer.id, nameDe: 'Bier', category: 'Drinks', priceCents: 350, eventId: 'e', createdAt: END },
  { ...plain, id: '00000000-0000-4000-8000-000000000003', nameDe: 'Bratwurst', category: 'Food', priceCents: 400, eventId: 'e', createdAt: END },
] as AdminMenuItem[]

const rule: PriceRuleDto = {
  id: '00000000-0000-4000-8000-0000000000cc', eventId: 'e', name: 'Happy Hour', isActive: true, startTime: '17:00', endTime: '18:00',
  weekdays: [1, 2, 3, 4, 5, 6, 7], validFrom: null, validTo: null, menuItemIds: [beer.id], categories: [], kind: 'fixed', value: 300,
  createdAt: END, updatedAt: END, runningUntil: END,
}

describe('Promotional prices — admin', () => {
  it('builds a rule from the form: times, days, articles, euro value', async () => {
    const w = mount(PriceRuleForm, { props: { items } })
    await w.find('[data-test="price-rule-name"]').setValue(' Restposten ')
    await w.find('[data-test="price-rule-start"]').setValue('22:00')
    await w.find('[data-test="price-rule-end"]').setValue('02:00')
    expect(w.text()).toContain('admin.pricing.overnightHint')
    await w.find('[data-test="price-rule-day-1"]').trigger('click')
    expect(w.find('[data-test="price-rule-day-1"]').attributes('aria-pressed')).toBe('false')
    await w.find('[data-test="price-rule-value"]').setValue('2,00')
    await w.find('form').trigger('submit')
    expect(w.find('[data-test="price-rule-error"]').text()).toBe('admin.pricing.errors.targets')

    // Bratwurst ticked, then its whole category: the category covers it.
    await w.findAll('[data-test="price-rule-item"]')[1]!.setValue(true)
    await w.findAll('[data-test="price-rule-category"]')[1]!.setValue(true)
    await w.find('form').trigger('submit')
    expect(w.emitted('submit')![0]![0]).toEqual({
      name: 'Restposten', isActive: true, startTime: '22:00', endTime: '02:00', weekdays: [2, 3, 4, 5, 6, 7],
      validFrom: null, validTo: null, categories: ['Food'], menuItemIds: [], kind: 'fixed', value: 200,
    })
  })

  it('checks percent values and edits an existing rule', async () => {
    const w = mount(PriceRuleForm, { props: { items, rule } })
    expect((w.find('[data-test="price-rule-value"]').element as HTMLInputElement).value).toBe('3,00')
    await w.find('[data-test="price-rule-kind"]').setValue('percent')
    await w.find('[data-test="price-rule-value"]').setValue('150')
    await w.find('form').trigger('submit')
    expect(w.find('[data-test="price-rule-error"]').text()).toBe('admin.pricing.errors.value.percent')
    await w.find('[data-test="price-rule-value"]').setValue('20')
    await w.find('form').trigger('submit')
    expect(w.emitted('submit')![0]![0]).toMatchObject({ kind: 'percent', value: 20, menuItemIds: [beer.id] })
  })

  it('lists rules with their state and asks before deleting', async () => {
    const w = mount(PriceRuleList, { props: { rules: [rule, { ...rule, id: 'x', isActive: false, runningUntil: null }], items } })
    expect(w.findAll('[data-test="price-rule-running"]')).toHaveLength(1)
    expect(w.text()).toContain('Beer')
    await w.find('[data-test="price-rule-toggle"]').trigger('click')
    expect(w.emitted('toggle')![0]![0]).toEqual(rule)
    await w.find('[data-test="price-rule-delete"]').trigger('click')
    expect(w.emitted('remove')).toBeUndefined()
    await w.find('[data-test="price-rule-delete-confirm"]').trigger('click')
    expect(w.emitted('remove')![0]![0]).toEqual(rule)
  })

  it('shows what is cheaper right now and the report per promotion', () => {
    const preview = mount(PricePreview, { props: { rows: [{ menuItemId: beer.id, nameDe: 'Bier', nameEn: 'Beer', regularPriceCents: 350, priceCents: 300, ruleName: 'Happy Hour', endsAt: END }] } })
    expect(preview.findAll('[data-test="price-preview-row"]')).toHaveLength(1)
    expect(mount(PricePreview, { props: { rows: [] } }).text()).toContain('admin.pricing.previewEmpty')

    const row = { ruleId: rule.id, ruleName: 'Happy Hour', menuItemId: beer.id, nameDe: 'Bier', nameEn: 'Beer', quantity: 3, totalCents: 900, discountCents: 150 }
    const table = mount(PriceRulesTable, { props: { rows: [row, { ...row, menuItemId: 'w', nameDe: 'Wein', quantity: 1, totalCents: 400, discountCents: 100 }] } })
    expect(table.findAll('[data-test="price-rule-report-group"]')).toHaveLength(1)
    expect(table.findAll('[data-test="price-rule-report-row"]')).toHaveLength(2)
    expect(table.text()).toContain('13.00')
    expect(mount(PriceRulesTable, { props: { rows: [] } }).text()).toContain('admin.reports.empty')
  })

  it('store loads, switches and deletes rules and reloads the preview', async () => {
    const list = { eventId: 'e', now: END, rules: [rule], preview: [] }
    fetchMock.mockResolvedValue(list)
    const store = usePriceRulesStore()
    await store.fetch('e')
    expect(store.rules).toEqual([rule])
    await store.update(rule.id, { isActive: false })
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/price-rules/${rule.id}`, expect.objectContaining({ method: 'PATCH', body: { isActive: false } }))
    await store.remove(rule.id)
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/price-rules/${rule.id}`, expect.objectContaining({ method: 'DELETE' }))
    await store.create('e', { name: 'x', startTime: '17:00', endTime: '18:00', categories: ['Food'], kind: 'percent', value: 10 })
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/events/e/price-rules', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/admin/events/e/price-rules' && (c[1]?.method ?? 'GET') === 'GET')).toHaveLength(4)
  })
})
