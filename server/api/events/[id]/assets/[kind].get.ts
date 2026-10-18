import { defineEventHandler, getQuery, getRouterParam, removeResponseHeader, setResponseHeader } from 'h3'
import { getDb } from '../../../../db/client'
import { AppError, sendAppError } from '../../../../lib/errors'
import { findAsset } from '../../../../lib/branding'
import { AssetKindEnum } from '../../../../lib/contracts/branding'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Public logo / dark-mode logo / flyer. URLs carry the content hash (?v=…), so a matching
// version can be cached forever; anything else is revalidated.
export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id') ?? ''
    const kind = AssetKindEnum.safeParse(getRouterParam(event, 'kind'))
    if (!UUID_RE.test(id) || !kind.success) throw new AppError('NOT_FOUND', 404, 'Not found')
    const asset = await findAsset(getDb(), id, kind.data)
    if (!asset) throw new AppError('NOT_FOUND', 404, 'Not found')

    const version = String(getQuery(event).v ?? '')
    setResponseHeader(event, 'Content-Type', asset.contentType)
    setResponseHeader(event, 'ETag', `"${asset.sha256}"`)
    setResponseHeader(event, 'Cache-Control', version && asset.sha256.startsWith(version)
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate')
    if (asset.contentType === 'application/pdf') {
      setResponseHeader(event, 'Content-Disposition', `inline; filename="${kind.data}.pdf"`)
      // Browsers' built-in PDF viewers do not work under the strict API CSP.
      removeResponseHeader(event, 'Content-Security-Policy')
    }
    return Buffer.from(asset.dataBase64, 'base64')
  }
  catch (err) {
    sendAppError(event, err)
  }
})
