import { defineEventHandler, getCookie } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { events, staff } from '../../db/schema'
import { staffJoinRequests } from '../../db/schema-auth'
import { AppError, sendAppError } from '../../lib/errors'
import { clearJoinCookie, cookieNames, setStaffCookie, signStaffJwt, type StaffRole } from '../../lib/auth'
import { JoinStatusSchema } from '../../lib/contracts/join'
import { hashJoinToken, joinRequestByToken } from '../../lib/staff-join'

// Polled by the waiting device. Once the admin let them in, this signs the
// device in as that person (once: the waiting-room token is dropped).
export default defineEventHandler(async (event) => {
  try {
    const token = getCookie(event, cookieNames.join)
    const db = getDb()
    const req = token ? await joinRequestByToken(db, hashJoinToken(token)) : undefined
    if (!req) throw new AppError('NOT_FOUND', 404, 'Not waiting to join')
    if (req.status === 'pending') return JoinStatusSchema.parse({ status: 'pending', name: req.name })

    // Decided: the token is used up, a copied cookie signs in nobody else.
    clearJoinCookie(event)
    await db.update(staffJoinRequests).set({ tokenHash: `used-${req.id}` }).where(eq(staffJoinRequests.id, req.id))
    const row = req.status === 'approved' && req.staffId
      ? (await db.select({ staff, eventActive: events.isActive }).from(staff)
          .innerJoin(events, eq(events.id, req.eventId))
          .where(eq(staff.id, req.staffId)).limit(1))[0]
      : undefined
    // Turned away, or locked/ended since: start over with the link.
    if (!row || !row.staff.isActive || !row.eventActive) return JoinStatusSchema.parse({ status: 'rejected', name: req.name })

    const s = row.staff
    setStaffCookie(event, await signStaffJwt({ staffId: s.id, role: s.role as StaffRole, username: s.username, sessionVersion: s.sessionVersion }))
    return JoinStatusSchema.parse({ status: 'approved', name: s.username, role: s.role })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
