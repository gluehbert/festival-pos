import { and, eq, isNull } from 'drizzle-orm'
import { eventAssets, events, menuItems } from '../db/schema'
import { priceRules } from '../db/schema-pricing'
import { stationBuzzers } from '../db/schema-service'
import { AppError } from './errors'
import type { Tx } from './audit'

// A new event set up like an earlier one, so next year's festival starts from
// last year's menu instead of an empty page. Copied: look (colours, texts,
// logos, legal pages), features, guest limits, the current menu, price rules
// and buzzer keys. Not copied: name, PIN, dates, tables (from the form),
// helpers' join link, orders and everything that happened.
export async function copyEventSetup(tx: Tx, fromId: string, toId: string): Promise<{ menuItems: number }> {
  const src = (await tx.select().from(events).where(eq(events.id, fromId)))[0]
  if (!src) throw new AppError('NOT_FOUND', 404, 'event to copy from not found')

  await tx.update(events).set({
    accentColor: src.accentColor,
    welcomeText: src.welcomeText,
    program: src.program,
    imprintText: src.imprintText,
    privacyText: src.privacyText,
    depositEnabled: src.depositEnabled,
    staffMealsEnabled: src.staffMealsEnabled,
    waiterCallsEnabled: src.waiterCallsEnabled,
    foodPrepayEnabled: src.foodPrepayEnabled,
    guestOpenLimitBarCents: src.guestOpenLimitBarCents,
    guestOpenLimitKitchenCents: src.guestOpenLimitKitchenCents,
  }).where(eq(events.id, toId))

  const assets = await tx.select().from(eventAssets).where(eq(eventAssets.eventId, fromId))
  if (assets.length > 0) {
    await tx.insert(eventAssets).values(assets.map(({ id: _id, createdAt: _c, ...a }) => ({ ...a, eventId: toId })))
  }

  // Items replaced by an import stay behind. Everything starts available and
  // uncounted: last year's stock and sold-out marks mean nothing now.
  const items = await tx.select().from(menuItems).where(and(eq(menuItems.eventId, fromId), isNull(menuItems.archivedAt)))
  const newId = new Map<string, string>()
  if (items.length > 0) {
    const inserted = await tx.insert(menuItems).values(items.map(({ id: _id, createdAt: _c, ...m }) => ({
      ...m, eventId: toId, isAvailable: true, stock: null,
    }))).returning({ id: menuItems.id })
    items.forEach((m, i) => newId.set(m.id, inserted[i]!.id))
  }

  // Calendar limits were for last year's days: the rules keep their hours.
  const rules = await tx.select().from(priceRules).where(eq(priceRules.eventId, fromId))
  if (rules.length > 0) {
    await tx.insert(priceRules).values(rules.map(({ id: _id, createdAt: _c, updatedAt: _u, ...r }) => ({
      ...r,
      eventId: toId,
      validFrom: null,
      validTo: null,
      menuItemIds: r.menuItemIds.flatMap((id) => newId.get(id) ?? []),
    })))
  }

  const buzzers = await tx.select().from(stationBuzzers).where(eq(stationBuzzers.eventId, fromId))
  if (buzzers.length > 0) await tx.insert(stationBuzzers).values(buzzers.map((b) => ({ ...b, eventId: toId })))

  return { menuItems: items.length }
}
