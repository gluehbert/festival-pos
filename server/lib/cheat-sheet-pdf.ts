import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import QRCode from 'qrcode'
import de from '../../app/i18n/de.json'
import en from '../../app/i18n/en.json'

// One A4 page per role to lay out at the stations: the same three steps the
// app shows under "So geht's", then "What if …". The service page carries the
// join link as a QR code so new helpers can scan it from the sheet.

export const CHEAT_SHEET_ROLES = ['waiter', 'kitchen', 'bar', 'cafe', 'lead'] as const
export type CheatSheetRole = typeof CHEAT_SHEET_ROLES[number]
export type CheatSheetLang = 'de' | 'en'

export interface CheatSheetOptions {
  eventName: string
  joinUrl: string | null
  lang: CheatSheetLang
}

type Messages = typeof de
interface Step { title: string; text: string }
interface Faq { q: string; a: string }
interface Sheet { title: string; steps: Step[]; faq: Faq[] }

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89
const MARGIN = 48
const WIDTH = A4_WIDTH - 2 * MARGIN
const GREY = rgb(0.35, 0.35, 0.35)
const BRAND = rgb(0.43, 0.16, 0.85)
const QR_SIZE = 150

const faqList = (items: Record<string, Faq>): Faq[] => Object.values(items)

// Builds the texts of every page from the app's own messages, so the sheet
// and the screen never say different things.
export function cheatSheetTexts(lang: CheatSheetLang): Record<CheatSheetRole, Sheet> {
  const m: Messages = lang === 'en' ? (en as Messages) : de
  const cs = m.admin.cheatSheet
  const guide = m.production.guide
  const welcome = m.staff.welcome
  const station = (keys: Array<'arrive' | 'start' | 'done' | 'cafeClose'>) =>
    keys.map((k) => ({ title: cs.stepTitles[k], text: guide[k] }))
  return {
    waiter: {
      title: cs.roles.waiter,
      steps: (['order', 'bring', 'pay'] as const).map((k) => ({ title: welcome[k].title, text: welcome[k].text })),
      faq: faqList(cs.faq.waiter),
    },
    kitchen: { title: cs.roles.kitchen, steps: station(['arrive', 'start', 'done']), faq: faqList(cs.faq.station) },
    bar: { title: cs.roles.bar, steps: station(['arrive', 'start', 'done']), faq: faqList(cs.faq.station) },
    cafe: { title: cs.roles.cafe, steps: station(['arrive', 'done', 'cafeClose']), faq: faqList(cs.faq.station) },
    lead: {
      title: cs.roles.lead,
      steps: (['overview', 'assign', 'fix'] as const).map((k) => ({ title: cs.stepTitles[k], text: cs.lead[k] })),
      faq: faqList(cs.faq.lead),
    },
  }
}

// The standard fonts only know WinAnsi; anything else would throw.
function safe(text: string, font: PDFFont): string {
  let out = ''
  for (const ch of text) {
    try {
      font.encodeText(ch)
      out += ch
    }
    catch {
      out += '?'
    }
  }
  return out
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of safe(text, font).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line)
      line = word
    }
    else line = next
  }
  if (line) lines.push(line)
  return lines
}

async function qrPng(url: string): Promise<Uint8Array> {
  const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'Q', margin: 1, scale: 8 })
  return Uint8Array.from(Buffer.from(dataUrl.split(',', 2)[1] ?? '', 'base64'))
}

export async function generateCheatSheetPdf(opts: CheatSheetOptions): Promise<Uint8Array> {
  const cs = (opts.lang === 'en' ? (en as Messages) : de).admin.cheatSheet
  const sheets = cheatSheetTexts(opts.lang)
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${cs.steps} — ${opts.eventName}`)
  pdf.setCreator('Festival POS')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  for (const role of CHEAT_SHEET_ROLES) {
    const sheet = sheets[role]
    const page: PDFPage = pdf.addPage([A4_WIDTH, A4_HEIGHT])
    let y = A4_HEIGHT - MARGIN
    const line = (s: string, x: number, size: number, f: PDFFont, color = rgb(0, 0, 0)) => {
      page.drawText(s, { x, y, size, font: f, color })
    }
    const para = (s: string, x: number, size: number, f: PDFFont, width = WIDTH - (x - MARGIN)) => {
      for (const l of wrap(s, f, size, width)) {
        y -= size + 4
        line(l, x, size, f)
      }
    }

    y -= 28
    line(safe(sheet.title, bold), MARGIN, 28, bold, BRAND)
    y -= 20
    line(safe(opts.eventName, font), MARGIN, 12, font, GREY)

    y -= 40
    line(safe(cs.steps, bold), MARGIN, 18, bold)
    y -= 8
    sheet.steps.forEach((step, i) => {
      y -= 30
      page.drawCircle({ x: MARGIN + 14, y: y + 5, size: 14, color: BRAND })
      const n = String(i + 1)
      page.drawText(n, { x: MARGIN + 14 - bold.widthOfTextAtSize(n, 14) / 2, y, size: 14, font: bold, color: rgb(1, 1, 1) })
      line(safe(step.title, bold), MARGIN + 40, 16, bold)
      para(step.text, MARGIN + 40, 14, font)
      y -= 6
    })

    y -= 30
    line(safe(cs.help, bold), MARGIN, 18, bold)
    y -= 6
    for (const item of sheet.faq) {
      y -= 8
      para(item.q, MARGIN, 13, bold)
      para(item.a, MARGIN, 13, font)
    }

    if (role === 'waiter') {
      const top = MARGIN + QR_SIZE
      y = top - 14
      if (opts.joinUrl) {
        page.drawImage(await pdf.embedPng(await qrPng(opts.joinUrl)), { x: MARGIN, y: MARGIN, width: QR_SIZE, height: QR_SIZE })
        const x = MARGIN + QR_SIZE + 20
        line(safe(cs.joinTitle, bold), x, 16, bold)
        para(cs.joinText, x, 12, font)
        y -= 10
        para(opts.joinUrl, x, 9, font)
      }
      else {
        line(safe(cs.joinTitle, bold), MARGIN, 16, bold)
        para(cs.joinMissing, MARGIN, 12, font)
      }
    }
  }
  return await pdf.save()
}
