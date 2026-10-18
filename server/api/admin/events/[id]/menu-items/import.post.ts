import { defineEventHandler, getQuery, readMultipartFormData } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../../../db/client'
import { menuItems } from '../../../../../db/schema'
import { AppError, sendAppError } from '../../../../../lib/errors'
import { assertCsrf } from '../../../../../lib/csrf'
import { requireRole } from '../../../../../lib/rbac'
import { MAX_IMPORT_BYTES, readMenuFile } from '../../../../../lib/menu-excel'
import type { MenuImportResult, MenuImportRow } from '../../../../../lib/contracts/admin'
import { eventIdParam, loadEvent } from '../../../../../lib/events'
import { writeAudit } from '../../../../../lib/audit'

// POST multipart `file` (.xlsx or .csv). `?dryRun=1` only previews. Items are
// matched by Name (DE) within the event: existing ones are updated,
// new ones created, items missing from the file stay as they are. Nothing is
// written if any row has an error.
export default defineEventHandler(async (event): Promise<MenuImportResult | undefined> => {
  try {
    assertCsrf(event)
    const admin = requireRole(event, ['admin'])
    const eventId = eventIdParam(event)
    const dryRun = ['1', 'true'].includes(String(getQuery(event).dryRun ?? ''))

    const parts = await readMultipartFormData(event)
    const file = parts?.find((p) => p.name === 'file' && p.data.length > 0)
    if (!file) throw new AppError('VALIDATION', 400, 'No file uploaded')
    if (file.data.length > MAX_IMPORT_BYTES) throw new AppError('VALIDATION', 400, 'File is larger than 2 MB')

    const db = getDb()
    const ev = await loadEvent(db, eventId)

    const parsed = await readMenuFile(file.data)
    const existing = await db.select().from(menuItems).where(eq(menuItems.eventId, ev.id))
    const byName = new Map(existing.map((m) => [m.nameDe.trim().toLowerCase(), m]))

    // An item sold out by its stock stays sold out until it is restocked.
    const available = (it: (typeof parsed.items)[number], current?: (typeof existing)[number]) =>
      it.isAvailable && current?.stock !== 0
    const rows: MenuImportRow[] = parsed.items.map((it) => {
      const current = byName.get(it.nameDe.toLowerCase())
      if (!current) return { row: it.row, nameDe: it.nameDe, action: 'create' }
      const same = current.nameEn === it.nameEn && current.priceCents === it.priceCents
        && (it.depositCents === undefined || current.depositCents === it.depositCents)
        && current.category === it.category && current.station === it.station
        && (it.subcategory === undefined || (current.subcategory ?? null) === it.subcategory)
        && current.isAvailable === available(it, current)
        && (it.sortOrder === undefined || current.sortOrder === it.sortOrder)
        && (it.allergens === undefined || (current.allergens ?? null)?.join() === it.allergens?.join())
        && (it.diet === undefined || (current.diet ?? null) === it.diet)
      return { row: it.row, nameDe: it.nameDe, action: same ? 'unchanged' : 'update' }
    })
    const count = (a: MenuImportRow['action']) => rows.filter((r) => r.action === a).length
    const result: MenuImportResult = {
      applied: false,
      created: count('create'),
      updated: count('update'),
      unchanged: count('unchanged'),
      rows,
      errors: parsed.errors,
    }
    if (dryRun || parsed.errors.length > 0) return result

    await db.transaction(async (tx) => {
      for (const it of parsed.items) {
        const current = byName.get(it.nameDe.toLowerCase())
        const values = {
          nameDe: it.nameDe,
          nameEn: it.nameEn,
          priceCents: it.priceCents,
          ...(it.depositCents !== undefined ? { depositCents: it.depositCents } : {}),
          category: it.category,
          ...(it.subcategory !== undefined ? { subcategory: it.subcategory } : {}),
          station: it.station,
          isAvailable: available(it, current),
          ...(it.sortOrder !== undefined ? { sortOrder: it.sortOrder } : {}),
          ...(it.allergens !== undefined ? { allergens: it.allergens } : {}),
          ...(it.diet !== undefined ? { diet: it.diet } : {}),
        }
        if (current) await tx.update(menuItems).set(values).where(eq(menuItems.id, current.id))
        else await tx.insert(menuItems).values({ ...values, eventId: ev.id, sortOrder: it.sortOrder ?? 0 })
      }
      await writeAudit(tx, {
        action: 'menu_import',
        staffId: admin.staffId,
        targetKind: 'event',
        targetId: ev.id,
        payload: {
          fileName: file.filename ?? null,
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          // Which articles; the values are in the file and the menu itself.
          changedItems: rows.filter((r) => r.action !== 'unchanged').map((r) => ({ nameDe: r.nameDe, action: r.action })),
        },
      })
    })
    return { ...result, applied: true }
  }
  catch (err) {
    sendAppError(event, err)
  }
})
