<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMenuStore } from '~/stores/menu'
import { useCartStore } from '~/stores/cart'
import { useGuestSession } from '~/composables/useGuestSession'
import { useApi } from '~/composables/useApi'
import { useSendState } from '~/composables/useSendState'
import { usePolling } from '~/composables/usePolling'
import MenuList from '~/components/guest/MenuList.vue'
import CartSummary from '~/components/guest/CartSummary.vue'
import OrderConfirmation from '~/components/guest/OrderConfirmation.vue'
import EventInfo from '~/components/guest/EventInfo.vue'
import OrderStatus from '~/components/guest/OrderStatus.vue'
import CallWaiter from '~/components/guest/CallWaiter.vue'
import { useBranding } from '~/composables/useBranding'
import { useFormat } from '~/composables/useFormat'
import { newIdempotencyKey } from '~/utils/idempotency'
import { snapshotLines, toOrderItems } from '~/utils/order-lines'
import { priceChanges, type PriceChange } from '~/utils/price-changes'
import { GUEST_MAX_ITEMS_PER_ORDER, type Order, type SessionOrders } from '~/../server/lib/contracts/guest'

const route = useRoute()
const { t } = useI18n()
const { branding, dates } = useBranding()
const { euro, itemName } = useFormat()
const tableNo = computed(() => Number.parseInt(String(route.params.table ?? '0'), 10))

const menu = useMenuStore()
const cart = useCartStore()
const guest = useGuestSession()
const api = useApi()

const lastOrder = ref<Order | null>(null)
// Booked prices that differ from the cart (a promotion started or ended).
const changedPrices = ref<PriceChange[]>([])
const submitting = ref(false)
const { sending, begin, end, cancel: cancelSending } = useSendState()
const submitError = ref<string | null>(null)
const soldOutNotice = ref<string | null>(null)
const cartQuantities = computed(() => Object.fromEntries(cart.lines.map((l) => [l.menuItem.id, cart.qtyOf(l.menuItem.id)])))
const confirmationHeading = useTemplateRef<HTMLHeadingElement>('confirmationHeading')

cart.setTable(tableNo.value)

// Returns false when the guest has no session for this table and no QR key:
// they are sent to the start page to enter the event PIN instead.
async function ensureSession(): Promise<boolean> {
  const current = await guest.load()
  if (current && current.tableNo === tableNo.value) return true
  const key = typeof route.query.k === 'string' ? route.query.k : ''
  if (!key) {
    await navigateTo({ path: '/', query: { table: tableNo.value } })
    return false
  }
  try {
    await api.post('/api/session', { tableNo: tableNo.value, key })
  }
  catch {
    await navigateTo({ path: '/', query: { table: tableNo.value } })
    return false
  }
  // The key leaves the address bar: once the session has ended (after 12 h
  // or at the end of a shift), reloading this page does not open a new one;
  // the guest scans the QR code on the table again.
  const { k: _key, ...query } = route.query
  await navigateTo({ path: route.path, query }, { replace: true })
  await guest.load()
  return true
}

// One key per cart content: tapping "Bestellen" again after a lost answer
// returns the order already placed instead of sending it twice. A changed
// cart is a new order and gets a new key.
let orderKey = ''
let orderKeyBody = ''

type OrderError = 'network' | 'tooMany' | 'tooLarge' | 'openLimit' | 'sessionExpired' | 'unavailable' | 'generic'

function orderError(e: unknown): OrderError {
  const err = e as { statusCode?: number; status?: number; data?: { code?: string; message?: string } }
  const status = err.statusCode ?? err.status
  if (status === undefined) return 'network'
  if (err.data?.code === 'RATE_LIMITED') return 'tooMany'
  if (err.data?.code === 'ORDER_TOO_LARGE') return 'tooLarge'
  if (err.data?.code === 'OPEN_LIMIT') return 'openLimit'
  if (status === 401) return 'sessionExpired'
  if (/not available/i.test(err.data?.message ?? '')) return 'unavailable'
  return 'generic'
}

async function submitOrder() {
  if (cart.isEmpty) return
  submitting.value = true
  submitError.value = null
  const body = {
    tableNo: tableNo.value,
    items: toOrderItems(cart.lines),
  }
  const sent = snapshotLines(cart.lines)
  const bodyJson = JSON.stringify(body)
  if (bodyJson !== orderKeyBody) {
    orderKey = newIdempotencyKey()
    orderKeyBody = bodyJson
  }
  try {
    const order = await api.post<Order>('/api/orders', body, { headers: { 'idempotency-key': orderKey }, ...begin() })
    changedPrices.value = priceChanges(cart.lines, order.items)
    lastOrder.value = order
    orderKeyBody = ''
    // Cart changes made while sending stay for the next order.
    cart.clearSent(sent)
    polling.refresh()
    void menu.refreshPopular()
    if (changedPrices.value.length > 0) void menu.refresh()
  }
  catch (e: unknown) {
    const kind = orderError(e)
    if (kind === 'openLimit') {
      const details = (e as { data?: { details?: { station?: string; limitCents?: number } } }).data?.details
      submitError.value = t(`guest.errors.openLimit.${details?.station === 'kitchen' ? 'kitchen' : 'bar'}`, { amount: euro(details?.limitCents ?? 0) })
    }
    else submitError.value = t(`guest.errors.${kind}`, { max: GUEST_MAX_ITEMS_PER_ORDER })
    // Sold out meanwhile: take the articles off the menu (and so the cart),
    // else load the current menu.
    if (kind === 'unavailable') {
      const ids = (e as { data?: { details?: { menuItemIds?: string[] } } }).data?.details?.menuItemIds ?? []
      if (ids.length > 0) menu.markSoldOut(ids)
      else void menu.refresh()
    }
  }
  finally {
    submitting.value = false
    end()
  }
}

watch(lastOrder, async (val) => {
  if (val) {
    await nextTick()
    confirmationHeading.value?.focus()
  }
})

// Pre-check while the guest browses: articles sold out meanwhile leave the
// menu and the cart before "Bestellen" (also when the phone wakes up).
usePolling(() => menu.refresh(), { intervalMs: 20_000, immediate: false })

const polling = usePolling<SessionOrders>(
  () => api.get<SessionOrders>('/api/orders/session'),
  { intervalMs: 8000, immediate: false },
)

onMounted(async () => {
  // After hydration, so the server-rendered (empty) cart matches first.
  cart.restore()
  if (!(await ensureSession())) return
  // Show earlier orders right away (e.g. after a reload), not after 8 s.
  polling.refresh()
  await Promise.all([menu.refresh(), menu.refreshPopular()])
})

// Every menu load (also when a promotion ends) brings the cart's prices up
// to date and says what was sold out meanwhile.
watch(() => menu.items, (items) => {
  if (!menu.eventId) return
  const gone = cart.syncWithMenu(items)
  if (gone.length > 0) soldOutNotice.value = t('guest.cart.soldOut', { items: gone.map(itemName).join(', ') })
})
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
    <header class="space-y-1">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-brand-ink">
        {{ branding.eventName ? `${branding.eventName} · ` : '' }}{{ $t('guest.page.kicker', { table: tableNo }) }}
      </p>
      <p v-if="dates" class="text-sm text-slate-700" data-test="event-dates">
        <span class="sr-only">{{ $t('guest.event.dates') }}: </span>{{ dates }}
      </p>
      <h1 class="text-2xl font-bold text-slate-900">
        {{ $t('guest.page.title') }}
      </h1>
      <p v-if="branding.welcomeText" class="whitespace-pre-line text-sm text-slate-700">
        {{ branding.welcomeText }}
      </p>
    </header>

    <EventInfo :branding="branding" />

    <CallWaiter v-if="branding.waiterCallsEnabled && guest.session.value" />

    <OrderStatus v-if="polling.data.value?.items.length" :orders="polling.data.value" />

    <section v-if="lastOrder" aria-live="polite">
      <OrderConfirmation
        ref="confirmationHeading"
        :order="lastOrder"
        :changes="changedPrices"
        @new-order="lastOrder = null"
      />
    </section>

    <section v-else aria-labelledby="menu-heading" class="space-y-4">
      <h2 id="menu-heading" class="sr-only">
        {{ $t('guest.page.menuHeading') }}
      </h2>
      <p v-if="soldOutNotice" class="flex items-center gap-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert" data-test="sold-out-notice">
        <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" aria-hidden="true" /> {{ soldOutNotice }}
      </p>
      <MenuList
        :loading="menu.loading"
        :items="menu.items"
        :popular="menu.popular"
        :quantities="cartQuantities"
        @add="(item) => { soldOutNotice = null; cart.add(item) }"
      />
      <CartSummary
        :submitting="submitting"
        :error="submitError"
        :sending="sending"
        @cancel-sending="cancelSending"
        @submit="submitOrder"
        @clear="cart.clear()"
      />
    </section>

  </main>
</template>
