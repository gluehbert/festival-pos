import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { generateRegistrationOptions, type AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { isoUint8Array } from '@simplewebauthn/server/helpers'
import { getDb } from '../../../db/client'
import { staffPasskeys } from '../../../db/schema-auth'
import { AppError, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireStaff } from '../../../lib/rbac'
import { RP_NAME, relyingParty, saveChallenge } from '../../../lib/passkeys'

const MAX_PASSKEYS_PER_STAFF = 10

// Step 1 of adding a passkey: any signed-in staff member, for their own account.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const me = requireStaff(event)
    const db = getDb()
    const existing = await db
      .select({ credentialId: staffPasskeys.credentialId, transports: staffPasskeys.transports })
      .from(staffPasskeys)
      .where(eq(staffPasskeys.staffId, me.staffId))
    if (existing.length >= MAX_PASSKEYS_PER_STAFF) {
      throw new AppError('CONFLICT', 409, `At most ${MAX_PASSKEYS_PER_STAFF} passkeys per account`)
    }
    const { rpID } = relyingParty(event)
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: me.username,
      userID: isoUint8Array.fromUTF8String(me.staffId),
      attestationType: 'none',
      // The same authenticator twice for one account would only confuse.
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: c.transports ? (c.transports.split(',') as AuthenticatorTransportFuture[]) : undefined,
      })),
      // Discoverable, so login needs no username; always unlocked by
      // fingerprint, face or device PIN, never by a bare tap.
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    })
    await saveChallenge(db, options.challenge, 'register', me.staffId)
    return options
  }
  catch (err) {
    sendAppError(event, err)
  }
})
