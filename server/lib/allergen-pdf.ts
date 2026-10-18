import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { ALLERGENS, DIET_LABEL, allergenCodes, type Allergen, type Diet } from './allergens'

export interface AllergenPdfItem {
  nameDe: string
  category: string
  subcategory: string | null
  allergens: Allergen[] | null
  diet: Diet | null
}

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89
const MARGIN = 40
const ROW = 16
const GREY = rgb(0.35, 0.35, 0.35)
const COL_CODES = 330
const COL_DIET = 470

export const ALLERGEN_PDF_DISCLAIMER = [
  'The codes mark the major allergens contained (EU Regulation 1169/2011).',
  'We cannot rule out traces of other allergens. If in doubt, please ask our staff.',
]

function fit(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1)
  return `${t}…`
}

// Printable A4 notice for the counter: every item with its allergen codes,
// grouped by category, followed by the legend.
export async function generateAllergenPdf(eventName: string, items: AllergenPdfItem[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Allergens — ${eventName}`)
  pdf.setCreator('Festival POS')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let page: PDFPage = pdf.addPage([A4_WIDTH, A4_HEIGHT])
  let y = A4_HEIGHT - MARGIN
  const text = (s: string, x: number, size = 10, f = font, color = rgb(0, 0, 0)) =>
    page.drawText(s, { x, y, size, font: f, color })
  const newPage = () => {
    page = pdf.addPage([A4_WIDTH, A4_HEIGHT])
    y = A4_HEIGHT - MARGIN
  }
  const need = (h: number) => {
    if (y - h < MARGIN) newPage()
  }

  text('Allergen information', MARGIN, 18, bold)
  y -= 18
  text(fit(eventName, font, 12, A4_WIDTH - 2 * MARGIN), MARGIN, 12)
  y -= 16
  for (const line of ALLERGEN_PDF_DISCLAIMER) {
    text(line, MARGIN, 9, font, GREY)
    y -= 12
  }
  y -= 10

  let group = ''
  for (const it of items) {
    const g = it.subcategory ? `${it.category} › ${it.subcategory}` : it.category
    if (g !== group) {
      need(ROW * 3)
      y -= 6
      text(fit(g, bold, 12, A4_WIDTH - 2 * MARGIN), MARGIN, 12, bold)
      text('Allergens', COL_CODES, 8, font, GREY)
      y -= 4
      page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 0.5, color: GREY })
      y -= ROW - 4
      group = g
    }
    need(ROW)
    text(fit(it.nameDe, font, 10, COL_CODES - MARGIN - 10), MARGIN)
    if (it.allergens === null) text('on request', COL_CODES, 10, font, GREY)
    else text(it.allergens.length > 0 ? allergenCodes(it.allergens) : '–', COL_CODES, 10, bold)
    if (it.diet) text(DIET_LABEL[it.diet], COL_DIET, 10)
    y -= ROW
  }

  need(ROW * (Math.ceil(ALLERGENS.length / 2) + 3))
  y -= 14
  text('Legend', MARGIN, 12, bold)
  y -= ROW
  // Two columns, read top to bottom: A–G left, H–R right.
  const colW = (A4_WIDTH - 2 * MARGIN) / 2
  const perCol = Math.ceil(ALLERGENS.length / 2)
  ALLERGENS.forEach((a, i) => {
    const x = MARGIN + Math.floor(i / perCol) * colW
    const rowY = y - (i % perCol) * ROW
    page.drawText(a.code, { x, y: rowY, size: 10, font: bold })
    page.drawText(fit(a.en, font, 10, colW - 30), { x: x + 18, y: rowY, size: 10, font })
  })

  return await pdf.save()
}
