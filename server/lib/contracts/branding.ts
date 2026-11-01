import { z } from 'zod'
import { HEX_COLOR } from '../color'
import { OptionalEventDateSchema } from './admin'

export const AssetKindEnum = z.enum(['logo', 'logo_dark', 'flyer'])
export type AssetKind = z.infer<typeof AssetKindEnum>

export const LEGAL_TEXT_MAX = 20_000

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional()

const BuzzerKeySchema = z.string().min(1).max(32).nullable().optional()

const GuestOpenLimitSchema = z.number().int().min(100).max(100_000).nullable()

export const UpdateBrandingSchema = z.object({
  name: z.string().trim().min(1, 'Name must not be empty').max(200).optional(),
  accentColor: z.string().regex(HEX_COLOR, 'Farbe im Format #rrggbb').transform((v) => v.toLowerCase()).nullable().optional(),
  welcomeText: optionalText(300),
  program: optionalText(4000),
  startsOn: OptionalEventDateSchema,
  endsOn: OptionalEventDateSchema,
  imprintText: optionalText(LEGAL_TEXT_MAX),
  privacyText: optionalText(LEGAL_TEXT_MAX),
  depositEnabled: z.boolean().optional(),
  staffMealsEnabled: z.boolean().optional(),
  waiterCallsEnabled: z.boolean().optional(),
  // KeyboardEvent.key of the buzzers per station screen (lane 1, lane 2); null = no lane.
  kitchenBuzzerKey: BuzzerKeySchema,
  kitchenBuzzerKey2: BuzzerKeySchema,
  barBuzzerKey: BuzzerKeySchema,
  barBuzzerKey2: BuzzerKeySchema,
  foodPrepayEnabled: z.boolean().optional(),
  // Unpaid cents one guest phone may have per station; null = no limit.
  guestOpenLimitBarCents: GuestOpenLimitSchema.optional(),
  guestOpenLimitKitchenCents: GuestOpenLimitSchema.optional(),
})
export type UpdateBranding = z.input<typeof UpdateBrandingSchema>

export const BrandingSchema = z.object({
  eventId: z.string().uuid().nullable(),
  eventName: z.string().nullable(),
  accentColor: z.string().nullable(),
  welcomeText: z.string().nullable(),
  program: z.string().nullable(),
  logoUrl: z.string().nullable(),
  // Optional variant for dark mode; replaces the logo there.
  logoDarkUrl: z.string().nullable(),
  // Without a dark variant: true = the logo is shown as is in dark mode,
  // false = on a light plate (see server/lib/logo-analysis.ts).
  logoFitsDark: z.boolean(),
  flyerUrl: z.string().nullable(),
  flyerType: z.enum(['image', 'pdf']).nullable(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  trialMode: z.boolean(),
  // Optional features of the event; staff screens hide what is off.
  depositEnabled: z.boolean(),
  staffMealsEnabled: z.boolean(),
  waiterCallsEnabled: z.boolean(),
  foodPrepayEnabled: z.boolean(),
  // Footer links on the guest pages; the texts come from /api/event/legal.
  hasImprint: z.boolean(),
  hasPrivacy: z.boolean(),
})
export type Branding = z.infer<typeof BrandingSchema>

export const LegalTextsSchema = z.object({
  eventName: z.string().nullable(),
  imprintText: z.string().nullable(),
  privacyText: z.string().nullable(),
})
export type LegalTexts = z.infer<typeof LegalTextsSchema>

export const EMPTY_BRANDING: Branding = {
  eventId: null,
  eventName: null,
  accentColor: null,
  welcomeText: null,
  program: null,
  logoUrl: null,
  logoDarkUrl: null,
  logoFitsDark: false,
  flyerUrl: null,
  flyerType: null,
  startsOn: null,
  endsOn: null,
  trialMode: false,
  depositEnabled: false,
  staffMealsEnabled: false,
  waiterCallsEnabled: false,
  foodPrepayEnabled: false,
  hasImprint: false,
  hasPrivacy: false,
}
