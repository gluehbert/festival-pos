import { defineEventHandler, getRouterParam, readMultipartFormData } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../../../db/client'
import { eventAssets, events } from '../../../../../db/schema'
import { AppError, sendAppError } from '../../../../../lib/errors'
import { assertCsrf } from '../../../../../lib/csrf'
import { requireRole } from '../../../../../lib/rbac'
import { findAsset, loadBranding, validateAsset } from '../../../../../lib/branding'
import { logoFitsDark } from '../../../../../lib/logo-analysis'
import { AssetKindEnum } from '../../../../../lib/contracts/branding'
import { writeAudit } from '../../../../../lib/audit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Upload (or replace) the event's logo, dark-mode logo or flyer: multipart
// field `file`. A logo is checked once here for how to show it in dark mode.
export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const id = getRouterParam(event, 'id') ?? ''
    const kind = AssetKindEnum.safeParse(getRouterParam(event, 'kind'))
    if (!UUID_RE.test(id) || !kind.success) throw new AppError('VALIDATION', 400, 'Invalid event or asset')

    const file = (await readMultipartFormData(event))?.find((p) => p.name === 'file')
    if (!file) throw new AppError('VALIDATION', 400, 'No file uploaded')
    const { contentType, sha256 } = validateAsset(kind.data, file.data)

    const db = getDb()
    const ev = (await db.select({ id: events.id }).from(events).where(eq(events.id, id)).limit(1))[0]
    if (!ev) throw new AppError('NOT_FOUND', 404, 'Event not found')

    const values = {
      contentType,
      sha256,
      byteSize: file.data.length,
      dataBase64: file.data.toString('base64'),
      fitsDark: kind.data === 'logo' ? logoFitsDark(contentType, file.data) : null,
    }
    const existing = await findAsset(db, id, kind.data)
    await db.transaction(async (tx) => {
      if (existing) await tx.update(eventAssets).set(values).where(eq(eventAssets.id, existing.id))
      else await tx.insert(eventAssets).values({ ...values, eventId: id, kind: kind.data })
      await writeAudit(tx, {
        action: 'asset_upload',
        staffId: admin.staffId,
        targetKind: 'event',
        targetId: id,
        payload: { kind: kind.data, contentType, byteSize: values.byteSize, sha256, replaced: Boolean(existing) },
      })
    })
    return await loadBranding(db, id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
