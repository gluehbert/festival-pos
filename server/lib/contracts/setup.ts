import { z } from 'zod'

// The guided setup of an event: what the overview's checklist and the guide
// bar need to tick steps off on every admin device alike.
export const SetupStepKeyEnum = z.enum(['branding', 'settings', 'menu', 'pricing', 'staff', 'qr', 'start'])
export type SetupStepKey = z.infer<typeof SetupStepKeyEnum>

export const SetupSchema = z.object({
  // Steps the admin went past with "Weiter".
  confirmed: z.array(SetupStepKeyEnum),
  facts: z.object({
    // Logo or greeting set: the branding is visibly done.
    branded: z.boolean(),
    menuItems: z.number().int().nonnegative(),
    priceRules: z.number().int().nonnegative(),
    // Helpers an admin let in through the join link.
    helpers: z.number().int().nonnegative(),
    qrDownloadedAt: z.string().datetime().nullable(),
    trialHeldAt: z.string().datetime().nullable(),
  }),
})
export type Setup = z.infer<typeof SetupSchema>

export const SetupConfirmSchema = z.object({ steps: z.array(SetupStepKeyEnum).min(1).max(7) })
export type SetupConfirm = z.infer<typeof SetupConfirmSchema>
