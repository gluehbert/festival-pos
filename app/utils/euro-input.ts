// "12,50 €", "12.5", "1.234,50" → cents; null when it is not an amount.
export function parseEuroInput(raw: string): number | null {
  let s = raw.replace(/[\s€]/g, '')
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '')
  s = s.replace(',', '.')
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null
  const [whole, frac = ''] = s.split('.')
  return Number.parseInt(whole!, 10) * 100 + Number.parseInt(frac.padEnd(2, '0') || '0', 10)
}
