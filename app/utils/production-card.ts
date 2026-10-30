import type { ProductionOrderGroup } from '~/stores/production'
import type { ProductionQueueItem } from '~/../server/lib/contracts/production'

type Translate = (key: string, params?: Record<string, unknown>) => string

// Card title on the kitchen/bar screen: table, counter sale or helper meal.
export function groupLabel(group: ProductionOrderGroup, t: Translate): string {
  if (group.orderKind === 'staff_meal') return t('production.staffMeal')
  if (group.orderKind === 'walkin') return t('production.counter')
  return t('staff.detail.table', { n: group.tableNo })
}

export function minutesWaiting(group: ProductionOrderGroup): number {
  return Math.max(0, Math.floor((Date.now() - new Date(group.orderedAt).getTime()) / 60_000))
}

// Waiting time badge: amber from 5, red from 10 minutes.
export function ageClass(minutes: number): string {
  if (minutes >= 10) return 'bg-rose-100 text-rose-800'
  if (minutes >= 5) return 'bg-amber-100 text-amber-800'
  return 'bg-slate-100 text-slate-600'
}

// Rounds ordered at the same table add separate items of the same article:
// items with the same article and note show as one line.
export interface CardLine { key: string; first: ProductionQueueItem; quantity: number }
export function cardLines(items: readonly ProductionQueueItem[]): CardLine[] {
  const byKey = new Map<string, CardLine>()
  for (const item of items) {
    const key = JSON.stringify([item.nameDe, item.nameEn, item.note ?? ''])
    const line = byKey.get(key)
    if (line) line.quantity += item.quantity
    else byKey.set(key, { key, first: item, quantity: item.quantity })
  }
  return [...byKey.values()]
}
