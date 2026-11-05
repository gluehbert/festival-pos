import { and, count, eq, isNull, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import { eventAssets, events, menuItems } from '../db/schema'
import { staffJoinRequests } from '../db/schema-auth'
import { priceRules } from '../db/schema-pricing'
import { eventSetup } from '../db/schema-setup'
import { SetupSchema, SetupStepKeyEnum, type Setup, type SetupStepKey } from './contracts/setup'

type Mark = Partial<{ qrDownloadedAt: Date; trialHeldAt: Date }>

const iso = (d: Date | string | null) => (d === null ? null : (d instanceof Date ? d : new Date(d)).toISOString())
const num = async (q: Promise<Array<{ n: number }>>) => Number((await q)[0]?.n ?? 0)

// What the setup of an event shows on every device: the steps confirmed with
// "Weiter" plus what the data says (menu items, helpers let in, QR codes
// downloaded, a rehearsal held).
export async function loadSetup(db: Db, eventId: string): Promise<Setup> {
  const row = (await db.select().from(eventSetup).where(eq(eventSetup.eventId, eventId)).limit(1))[0]
  const ev = (await db.select({ welcomeText: events.welcomeText }).from(events).where(eq(events.id, eventId)).limit(1))[0]
  const logos = await num(db.select({ n: count() }).from(eventAssets)
    .where(and(eq(eventAssets.eventId, eventId), or(eq(eventAssets.kind, 'logo'), eq(eventAssets.kind, 'logo_dark')))))
  const [items, rules, helpers] = await Promise.all([
    num(db.select({ n: count() }).from(menuItems).where(and(eq(menuItems.eventId, eventId), isNull(menuItems.archivedAt)))),
    num(db.select({ n: count() }).from(priceRules).where(eq(priceRules.eventId, eventId))),
    num(db.select({ n: count() }).from(staffJoinRequests)
      .where(and(eq(staffJoinRequests.eventId, eventId), eq(staffJoinRequests.status, 'approved')))),
  ])
  return SetupSchema.parse({
    confirmed: (row?.confirmed ?? []).filter((k): k is SetupStepKey => SetupStepKeyEnum.safeParse(k).success),
    facts: {
      branded: logos > 0 || Boolean(ev?.welcomeText?.trim()),
      menuItems: items,
      priceRules: rules,
      helpers,
      qrDownloadedAt: iso(row?.qrDownloadedAt ?? null),
      trialHeldAt: iso(row?.trialHeldAt ?? null),
    },
  })
}

export async function confirmSteps(db: Db, eventId: string, steps: SetupStepKey[]): Promise<void> {
  const row = (await db.select({ confirmed: eventSetup.confirmed }).from(eventSetup).where(eq(eventSetup.eventId, eventId)).limit(1))[0]
  const merged = [...new Set([...(row?.confirmed ?? []), ...steps])]
  await db.insert(eventSetup).values({ eventId, confirmed: merged })
    .onConflictDoUpdate({ target: eventSetup.eventId, set: { confirmed: merged } })
}

// Records what the app did itself: QR codes downloaded, a rehearsal held.
export async function markSetup(db: Pick<Db, 'insert'>, eventId: string, mark: Mark): Promise<void> {
  await db.insert(eventSetup).values({ eventId, ...mark })
    .onConflictDoUpdate({ target: eventSetup.eventId, set: mark })
}
