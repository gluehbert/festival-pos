import { defineEventHandler, getQuery, setResponseHeader } from 'h3'
import { getDb } from '../../../../db/client'
import { sendAppError } from '../../../../lib/errors'
import { requireRole } from '../../../../lib/rbac'
import { eventIdParam, loadEvent } from '../../../../lib/events'
import { generateCheatSheetPdf } from '../../../../lib/cheat-sheet-pdf'
import { publicBaseUrl } from '../../../../lib/public-url'
import { joinUrl } from '../../../../lib/staff-join'

// Printable cheat sheet: one A4 page per role, the service page with the join QR.
export default defineEventHandler(async (event) => {
  try {
    requireRole(event, ['admin'])
    const ev = await loadEvent(getDb(), eventIdParam(event))
    const lang = getQuery(event).lang === 'en' ? 'en' : 'de'
    const bytes = await generateCheatSheetPdf({ eventName: ev.name, joinUrl: joinUrl(ev, publicBaseUrl(event)), lang })
    setResponseHeader(event, 'Content-Type', 'application/pdf')
    setResponseHeader(event, 'Content-Disposition', 'attachment; filename="cheat-sheet.pdf"')
    return Buffer.from(bytes)
  }
  catch (err) {
    sendAppError(event, err)
  }
})
