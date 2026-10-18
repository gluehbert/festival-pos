import { defineEventHandler, getRouterParam } from 'h3'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../../../../../db/client'
import { eventAssets } from '../../../../../db/schema'
import { AppError, sendAppError } from '../../../../../lib/errors'
import { assertCsrf } from '../../../../../lib/csrf'
import { requireRole } from '../../../../../lib/rbac'
import { loadBranding } from '../../../../../lib/branding'
import { AssetKindEnum } from '../../../../../lib/contracts/branding'
import { writeAudit } from '../../../../../lib/audit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const id = getRouterParam(event, 'id') ?? ''
    const kind = AssetKindEnum.safeParse(getRouterParam(event, 'kind'))
    if (!UUID_RE.test(id) || !kind.success) throw new AppError('VALIDATION', 400, 'Invalid event or asset')
    const db = getDb()
    await db.transaction(async (tx) => {
      const gone = await tx
        .delete(eventAssets)
        .where(and(eq(eventAssets.eventId, id), eq(eventAssets.kind, kind.data)))
        .returning({ sha256: eventAssets.sha256 })
      if (gone.length === 0) return // nothing there, nothing to log
      await writeAudit(tx, { action: 'asset_delete', staffId: admin.staffId, targetKind: 'event', targetId: id, payload: { kind: kind.data, sha256: gone[0]!.sha256 } })
    })
    return await loadBranding(db, id)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
