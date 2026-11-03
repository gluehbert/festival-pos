import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { events, menuItems, orderItems, orders } from '../db/schema'
import { tableAssignments } from '../db/schema-service'
import { DEMO_MENU } from './demo-menu'
import { previewAccount } from './preview-login'

const PREVIEW_PIN = 'PREVIEW1'

// What the sample fest starts with, so every screen has something to show:
// table 3 still in the kitchen and at the bar, tables 5 and 7 ready to bring.
const SAMPLE_ORDERS: Array<{ tableNo: number; done: boolean; items: Array<[string, number]> }> = [
  { tableNo: 3, done: false, items: [['Bier 0,5', 2], ['Pommes', 1]] },
  { tableNo: 5, done: true, items: [['Burger', 1], ['Cola 0,33', 1]] },
  { tableNo: 7, done: true, items: [['Radler 0,5', 2]] },
]

// Preview databases start empty: without an active event nothing can be
// tried. The first one-tap login creates "Preview-Fest" with the demo menu
// and a few open orders of preview-waiter (whose tables they are). An
// existing active event is left alone; a deactivated Preview-Fest comes back.
export async function ensurePreviewEvent(db: Db): Promise<void> {
  if ((await db.select({ id: events.id }).from(events).where(eq(events.isActive, true)).limit(1))[0]) return
  const old = (await db.select({ id: events.id }).from(events).where(eq(events.pinCode, PREVIEW_PIN)).limit(1))[0]
  if (old) {
    await db.update(events).set({ isActive: true, activatedAt: new Date(), deactivatedAt: null }).where(eq(events.id, old.id))
    return
  }

  const ev = (await db.insert(events).values({
    name: 'Preview-Fest',
    pinCode: PREVIEW_PIN,
    tableRangeFrom: 1,
    tableRangeTo: 20,
    isActive: true,
    activatedAt: new Date(),
    depositEnabled: true,
    staffMealsEnabled: true,
    waiterCallsEnabled: true,
  }).returning())[0]!
  const menu = await db.insert(menuItems).values(DEMO_MENU.map((m) => ({ ...m, eventId: ev.id }))).returning()
  const byName = new Map(menu.map((m) => [m.nameDe, m]))

  const waiter = await previewAccount(db, 'waiter')
  for (const sample of SAMPLE_ORDERS) {
    const order = (await db.insert(orders).values({ eventId: ev.id, tableNo: sample.tableNo, kind: 'staff_table', createdByStaff: waiter.id }).returning())[0]!
    await db.insert(orderItems).values(sample.items.map(([name, quantity]) => {
      const m = byName.get(name)!
      return {
        orderId: order.id,
        menuItemId: m.id,
        quantity,
        unitPriceCents: m.priceCents,
        depositCents: m.depositCents,
        station: m.station,
        productionStatus: sample.done ? 'done' : 'pending',
        nameDe: m.nameDe,
        nameEn: m.nameEn,
        category: m.category,
      }
    }))
    await db.insert(tableAssignments).values({ eventId: ev.id, tableNo: sample.tableNo, staffId: waiter.id })
  }
}
