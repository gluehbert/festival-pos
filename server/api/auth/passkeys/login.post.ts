import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { eq } from 'drizzle-orm'
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { getDb } from '../../../db/client'
import { staff } from '../../../db/schema'
import { staffPasskeys } from '../../../db/schema-auth'
import { AppError, sendAppError } from '../../../lib/errors'
import { setStaffCookie, signStaffJwt, type StaffRole } from '../../../lib/auth'
import { assertLoginAllowed, clearLoginFailures, clientIp, recordLoginFailure } from '../../../lib/login-throttle'
import { PasskeyLoginSchema } from '../../../lib/contracts/passkeys'
import { StaffSessionSchema } from '../../../lib/contracts/staff'
import { consumeChallenge, relyingParty } from '../../../lib/passkeys'

// Throttle bucket for unknown passkeys (usernames cannot contain ':').
const UNKNOWN_PASSKEY_USER = 'passkey:unknown'

// Step 2 of a passkey login: checks the signature and issues the same session
// as a password/PIN login, so session_version, deactivation and role changes
// apply unchanged. Admins may use it: a passkey needs the device AND its
// unlock (user verification is required), it cannot be phished or guessed.
export default defineEventHandler(async (event) => {
  try {
    const input = PasskeyLoginSchema.parse(await readBody(event))
    const db = getDb()
    const ip = clientIp(event)

    const found = (await db
      .select({ passkey: staffPasskeys, staff })
      .from(staffPasskeys)
      .innerJoin(staff, eq(staff.id, staffPasskeys.staffId))
      .where(eq(staffPasskeys.credentialId, input.response.id))
      .limit(1))[0]
    const username = found?.staff.username ?? UNKNOWN_PASSKEY_USER
    await assertLoginAllowed(db, username, ip)

    let verification = null
    if (found?.staff.isActive) {
      const { rpID, origin } = relyingParty(event)
      try {
        verification = await verifyAuthenticationResponse({
          response: input.response as unknown as AuthenticationResponseJSON,
          expectedChallenge: (challenge) => consumeChallenge(db, challenge, 'login', null),
          expectedOrigin: origin,
          expectedRPID: rpID,
          credential: {
            id: found.passkey.credentialId,
            publicKey: isoBase64URL.toBuffer(found.passkey.publicKey),
            counter: found.passkey.counter,
            transports: found.passkey.transports?.split(','),
          },
          requireUserVerification: true,
        })
      }
      catch {
        verification = null
      }
    }
    if (!found || !verification?.verified) {
      await recordLoginFailure(db, username, ip)
      throw new AppError('UNAUTHORIZED', 401, 'Invalid credentials')
    }
    await db
      .update(staffPasskeys)
      .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
      .where(eq(staffPasskeys.id, found.passkey.id))
    await clearLoginFailures(db, username, ip)

    const s = found.staff
    const role = s.role as StaffRole
    setStaffCookie(event, await signStaffJwt({ staffId: s.id, role, username: s.username, sessionVersion: s.sessionVersion }))
    setResponseStatus(event, 200)
    return StaffSessionSchema.parse({ staffId: s.id, username: s.username, role, theme: s.theme })
  }
  catch (err) {
    sendAppError(event, err)
  }
})
