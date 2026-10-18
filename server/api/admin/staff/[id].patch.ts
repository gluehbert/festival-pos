import { defineEventHandler, getRouterParam, readBody } from 'h3'
import bcrypt from 'bcryptjs'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { auditLog, staff } from '../../../db/schema'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole, SERVICE_ROLES } from '../../../lib/rbac'
import { UpdateStaffSchema } from '../../../lib/contracts/staff-admin'
import { BCRYPT_COST, toStaffDto } from '../../../lib/staff-admin'
import { setStaffCookie, signStaffJwt, type StaffRole } from '../../../lib/auth'
import { releaseAllOf } from '../../../lib/table-assignments'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const id = getRouterParam(event, 'id') ?? ''
    if (!UUID_RE.test(id)) throw new AppError('VALIDATION', 400, 'Invalid staff id')
    const input = UpdateStaffSchema.parse(await readBody(event))

    // An admin cannot lock themselves out.
    if (id === admin.staffId && (input.isActive === false || (input.role && input.role !== 'admin'))) {
      throw new AppError('CONFLICT', 409, 'You cannot deactivate or demote your own account')
    }

    const db = getDb()
    const current = (await db.select().from(staff).where(eq(staff.id, id)).limit(1))[0]
    if (!current) throw new AppError('NOT_FOUND', 404, 'Staff member not found')
    const nextRole = input.role ?? current.role
    const willHavePassword = input.password !== undefined || current.passwordHash !== null
    if (nextRole === 'admin' && !willHavePassword) {
      throw new AppError('VALIDATION', 400, 'Admins need a password')
    }

    if (nextRole === 'admin' && input.pin) {
      throw new AppError('VALIDATION', 400, 'Admins log in with a password only')
    }

    const patch: Partial<typeof staff.$inferInsert> = {}
    if (input.role) patch.role = input.role
    if (input.isActive !== undefined) patch.isActive = input.isActive
    if (input.password) patch.passwordHash = await bcrypt.hash(input.password, BCRYPT_COST)
    if (input.pin) patch.pinHash = await bcrypt.hash(input.pin, BCRYPT_COST)
    // A PIN left over from before the promotion would stay a weak way in.
    if (nextRole === 'admin') patch.pinHash = null
    // New secret, other role or (de)activated: tokens issued before are void,
    // on every device of this account.
    const revokes = Boolean(input.password || input.pin)
      || (input.role !== undefined && input.role !== current.role)
      || (input.isActive !== undefined && input.isActive !== current.isActive)

    const row = await db.transaction(async (tx) => {
      const updated = (await tx
        .update(staff)
        .set(revokes ? { ...patch, sessionVersion: sql`${staff.sessionVersion} + 1` } : patch)
        .where(eq(staff.id, id))
        .returning())[0]!
      // Deactivated (or moved to kitchen/bar): their tables become free.
      const releasedTables = !updated.isActive || (!SERVICE_ROLES.includes(updated.role as StaffRole))
        ? await releaseAllOf(tx, id)
        : 0
      await tx.insert(auditLog).values({
        action: 'staff_update',
        staffId: admin.staffId,
        targetKind: 'staff',
        targetId: id,
        // Never log secrets, only which fields changed.
        payload: {
          role: input.role,
          isActive: input.isActive,
          passwordChanged: Boolean(input.password),
          pinChanged: Boolean(input.pin),
          sessionsRevoked: revokes,
          ...(releasedTables > 0 ? { releasedTables } : {}),
        },
      })
      return updated
    })
    // An admin changing their own password stays logged in on this device.
    if (revokes && id === admin.staffId) {
      setStaffCookie(event, await signStaffJwt({ staffId: id, role: row.role as StaffRole, username: row.username, sessionVersion: row.sessionVersion }))
    }
    return toStaffDto(row)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
