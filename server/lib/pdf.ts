import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import { tableKey } from './table-key'

export interface QrPdfEvent {
  id: string
  name: string
}

export interface QrPdfOptions {
  event: QrPdfEvent
  from: number
  to: number
  appUrl: string
}

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89
const MARGIN = 28
const COLS = 4
const ROWS = 6
const PER_PAGE = COLS * ROWS

function buildTableUrl(appUrl: string, eventId: string, tableNo: number): string {
  const base = appUrl.replace(/\/+$/, '')
  return `${base}/t/${tableNo}?k=${tableKey(eventId, tableNo)}`
}

async function renderQrPng(url: string): Promise<Uint8Array> {
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'Q',
    margin: 1,
    scale: 6,
    color: { dark: '#000000', light: '#FFFFFF' },
  })
  const base64 = dataUrl.split(',', 2)[1] ?? ''
  return Uint8Array.from(Buffer.from(base64, 'base64'))
}

export async function generateQrPdf(opts: QrPdfOptions): Promise<Uint8Array> {
  const { event, from, to, appUrl } = opts
  if (to < from) {
    throw new Error('Invalid range: to < from')
  }
  const totalCodes = to - from + 1
  const pageCount = Math.ceil(totalCodes / PER_PAGE)

  const pdf = await PDFDocument.create()
  pdf.setTitle(`QR Codes — ${event.name}`)
  pdf.setCreator('Festival POS')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const usableWidth = A4_WIDTH - 2 * MARGIN
  const usableHeight = A4_HEIGHT - 2 * MARGIN
  const cellW = usableWidth / COLS
  const cellH = usableHeight / ROWS
  const qrSize = Math.min(cellW, cellH) - 36

  // No event PIN on the cards: it opens any table, the QR key only this one.
  const eventLabel = event.name

  for (let p = 0; p < pageCount; p++) {
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT])
    for (let i = 0; i < PER_PAGE; i++) {
      const tableNo = from + p * PER_PAGE + i
      if (tableNo > to) break
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const cellX = MARGIN + col * cellW
      const cellY = A4_HEIGHT - MARGIN - (row + 1) * cellH

      const url = buildTableUrl(appUrl, event.id, tableNo)
      const pngBytes = await renderQrPng(url)
      const png = await pdf.embedPng(pngBytes)
      const qrX = cellX + (cellW - qrSize) / 2
      const qrY = cellY + (cellH - qrSize) / 2 + 12
      page.drawImage(png, { x: qrX, y: qrY, width: qrSize, height: qrSize })

      const caption = `Table ${tableNo}`
      const captionSize = 12
      const captionWidth = fontBold.widthOfTextAtSize(caption, captionSize)
      page.drawText(caption, {
        x: cellX + (cellW - captionWidth) / 2,
        y: qrY - 14,
        size: captionSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      })

      if (eventLabel) {
        const subSize = 8
        const subWidth = font.widthOfTextAtSize(eventLabel, subSize)
        page.drawText(eventLabel, {
          x: cellX + (cellW - subWidth) / 2,
          y: qrY - 26,
          size: subSize,
          font,
          color: rgb(0.3, 0.3, 0.3),
        })
      }
    }
  }

  return await pdf.save()
}
