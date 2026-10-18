import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { getDb } from '../../../db/client'
import { staffPasskeys } from '../../../db/schema-auth'
import { AppError, isUniqueViolation, sendAppError } from '../../../lib/errors'
import { assertCsrf } from '../../../lib/csrf'
import { requireStaff } from '../../../lib/rbac'
import { writeAudit } from '../../../lib/audit'
import { RegisterPasskeySchema } from '../../../lib/contracts/passkeys'
import { consumeChallenge, relyingParty, toPasskeyDto } from '../../../lib/passkeys'

// Step 2 of adding a passkey: checks the browser's answer and stores the public key.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const me = requireStaff(event)
    const input = RegisterPasskeySchema.parse(await readBody(event))
    const db = getDb()
    const { rpID, origin } = relyingParty(event)

    let verification
    try {
      verification = await verifyRegistrationResponse({
        response: input.response as unknown as RegistrationResponseJSON,
        expectedChallenge: (challenge) => consumeChallenge(db, challenge, 'register', me.staffId),
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      })
    }
    catch {
      verification = null
    }
    if (!verification?.verified) {
      throw new AppError('PASSKEY_INVALID', 400, 'Passkey could not be verified')
    }

    const { credential } = verification.registrationInfo
    const row = await db.transaction(async (tx) => {
      const created = (await tx.insert(staffPasskeys).values({
        staffId: me.staffId,
        credentialId: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports?.join(',') ?? null,
        name: input.name,
      }).returning())[0]!
      await writeAudit(tx, {
        action: 'passkey_add',
        staffId: me.staffId,
        targetKind: 'staff',
        targetId: me.staffId,
        payload: { passkeyId: created.id, name: created.name },
      })
      return created
    }).catch((err: unknown) => {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 409, 'This passkey is already registered')
      throw err
    })
    setResponseStatus(event, 201)
    return toPasskeyDto(row)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
