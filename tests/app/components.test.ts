import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import VoidDialog from '~/components/staff/VoidDialog.vue'
import PaymentSummary from '~/components/staff/PaymentSummary.vue'
import PaymentDone from '~/components/staff/PaymentDone.vue'
import { lockMessageKey, lockSecondsLeft } from '~/composables/usePaySelection'
import QueueItem from '~/components/production/QueueItem.vue'
import StaffForm from '~/components/admin/StaffForm.vue'
import CartSummary from '~/components/guest/CartSummary.vue'
import MenuItem from '~/components/guest/MenuItem.vue'
import OrderStatus from '~/components/guest/OrderStatus.vue'
import { useCartStore } from '~/stores/cart'
import type { ProductionQueueItem } from '~/../server/lib/contracts/production'
import type { MenuItemDto, SessionOrders } from '~/../server/lib/contracts/guest'

describe('VoidDialog', () => {
  it('needs a reason of at least 3 characters and emits it trimmed', async () => {
    const w = mount(VoidDialog, { props: { open: true, itemName: '1 × Beer' } })
    const confirm = w.findAll('button')[1]!
    await w.find('textarea').setValue('  x ')
    expect(confirm.attributes('disabled')).toBeDefined()
    await w.find('textarea').setValue('  too cold  ')
    expect(confirm.attributes('disabled')).toBeUndefined()
    await confirm.trigger('click')
    expect(w.emitted('confirm')).toEqual([['too cold']])
    await w.findAll('button')[0]!.trigger('click')
    expect(w.emitted('cancel')).toHaveLength(1)
  })

  it('uses refund wording and shows the cash hint in refund mode', () => {
    const w = mount(VoidDialog, { props: { open: true, itemName: 'x', refund: true } })
    expect(w.text()).toContain('staff.refund.title')
    expect(w.text()).toContain('staff.refund.hint')
    expect(w.attributes('aria-labelledby')).toBe('void-title')
  })

  it('turns known server codes into a readable message, else shows the raw error', () => {
    const coded = mount(VoidDialog, { props: { open: true, itemName: 'x', error: 'Finished items…', errorCode: 'VOID_ADMIN_ONLY' } })
    expect(coded.find('[role="alert"]').text()).toBe('staff.void.errorAdminOnly')
    const raw = mount(VoidDialog, { props: { open: true, itemName: 'x', error: 'boom', errorCode: 'WHATEVER' } })
    expect(raw.find('[role="alert"]').text()).toBe('boom')
    expect(mount(VoidDialog, { props: { open: true, itemName: 'x' } }).find('[role="alert"]').exists()).toBe(false)
  })

  it('renders nothing when closed', () => {
    expect(mount(VoidDialog, { props: { open: false, itemName: 'x' } }).find('[role="dialog"]').exists()).toBe(false)
  })
})

describe('PaymentSummary', () => {
  const pay = (w: ReturnType<typeof mount>) => w.find('[data-test="pay-submit"]')

  it('shows formatted amounts and only enables paying a positive selection', async () => {
    const w = mount(PaymentSummary, { props: { selectedCents: 0, totalCents: 1650 } })
    expect(w.text()).toMatch(/€16\.50/)
    expect(pay(w).attributes('disabled')).toBeDefined()
    await w.setProps({ selectedCents: 450 })
    expect(pay(w).attributes('disabled')).toBeUndefined()
    await w.setProps({ disabled: true })
    expect(pay(w).attributes('disabled')).toBeDefined()
  })

  it('closes a selection of only 0-€ items without payment, still with two taps', async () => {
    vi.useFakeTimers()
    const w = mount(PaymentSummary, { props: { selectedCents: 0, totalCents: 0, selectedUnits: 0 } })
    expect(pay(w).attributes('disabled')).toBeDefined()
    await w.setProps({ selectedUnits: 2 })
    expect(pay(w).attributes('disabled')).toBeUndefined()
    expect(pay(w).text()).toBe('staff.pay.submitFree')
    await pay(w).trigger('click')
    vi.advanceTimersByTime(500)
    await w.vm.$nextTick()
    await pay(w).trigger('click')
    expect(w.emitted('submit')).toEqual([[{ givenCents: null, tipCents: 0 }]])
    await w.setProps({ selectedCents: 300 })
    expect(pay(w).text()).toContain('staff.pay.submit')
    vi.useRealTimers()
  })

  it('books only on the second tap and passes the given amount', async () => {
    vi.useFakeTimers()
    const w = mount(PaymentSummary, { props: { selectedCents: 1800, totalCents: 5850 } })
    expect(pay(w).text()).toContain('staff.pay.submit')
    expect(pay(w).text()).toMatch(/€18\.00/)
    await w.find('[data-test="pay-given"]').setValue('20')
    await pay(w).trigger('click')
    expect(w.emitted('submit')).toBeUndefined()
    expect(pay(w).text()).toContain('staff.pay.confirm')
    // An accidental double tap does not book.
    expect(pay(w).attributes('disabled')).toBeDefined()
    vi.advanceTimersByTime(400)
    await w.vm.$nextTick()
    await pay(w).trigger('click')
    expect(w.emitted('submit')).toEqual([[{ givenCents: 2000, tipCents: 0 }]])
    expect(pay(w).text()).toContain('staff.pay.submit')
    vi.useRealTimers()
  })

  it('disarms on cancel, after a while and when the selection changes', async () => {
    vi.useFakeTimers()
    const w = mount(PaymentSummary, { props: { selectedCents: 450, totalCents: 450 } })
    await pay(w).trigger('click')
    await w.find('[data-test="pay-cancel"]').trigger('click')
    expect(pay(w).text()).toContain('staff.pay.submit')
    await pay(w).trigger('click')
    vi.advanceTimersByTime(6000)
    await w.vm.$nextTick()
    expect(pay(w).text()).toContain('staff.pay.submit')
    await pay(w).trigger('click')
    await w.setProps({ selectedCents: 900 })
    expect(pay(w).text()).toContain('staff.pay.submit')
    expect(w.emitted('submit')).toBeUndefined()
    vi.useRealTimers()
  })
})

describe('PaymentDone', () => {
  it('shows amount, change and the way back', () => {
    const w = mount(PaymentDone, { props: { amountCents: 4050, changeCents: 950 }, global: { stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } })
    expect(w.find('[data-test="pay-done-amount"]').text()).toContain('40.50')
    expect(w.find('[data-test="pay-done-change"]').text()).toContain('9.50')
    expect(w.find('[data-test="pay-done-overview"]').attributes('href')).toBe('/staff')
    const noChange = mount(PaymentDone, { props: { amountCents: 100, changeCents: null }, global: { stubs: { NuxtLink: true } } })
    expect(noChange.find('[data-test="pay-done-change"]').exists()).toBe(false)
  })
})

describe('lockSecondsLeft', () => {
  it('counts down to the server expiry, capped and safe', () => {
    const now = Date.parse('2026-10-13T12:00:00Z')
    expect(lockSecondsLeft('2026-10-13T12:00:42Z', now)).toBe(42)
    expect(lockSecondsLeft('2026-10-13T11:59:00Z', now)).toBe(0)
    expect(lockSecondsLeft('2026-10-13T13:00:00Z', now)).toBe(300)
    expect(lockSecondsLeft('nope', now)).toBe(60)
  })

  it('picks the own-lock text when the lock is held by the same staff member', () => {
    expect(lockMessageKey('s1', 's1')).toBe('staff.pay.lockedSelf')
    expect(lockMessageKey('s2', 's1')).toBe('staff.pay.locked')
  })

})

describe('QueueItem', () => {
  const item: ProductionQueueItem = {
    orderItemId: '00000000-0000-4000-8000-000000000001',
    tableNo: 7,
    nameDe: 'Pommes',
    nameEn: 'Fries',
    quantity: 2,
    productionStatus: 'pending',
    orderedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  } as ProductionQueueItem

  it('advances pending -> in_progress -> done and flags old items', async () => {
    const w = mount(QueueItem, { props: { item } })
    expect(w.text()).toContain('2 × Fries')
    expect(w.find('header p:last-child').classes()).toContain('text-rose-700')
    await w.find('button').trigger('click')
    expect(w.emitted('advance')).toEqual([['in_progress']])
    await w.setProps({ item: { ...item, productionStatus: 'in_progress' } })
    expect(w.find('button').text()).toBe('production.done')
    await w.find('button').trigger('click')
    expect(w.emitted('advance')![1]).toEqual(['done'])
    expect(w.text()).toContain('production.preparing')
  })

  it('finishes open items in one tap at the bar', async () => {
    const w = mount(QueueItem, { props: { item, oneStep: true } })
    expect(w.find('button').text()).toBe('production.done')
    await w.find('button').trigger('click')
    expect(w.emitted('advance')).toEqual([['done']])
  })
})

describe('StaffForm', () => {
  it('asks admins for a password and everyone else for a PIN', async () => {
    const w = mount(StaffForm)
    await w.find('input[autocomplete="off"]').setValue('anna')
    await w.find('input[autocomplete="new-password"]').setValue('4711')
    await w.find('form').trigger('submit')
    expect(w.emitted('submit')![0]).toEqual([{ username: 'anna', role: 'waiter', pin: '4711' }])

    await w.find('select').setValue('admin')
    expect(w.find('input[autocomplete="new-password"]').attributes('type')).toBe('password')
    await w.find('input[autocomplete="off"]').setValue('chef')
    await w.find('input[autocomplete="new-password"]').setValue('sehr-geheim-123')
    await w.find('form').trigger('submit')
    expect(w.emitted('submit')![1]).toEqual([{ username: 'chef', role: 'admin', password: 'sehr-geheim-123' }])
  })
})

describe('CartSummary', () => {
  it('lists cart lines and submits', async () => {
    const cart = useCartStore()
    cart.add({ id: 'f', nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, category: 'Snacks', station: 'kitchen', isAvailable: true, sortOrder: 0 } as MenuItemDto)
    const w = mount(CartSummary, { props: { submitting: false, error: null } })
    await w.find('[data-test="cart-toggle"]').trigger('click')
    expect(w.text()).toContain('Fries')
    const submit = w.findAll('button').find((b) => /submit|order/i.test(b.text()))
    expect(submit).toBeDefined()
  })

  it('is hidden while empty, then a floating bar with count and total', async () => {
    const cart = useCartStore()
    const w = mount(CartSummary, { props: {} })
    expect(w.find('[data-test="cart-toggle"]').exists()).toBe(false)
    expect(w.find('aside').exists()).toBe(false)
    cart.add({ id: 'f', nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, category: 'Snacks', station: 'kitchen', isAvailable: true, sortOrder: 0 } as MenuItemDto)
    cart.add({ id: 'f', nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, category: 'Snacks', station: 'kitchen', isAvailable: true, sortOrder: 0 } as MenuItemDto)
    await w.vm.$nextTick()
    const bar = w.find('[data-test="cart-toggle"]')
    expect(bar.classes()).toContain('fixed')
    expect(bar.attributes('aria-expanded')).toBe('false')
    expect(w.find('[data-test="cart-count"]').text()).toBe('2')
    expect(w.find('[data-test="cart-bar-total"]').text()).toMatch(/7[,.]00/)
    expect(w.find('[data-test="cart-line"]').exists()).toBe(false)
  })

  it('keeps the bar the only solid accent: menu add buttons are tinted, bar label centred', async () => {
    const fries = { id: 'f', nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, category: 'Snacks', station: 'kitchen', isAvailable: true, sortOrder: 0 } as MenuItemDto
    const add = mount(MenuItem, { props: { item: fries } }).find('[data-test="menu-add"]')
    // The border keeps the tinted button visible on dark surfaces with dark club colours.
    expect(add.classes()).toEqual(expect.arrayContaining(['bg-brand-soft', 'text-brand-ink', 'border']))
    expect(add.classes()).not.toEqual(expect.arrayContaining([expect.stringMatching(/^bg-brand(-gradient)?$/)]))
    useCartStore().add(fries)
    const cart = mount(CartSummary, { props: {} })
    expect(cart.find('[data-test="cart-toggle"]').classes()).toEqual(expect.arrayContaining(['bg-brand-gradient', 'grid', 'grid-cols-[1fr_auto_1fr]']))
    // Badge uses the bar's own text colour pair, readable for every club colour.
    expect(cart.find('[data-test="cart-count"]').classes()).toEqual(expect.arrayContaining(['bg-brand-contrast', 'text-brand']))
  })

  it('opens as a sheet over the menu; close button, backdrop and Escape close it', async () => {
    useCartStore().add({ id: 'f', nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, category: 'Snacks', station: 'kitchen', isAvailable: true, sortOrder: 0 } as MenuItemDto)
    const w = mount(CartSummary, { props: {} })
    await w.find('[data-test="cart-toggle"]').trigger('click')
    expect(w.find('[data-test="cart-toggle"]').exists()).toBe(false)
    expect(w.find('aside').classes()).toEqual(expect.arrayContaining(['fixed', 'z-40']))
    expect(w.findAll('[data-test="cart-line"]')).toHaveLength(1)
    await w.find('[data-test="cart-close"]').trigger('click')
    expect(w.find('aside').exists()).toBe(false)
    await w.find('[data-test="cart-toggle"]').trigger('click')
    await w.find('[data-test="cart-backdrop"]').trigger('click')
    expect(w.find('[data-test="cart-line"]').exists()).toBe(false)
    await w.find('[data-test="cart-toggle"]').trigger('click')
    await w.find('aside').trigger('keydown', { key: 'Escape' })
    expect(w.find('[data-test="cart-backdrop"]').exists()).toBe(false)
  })
})

describe('OrderStatus', () => {
  it('lists the session orders collapsed and counts what is ready', () => {
    const base = { menuItemId: 'm', nameDe: 'Bier', nameEn: 'Beer', quantity: 1, note: null }
    const orders = { tableNo: 7, ticketStatus: 'open', tableBalanceCents: 0, items: [
      { ...base, orderItemId: '1', productionStatus: 'done' },
      { ...base, orderItemId: '2', productionStatus: 'pending' },
    ] } as unknown as SessionOrders
    const w = mount(OrderStatus, { props: { orders } })
    expect(w.find('details').attributes('open')).toBeUndefined()
    expect(w.find('summary').text()).toContain('(2)')
    expect(w.find('[data-test="order-status-ready"]').text()).toContain('guest.page.statusReady')
    expect(w.findAll('li')).toHaveLength(2)
  })
})
