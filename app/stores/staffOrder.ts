import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { newIdempotencyKey } from '~/utils/idempotency'
import { usePaymentsStore } from '~/stores/payments'
import { useMenuStore } from '~/stores/menu'
import type { MenuItemDto, Order } from '~/../server/lib/contracts/guest'
import type { PaymentResponse } from '~/../server/lib/contracts/staff'
import { addItem, linesTotal, qtyOfItem, setItemQty, setLineNote, setLineQty, toOrderItems, uniqueItems, type OrderLine } from '~/utils/order-lines'
import { priceChanges, type PriceChange } from '~/utils/price-changes'

export type StaffOrderLine = OrderLine

export type StaffOrderMode = 'staff_table' | 'walkin' | 'staff_meal'

export interface StaffOrderResult {
  order: Order
  ticketKey: string
  paid: PaymentResponse | null
  // Booked prices that differ from the pad (a promotion started or ended).
  priceChanges: PriceChange[]
}

// The waiter's pad: an order taken at the table (or at the counter) for
// guests who do not use the QR code.
export const useStaffOrderStore = defineStore('staff-order', () => {
  const lines = ref<StaffOrderLine[]>([])
  const submitting = ref(false)
  const error = ref<string | null>(null)
  // One key per pad, kept across retries so a double tap or a flaky network
  // never sends the order twice. Renewed once the order went through.
  let idempotencyKey = newIdempotencyKey()

  function add(item: MenuItemDto): void {
    lines.value = addItem(lines.value, item)
  }

  // Total of an article from the menu row, across its lines.
  function setQty(menuItemId: string, qty: number, item?: MenuItemDto): void {
    const menuItem = item ?? lines.value.find((l) => l.menuItem.id === menuItemId)?.menuItem
    if (menuItem) lines.value = setItemQty(lines.value, menuItem, qty)
  }

  function setLineQuantity(key: string, qty: number): void {
    lines.value = setLineQty(lines.value, key, qty)
  }

  function setNote(key: string, note: string): void {
    lines.value = setLineNote(lines.value, key, note)
  }

  function qtyOf(menuItemId: string): number {
    return qtyOfItem(lines.value, menuItemId)
  }

  // New menu prices (e.g. a promotion ended); articles gone from the menu
  // (sold out) leave the pad and are returned, so the waiter is told.
  function syncWithMenu(items: readonly MenuItemDto[]): MenuItemDto[] {
    const byId = new Map(items.map((i) => [i.id, i]))
    const gone = lines.value.filter((l) => !byId.has(l.menuItem.id))
    lines.value = lines.value
      .filter((l) => byId.has(l.menuItem.id))
      .map((l) => ({ ...l, menuItem: byId.get(l.menuItem.id)! }))
    return uniqueItems(gone)
  }

  function clear(): void {
    lines.value = []
    error.value = null
    idempotencyKey = newIdempotencyKey()
  }

  const totalCents = computed(() => linesTotal(lines.value))
  // Goods value at menu price, shown for staff meals (which cost 0 €).
  const valueCents = computed(() => lines.value.reduce((s, l) => s + (l.menuItem.regularPriceCents ?? l.menuItem.priceCents) * l.quantity, 0))
  const itemCount = computed(() => lines.value.reduce((s, l) => s + l.quantity, 0))
  const isEmpty = computed(() => lines.value.length === 0)

  // payNow (walk-in only): the guest pays cash right away, the order still
  // goes to kitchen/bar. staffMealReason: required for 'staff_meal'.
  async function submit(mode: StaffOrderMode, tableNo: number, payNow = false, staffMealReason?: string): Promise<StaffOrderResult | null> {
    if (lines.value.length === 0) return null
    submitting.value = true
    error.value = null
    const api = useApi()
    try {
      const order = await api.post<Order>(
        '/api/orders',
        {
          tableNo,
          mode,
          ...(mode === 'staff_meal' ? { staffMealReason } : {}),
          items: toOrderItems(lines.value),
        },
        { headers: { 'idempotency-key': idempotencyKey } },
      )
      const ticketKey = mode === 'staff_table' ? `t-${tableNo}` : `w-${order.orderId}`
      const changes = mode === 'staff_meal' ? [] : priceChanges(lines.value, order.items)
      clear()
      let paid: PaymentResponse | null = null
      if (payNow && mode === 'walkin') {
        try {
          paid = await api.post<PaymentResponse>(
            '/api/payments',
            { ticketKey, orderItemIds: order.items.map((i) => i.orderItemId) },
            { headers: { 'idempotency-key': newIdempotencyKey() } },
          )
          // Same receipt as after cashing at the table.
          usePaymentsStore().lastReceipt = paid
        }
        catch {
          // The order is placed; it stays open and can be cashed from the list.
          error.value = 'pay_failed'
        }
      }
      return { order, ticketKey, paid, priceChanges: changes }
    }
    catch (e: unknown) {
      const data = (e as { data?: { code?: string; message?: string; details?: { menuItemIds?: string[] } } }).data
      // Sold out meanwhile: nothing was booked; the articles leave the menu
      // and, through syncWithMenu, the pad.
      if (data?.code === 'SOLD_OUT') {
        error.value = 'sold_out'
        useMenuStore().markSoldOut(data.details?.menuItemIds ?? [])
        return null
      }
      error.value = data?.message ?? 'order_failed'
      return null
    }
    finally {
      submitting.value = false
    }
  }

  return { lines, submitting, error, totalCents, valueCents, itemCount, isEmpty, add, setQty, setLineQuantity, setNote, qtyOf, syncWithMenu, clear, submit }
})
