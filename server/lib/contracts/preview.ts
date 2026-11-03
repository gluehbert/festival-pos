import { z } from 'zod'

// One-tap login on Vercel preview deployments (behind Vercel's own login).
export const PreviewAsEnum = z.enum(['waiter', 'lead', 'kitchen', 'bar', 'cafe', 'admin', 'guest'])
export type PreviewAs = z.infer<typeof PreviewAsEnum>

export const PreviewLoginSchema = z.object({ as: PreviewAsEnum })

// Staff land on their home page, a guest at the first table of the event.
export const PreviewLoginResponseSchema = z.object({ to: z.string() })
