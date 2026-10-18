import { defineEventHandler } from 'h3'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { getDb } from '../../../db/client'
import { sendAppError } from '../../../lib/errors'
import { relyingParty, saveChallenge } from '../../../lib/passkeys'

// Step 1 of a passkey login. No username: the passkeys are discoverable, the
// device offers the ones it has for this domain.
export default defineEventHandler(async (event) => {
  try {
    const { rpID } = relyingParty(event)
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' })
    await saveChallenge(getDb(), options.challenge, 'login', null)
    return options
  }
  catch (err) {
    sendAppError(event, err)
  }
})
