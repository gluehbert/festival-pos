import process from 'node:process'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { staff } from '../db/schema'
import { AppError } from './errors'
import { BCRYPT_COST } from './staff-admin'
import type { StaffRole } from './auth'

// Only Vercel preview deployments, never production or a local build:
// there Vercel's deployment protection already asks who you are.
export function previewLoginEnabled(): boolean {
  return process.env.VERCEL_ENV === 'preview'
}

export function requirePreviewLogin(): void {
  if (!previewLoginEnabled()) throw new AppError('NOT_FOUND', 404, 'Not found')
}

// The account "preview-<role>", created on first use with a secret nobody
// knows, so it can only be entered through this shortcut.
export async function previewAccount(db: Db, role: StaffRole) {
  const username = `preview-${role}`
  const found = (await db.select().from(staff).where(and(eq(staff.username, username), isNull(staff.eventId))).limit(1))[0]
  if (found && found.role === role && found.isActive) return found
  if (found) {
    return (await db.update(staff).set({ role, isActive: true }).where(eq(staff.id, found.id)).returning())[0]!
  }
  const passwordHash = await bcrypt.hash(randomUUID(), BCRYPT_COST)
  return (await db.insert(staff).values({ username, role, passwordHash }).returning())[0]!
}
