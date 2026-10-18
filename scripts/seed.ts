import process from 'node:process'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { events, menuItems, staff } from '../server/db/schema.ts'
import { connect, isProductionTarget } from './lib/db.ts'
import { DEMO_MENU } from '../server/lib/demo-menu.ts'

const DEMO_EVENT_NAME = 'Demo Festival'
const DEMO_EVENT_PIN = 'DEMO1234'

interface StaffSeed {
  username: string
  role: 'admin' | 'lead' | 'waiter' | 'kitchen' | 'bar'
  secret: string
  kind: 'password' | 'pin'
}

const STAFF_SEEDS: StaffSeed[] = [
  { username: 'admin', role: 'admin', secret: 'admin123', kind: 'password' },
  { username: 'lead1', role: 'lead', secret: '1111', kind: 'pin' },
  { username: 'waiter1', role: 'waiter', secret: '1111', kind: 'pin' },
  { username: 'kitchen1', role: 'kitchen', secret: '1111', kind: 'pin' },
  { username: 'bar1', role: 'bar', secret: '1111', kind: 'pin' },
]

async function main(): Promise<void> {
  // Demo data with well-known passwords (admin/admin123, PIN 1111) must never
  // reach a production database. Use `pnpm admin:create` there instead.
  if (isProductionTarget() && process.env.ALLOW_DEMO_SEED !== '1') {
    throw new Error('Refusing to seed demo data into production. Use `pnpm admin:create`.')
  }
  const { db, close } = connect()

  let event = (await db.select().from(events).where(eq(events.name, DEMO_EVENT_NAME)).limit(1))[0]
  if (!event) {
    const created = (await db
      .insert(events)
      .values({
        name: DEMO_EVENT_NAME,
        pinCode: DEMO_EVENT_PIN,
        tableRangeFrom: 1,
        tableRangeTo: 20,
        isActive: true,
        activatedAt: new Date(),
        // The demo shows every feature, Pfand and helper meals included.
        depositEnabled: true,
        staffMealsEnabled: true,
      })
      .returning())[0]
    if (!created) throw new Error('Failed to insert demo event')
    event = created
    console.log(`Seed: created event ${event.id}`)
  }
  else {
    console.log(`Seed: event ${event.id} already exists`)
  }

  for (const item of DEMO_MENU) {
    const existing = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.eventId, event.id), eq(menuItems.nameDe, item.nameDe)))
      .limit(1)
    if (existing[0]) continue
    await db.insert(menuItems).values({ ...item, eventId: event.id })
    console.log(`Seed: menu item '${item.nameDe}' inserted`)
  }

  for (const s of STAFF_SEEDS) {
    const existing = await db.select({ id: staff.id }).from(staff).where(eq(staff.username, s.username)).limit(1)
    if (existing[0]) continue
    const hash = await bcrypt.hash(s.secret, 10)
    await db.insert(staff).values({
      username: s.username,
      role: s.role,
      passwordHash: s.kind === 'password' ? hash : null,
      pinHash: s.kind === 'pin' ? hash : null,
    })
    console.log(`Seed: staff '${s.username}' inserted`)
  }

  await close()
  console.log('Seed: done')
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
