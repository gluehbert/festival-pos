import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import bcrypt from 'bcryptjs'
import { getDb } from '../../../db/client'
import { auditLog, staff } from '../../../db/schema'
import { AppError, isUniqueViolation, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireRole } from '../../../lib/rbac'
import { CreateStaffSchema } from '../../../lib/contracts/staff-admin'
import { BCRYPT_COST, toStaffDto } from '../../../lib/staff-admin'

export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const input = CreateStaffSchema.parse(await readBody(event))
    const db = getDb()
    const values = {
      username: input.username,
      role: input.role,
      passwordHash: input.password ? await bcrypt.hash(input.password, BCRYPT_COST) : null,
      pinHash: input.pin ? await bcrypt.hash(input.pin, BCRYPT_COST) : null,
    }
    let row
    try {
      row = await db.transaction(async (tx) => {
        const created = (await tx.insert(staff).values(values).returning())[0]!
        await tx.insert(auditLog).values({
          action: 'staff_create',
          staffId: admin.staffId,
          targetKind: 'staff',
          targetId: created.id,
          payload: { username: created.username, role: created.role },
        })
        return created
      })
    }
    catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 409, `Username '${input.username}' already exists`)
      throw err
    }
    setResponseStatus(event, 201)
    return toStaffDto(row)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
