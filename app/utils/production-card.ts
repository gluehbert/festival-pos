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

// Rounds ordered at the same table add separate items of the same article.
// Items with the same article, note and status show as one line; its button
// advances all of them. Items ordered after `newSince` (a buzzer lane took
// the card) stay apart and are marked new, so a changed quantity cannot
// slip by.
export interface CardLine { key: string; first: ProductionQueueItem; ids: string[]; quantity: number; isNew: boolean }
export function cardLines(items: readonly ProductionQueueItem[], newSince?: string | null): CardLine[] {
  const byKey = new Map<string, CardLine>()
  for (const item of items) {
    const isNew = !!newSince && Date.parse(item.orderedAt) > Date.parse(newSince)
    const key = JSON.stringify([item.nameDe, item.nameEn, item.note ?? '', item.productionStatus, isNew])
    const line = byKey.get(key)
    if (line) {
      line.ids.push(item.orderItemId)
      line.quantity += item.quantity
    }
    else byKey.set(key, { key, first: item, ids: [item.orderItemId], quantity: item.quantity, isNew })
  }
  return [...byKey.values()].sort((a, b) => Number(a.isNew) - Number(b.isNew))
}

// A later round of a table that still has an earlier card open.
export function isFollowUp(group: ProductionOrderGroup, groups: readonly ProductionOrderGroup[]): boolean {
  if (group.orderKind !== 'guest' && group.orderKind !== 'staff_table') return false
  const earlier = groups.slice(0, groups.indexOf(group))
  return earlier.some((g) => (g.orderKind === 'guest' || g.orderKind === 'staff_table') && g.tableNo === group.tableNo)
}
