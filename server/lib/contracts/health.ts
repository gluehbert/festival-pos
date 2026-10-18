import { z } from 'zod'

export const HealthSchema = z.object({
  status: z.literal('ok'),
  dbLatencyMs: z.number().int().nonnegative(),
})

export type Health = z.infer<typeof HealthSchema>

export const CsrfTokenSchema = z.object({
  csrfToken: z.string().min(32),
})

export type CsrfToken = z.infer<typeof CsrfTokenSchema>
