export function toCents(euros: number): number {
  if (!Number.isFinite(euros)) {
    throw new TypeError('toCents: value must be a finite number')
  }
  return Math.round(euros * 100)
}

export function fromCents(cents: number): number {
  if (!Number.isInteger(cents)) {
    throw new TypeError('fromCents: value must be an integer')
  }
  return cents / 100
}

export function sumCents(values: readonly number[]): number {
  let total = 0
  for (const value of values) {
    if (!Number.isInteger(value)) {
      throw new TypeError('sumCents: all values must be integers')
    }
    total += value
  }
  return total
}

const formatters = new Map<string, Intl.NumberFormat>()

export function formatCents(cents: number, locale: 'de' | 'en'): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError('formatCents: value must be an integer')
  }
  const key = `${locale}:EUR`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-IE', {
      style: 'currency',
      currency: 'EUR',
    })
    formatters.set(key, formatter)
  }
  return formatter.format(cents / 100)
}
