import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { MenuItemDto } from '~/../server/lib/contracts/guest'
import { addItem, linesDeposit, linesTotal, qtyOfItem, remainingLines, restoreLine, setItemQty, setLineNote, setLineQty, uniqueItems, type OrderLine } from '~/utils/order-lines'

export type CartLine = OrderLine

// The cart is kept per table in localStorage, so a reload (or a dropped
// connection) does not empty it. Storage may be unavailable (private mode):
// then the cart simply lives in memory.
const STORAGE_PREFIX = 'guest-cart:'

function readStored(no: number): CartLine[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${no}`)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((l): l is CartLine =>
        typeof l?.menuItem?.id === 'string' && Number.isInteger(l?.quantity) && l.quantity > 0 && l.quantity <= 50)
      .map((l) => restoreLine(l.menuItem, l.quantity, l.note))
  }
  catch {
    return []
  }
}

function writeStored(no: number | null, lines: CartLine[]): void {
  if (no === null) return
  try {
    if (lines.length === 0) localStorage.removeItem(`${STORAGE_PREFIX}${no}`)
    else localStorage.setItem(`${STORAGE_PREFIX}${no}`, JSON.stringify(lines))
  }
  catch { /* not kept across reloads, still works */ }
}

export const useCartStore = defineStore('guest-cart', () => {
  const tableNo = ref<number | null>(null)
  const lines = ref<CartLine[]>([])

  function setTable(no: number): void {
    if (tableNo.value !== no) {
      tableNo.value = no
      lines.value = []
    }
  }

  // Client only (after hydration): bring back the cart saved for this table.
  function restore(): void {
    if (tableNo.value === null || lines.value.length > 0) return
    lines.value = readStored(tableNo.value)
  }

  // A restored cart may hold old prices, and the menu drops articles sold out
  // meanwhile: take the current menu entries, drop what is no longer
  // orderable and return it, so the guest is told.
  function syncWithMenu(items: readonly MenuItemDto[]): MenuItemDto[] {
    const byId = new Map(items.map((i) => [i.id, i]))
    const gone = lines.value.filter((l) => !byId.get(l.menuItem.id)?.isAvailable)
    lines.value = lines.value
      .filter((l) => byId.get(l.menuItem.id)?.isAvailable)
      .map((l) => ({ ...l, menuItem: byId.get(l.menuItem.id)! }))
    save()
    return uniqueItems(gone)
  }

  function save(): void {
    writeStored(tableNo.value, lines.value)
  }

  function add(item: MenuItemDto): void {
    lines.value = addItem(lines.value, item)
    save()
  }

  // All lines of an article.
  function remove(menuItemId: string): void {
    lines.value = lines.value.filter((l) => l.menuItem.id !== menuItemId)
    save()
  }

  // Total of an article, across its lines.
  function setQty(menuItemId: string, qty: number): void {
    const item = lines.value.find((l) => l.menuItem.id === menuItemId)?.menuItem
    if (item) lines.value = setItemQty(lines.value, item, qty)
    save()
  }

  function setLineQuantity(key: string, qty: number): void {
    lines.value = setLineQty(lines.value, key, qty)
    save()
  }

  function setNote(key: string, note: string): void {
    lines.value = setLineNote(lines.value, key, note)
    save()
  }

  function clear(): void {
    lines.value = []
    save()
  }

  // After a send: only what was sent leaves, later changes stay.
  function clearSent(sent: ReadonlyMap<string, number>): void {
    lines.value = remainingLines(lines.value, sent)
    save()
  }

  // Pfand included; depositCents is the share of it.
  const totalCents = computed(() => linesTotal(lines.value))
  const depositCents = computed(() => linesDeposit(lines.value))

  const itemCount = computed(() => lines.value.reduce((sum, l) => sum + l.quantity, 0))

  const isEmpty = computed(() => lines.value.length === 0)

  const qtyOf = (menuItemId: string) => qtyOfItem(lines.value, menuItemId)

  return {
    tableNo, lines, totalCents, depositCents, itemCount, isEmpty,
    setTable, restore, syncWithMenu, add, remove, setQty, setLineQuantity, setNote, qtyOf, clear, clearSent,
  }
})
