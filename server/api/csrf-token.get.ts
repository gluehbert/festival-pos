import { defineEventHandler } from 'h3'
import { issueCsrfToken } from '../lib/csrf'
import { CsrfTokenSchema } from '../lib/contracts/health'

export default defineEventHandler((event) => {
  const csrfToken = issueCsrfToken(event)
  return CsrfTokenSchema.parse({ csrfToken })
})
