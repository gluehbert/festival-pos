import { eq, ne, or, type SQL } from 'drizzle-orm'
import { orderItems, type Event } from '../db/schema'

// With food prepay on, the kitchen only gets food once it is paid: a guest's
// order waits until the waiter has cashed it. Food already started when the
// switch was turned on stays with the kitchen.
export function kitchenReleased(ev: Pick<Event, 'foodPrepayEnabled'>, station: string): SQL | undefined {
  if (!ev.foodPrepayEnabled || station !== 'kitchen') return undefined
  return or(eq(orderItems.paymentStatus, 'paid'), ne(orderItems.productionStatus, 'pending'))
}

export function isHeldFood(
  ev: Pick<Event, 'foodPrepayEnabled'>,
  item: { station: string; paymentStatus: string; productionStatus: string },
): boolean {
  return ev.foodPrepayEnabled && item.station === 'kitchen' && item.paymentStatus === 'unpaid' && item.productionStatus === 'pending'
}
