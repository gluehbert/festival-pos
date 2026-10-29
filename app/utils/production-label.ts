import type { ProductionOrderGroup } from '~/stores/production'

// Card title on the kitchen/bar screen: table, counter sale or helper meal.
export function groupLabel(group: ProductionOrderGroup, t: (key: string, params?: Record<string, unknown>) => string): string {
  if (group.orderKind === 'staff_meal') return t('production.staffMeal')
  if (group.orderKind === 'walkin') return t('production.counter')
  return t('staff.detail.table', { n: group.tableNo })
}
