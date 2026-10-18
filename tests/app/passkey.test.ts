import { beforeEach, describe, expect, it, vi } from 'vitest'
import { devicePlatform, markPasskeyOffer, passkeyErrorKey, shouldOfferPasskey } from '~/utils/passkey'

describe('passkeyErrorKey', () => {
  it('treats a closed device dialog as "not now", not as an error', () => {
    expect(passkeyErrorKey(Object.assign(new Error('x'), { name: 'NotAllowedError' }))).toBe('cancelled')
    expect(passkeyErrorKey({ code: 'ERROR_CEREMONY_ABORTED' })).toBe('cancelled')
  })

  it('recognises a passkey that already exists, then falls back to the login errors', () => {
    expect(passkeyErrorKey({ name: 'InvalidStateError' })).toBe('alreadyRegistered')
    expect(passkeyErrorKey({ statusCode: 409 })).toBe('alreadyRegistered')
    expect(passkeyErrorKey({ statusCode: 401 })).toBe('errorInvalid')
    expect(passkeyErrorKey({ statusCode: 429 })).toBe('errorTooMany')
    expect(passkeyErrorKey(new TypeError('Failed to fetch'))).toBe('errorOffline')
  })
})

describe('devicePlatform', () => {
  it('names the device for the passkey list', () => {
    expect(devicePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone')
    expect(devicePlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('Android')
    expect(devicePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows')
    expect(devicePlatform('curl/8')).toBe('Browser')
  })
})

describe('shouldOfferPasskey', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
  })

  it('offers once per user and device, to admins only', () => {
    expect(shouldOfferPasskey('boss', 'admin')).toBe(true)
    // Once-a-year volunteers and the shared kitchen/bar tablets get no offer.
    for (const role of ['waiter', 'lead', 'kitchen', 'bar', undefined]) expect(shouldOfferPasskey('anna', role)).toBe(false)
    markPasskeyOffer('boss', 'done')
    markPasskeyOffer('chef', 'never')
    expect(shouldOfferPasskey('boss', 'admin')).toBe(false)
    expect(shouldOfferPasskey('chef', 'admin')).toBe(false)
    expect(shouldOfferPasskey('bob', 'admin')).toBe(true)
  })

  it('does not offer without browser support', () => {
    vi.stubGlobal('PublicKeyCredential', undefined)
    expect(shouldOfferPasskey('boss', 'admin')).toBe(false)
  })
})
