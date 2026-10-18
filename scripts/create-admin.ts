import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { staff } from '../server/db/schema.ts'
import { connect } from './lib/db.ts'

// Creates (or resets the password of) an admin account.
// Usage: DATABASE_URL=... pnpm admin:create
// Non-interactive: ADMIN_USERNAME=... ADMIN_PASSWORD=... pnpm admin:create
const MIN_PASSWORD_LENGTH = 12

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)).trim()
  }
  finally {
    rl.close()
  }
}

async function main(): Promise<void> {
  const username = process.env.ADMIN_USERNAME ?? await ask('Admin username: ')
  const password = process.env.ADMIN_PASSWORD ?? await ask(`Password (min. ${MIN_PASSWORD_LENGTH} chars): `)
  if (!/^[\w.-]{3,64}$/.test(username)) {
    throw new Error('Username must be 3-64 characters (letters, digits, . _ -)')
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }

  const { db, close } = connect()
  const passwordHash = await bcrypt.hash(password, 12)
  const existing = await db.select({ id: staff.id }).from(staff).where(eq(staff.username, username)).limit(1)
  if (existing[0]) {
    await db.update(staff).set({ passwordHash, role: 'admin', isActive: true }).where(eq(staff.id, existing[0].id))
    console.log(`admin:create: updated password for '${username}'`)
  }
  else {
    await db.insert(staff).values({ username, passwordHash, role: 'admin' })
    console.log(`admin:create: created admin '${username}'`)
  }
  await close()
}

main().catch((err: unknown) => {
  console.error('admin:create failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
