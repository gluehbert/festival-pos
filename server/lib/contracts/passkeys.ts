import { z } from 'zod'

// The browser's WebAuthn answers (from @simplewebauthn/browser) are checked in
// depth by @simplewebauthn/server; here only their outer shape.
const Base64Url = z.string().regex(/^[\w-]+$/).max(4096)
const CredentialResponse = z.object({
  id: Base64Url,
  rawId: Base64Url,
  type: z.literal('public-key'),
  response: z.record(z.string(), z.unknown()),
  clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
})

export const PasskeyName = z.string().trim().min(1).max(60)

export const RegisterPasskeySchema = z.object({
  name: PasskeyName,
  response: CredentialResponse.extend({
    response: z.object({
      clientDataJSON: Base64Url,
      attestationObject: Base64Url,
      transports: z.array(z.string().max(32)).max(10).optional(),
    }).passthrough(),
  }),
})
export type RegisterPasskey = z.infer<typeof RegisterPasskeySchema>

export const PasskeyLoginSchema = z.object({
  response: CredentialResponse.extend({
    response: z.object({
      clientDataJSON: Base64Url,
      authenticatorData: Base64Url,
      signature: Base64Url,
      userHandle: Base64Url.optional(),
    }).passthrough(),
  }),
})
export type PasskeyLogin = z.infer<typeof PasskeyLoginSchema>

export const PasskeyDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().nullable(),
})
export type PasskeyDto = z.infer<typeof PasskeyDtoSchema>

export const PasskeyListSchema = z.object({ passkeys: z.array(PasskeyDtoSchema) })
export type PasskeyList = z.infer<typeof PasskeyListSchema>
