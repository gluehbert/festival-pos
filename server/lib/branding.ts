import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { eventAssets, events } from '../db/schema'
import { AppError } from './errors'
import { BrandingSchema, type AssetKind, type Branding } from './contracts/branding'
import { toDay } from './events'
import { logoFitsDark } from './logo-analysis'

// Vercel rejects request bodies above 4.5 MB, so keep uploads below that.
export const ASSET_LIMITS: Record<AssetKind, { maxBytes: number; types: string[] }> = {
  logo: { maxBytes: 1024 * 1024, types: ['image/png', 'image/jpeg', 'image/webp'] },
  logo_dark: { maxBytes: 1024 * 1024, types: ['image/png', 'image/jpeg', 'image/webp'] },
  flyer: { maxBytes: 4 * 1024 * 1024, types: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] },
}

// Content type from the file's magic bytes, never from the client. SVG is
// deliberately not accepted (it can carry scripts).
export function sniffContentType(data: Buffer): string | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png'
  if (data.length >= 3 && data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return 'image/jpeg'
  if (data.length >= 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  if (data.length >= 5 && data.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf'
  return null
}

export function validateAsset(kind: AssetKind, data: Buffer): { contentType: string; sha256: string } {
  const limit = ASSET_LIMITS[kind]
  if (data.length === 0) throw new AppError('VALIDATION', 400, 'Empty file')
  if (data.length > limit.maxBytes) {
    throw new AppError('VALIDATION', 400, `File is too large (max. ${limit.maxBytes / 1024 / 1024} MB)`)
  }
  const contentType = sniffContentType(data)
  if (!contentType || !limit.types.includes(contentType)) {
    throw new AppError('VALIDATION', 400, kind !== 'flyer'
      ? 'Logo must be PNG, JPEG or WebP'
      : 'Flyer must be PNG, JPEG, WebP or PDF')
  }
  return { contentType, sha256: createHash('sha256').update(data).digest('hex') }
}

export function assetUrl(eventId: string, kind: AssetKind, sha256: string): string {
  return `/api/events/${eventId}/assets/${kind}?v=${sha256.slice(0, 16)}`
}

export async function loadBranding(db: Db, eventId: string): Promise<Branding> {
  const ev = (await db.select().from(events).where(eq(events.id, eventId)).limit(1))[0]
  if (!ev) throw new AppError('NOT_FOUND', 404, 'Event not found')
  const assets = await db
    .select({ id: eventAssets.id, kind: eventAssets.kind, contentType: eventAssets.contentType, sha256: eventAssets.sha256, fitsDark: eventAssets.fitsDark })
    .from(eventAssets)
    .where(eq(eventAssets.eventId, ev.id))
  const logo = assets.find((a) => a.kind === 'logo')
  const logoDark = assets.find((a) => a.kind === 'logo_dark')
  const flyer = assets.find((a) => a.kind === 'flyer')
  return BrandingSchema.parse({
    eventId: ev.id,
    eventName: ev.name,
    accentColor: ev.accentColor,
    welcomeText: ev.welcomeText,
    program: ev.program,
    logoUrl: logo ? assetUrl(ev.id, 'logo', logo.sha256) : null,
    logoDarkUrl: logoDark ? assetUrl(ev.id, 'logo_dark', logoDark.sha256) : null,
    logoFitsDark: logo ? await fitsDark(db, logo) : false,
    flyerUrl: flyer ? assetUrl(ev.id, 'flyer', flyer.sha256) : null,
    flyerType: flyer ? (flyer.contentType === 'application/pdf' ? 'pdf' : 'image') : null,
    startsOn: toDay(ev.startsOn),
    endsOn: toDay(ev.endsOn),
    trialMode: ev.trialMode,
    depositEnabled: ev.depositEnabled,
    staffMealsEnabled: ev.staffMealsEnabled,
    waiterCallsEnabled: ev.waiterCallsEnabled,
    foodPrepayEnabled: ev.foodPrepayEnabled,
    hasImprint: !!ev.imprintText,
    hasPrivacy: !!ev.privacyText,
  })
}

// Logos uploaded before the dark-mode check get analysed once, on first use.
async function fitsDark(db: Db, logo: { id: string; contentType: string; fitsDark: boolean | null }): Promise<boolean> {
  if (logo.fitsDark !== null) return logo.fitsDark
  const row = (await db.select({ data: eventAssets.dataBase64 }).from(eventAssets).where(eq(eventAssets.id, logo.id)).limit(1))[0]
  const fits = row ? logoFitsDark(logo.contentType, Buffer.from(row.data, 'base64')) : false
  await db.update(eventAssets).set({ fitsDark: fits }).where(eq(eventAssets.id, logo.id))
  return fits
}

export async function findAsset(db: Db, eventId: string, kind: AssetKind) {
  return (await db
    .select()
    .from(eventAssets)
    .where(and(eq(eventAssets.eventId, eventId), eq(eventAssets.kind, kind)))
    .limit(1))[0]
}
