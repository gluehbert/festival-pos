import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SendingState from '~/components/common/SendingState.vue'
import CartSummary from '~/components/guest/CartSummary.vue'
import { useCartStore } from '~/stores/cart'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'

describe('SendingState', () => {
  it('shows the retry and emits cancel', async () => {
    const w = mount(SendingState, { props: { sending: { attempt: 2, max: 4 } } })
    expect(w.text()).toContain('common.sending.attempt')
    await w.find('[data-test="sending-cancel"]').trigger('click')
    expect(w.emitted('cancel')).toHaveLength(1)
  })

  it('is hidden before the first retry and when nothing is sending', () => {
    expect(mount(SendingState, { props: { sending: { attempt: 0, max: 0 } } }).find('[data-test="sending-state"]').exists()).toBe(false)
    expect(mount(SendingState, { props: { sending: null } }).find('[data-test="sending-state"]').exists()).toBe(false)
  })
})

describe('guest cart while sending', () => {
  const item = { id: 'f', nameDe: 'Pommes', nameEn: 'Fries', priceCents: 350, depositCents: 0, station: 'kitchen', category: 'Essen', isAvailable: true } as MenuItemDto

  it('keeps the submit button locked and offers cancel during a retry', async () => {
    useCartStore().add(item)
    const w = mount(CartSummary, { props: { submitting: true, sending: { attempt: 2, max: 4 } } })
    await w.find('[data-test="cart-toggle"]').trigger('click')
    expect(w.find('[data-test="cart-submit"]').attributes('disabled')).toBeDefined()
    await w.find('[data-test="sending-cancel"]').trigger('click')
    expect(w.emitted('cancelSending')).toHaveLength(1)
  })

  it('clearSent removes what was sent and keeps later additions', () => {
    const cart = useCartStore()
    cart.add(item)
    const sent = new Map(cart.lines.map((l) => [l.key, l.quantity]))
    cart.add(item)
    cart.clearSent(sent)
    expect(cart.itemCount).toBe(1)
  })
})
