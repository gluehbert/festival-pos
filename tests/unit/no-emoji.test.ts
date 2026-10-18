import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Same character set as the no-emoji rule in eslint.config.mjs, which cannot see JSON.
const EMOJI = /[\u{1F000}-\u{1FBFF}\u2190-\u21FF\u2300-\u23FF\u2600-\u27BF\u2B00-\u2BFF]|\uFE0F/u

function strings(value: unknown, path: string): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]]
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k))
  }
  return []
}

describe('i18n texts', () => {
  it.each(['de', 'en'])('%s.json contains no emoji or symbol icons', (locale) => {
    const json = JSON.parse(readFileSync(new URL(`../../app/i18n/${locale}.json`, import.meta.url), 'utf8'))
    expect(strings(json, '').filter(([, text]) => EMOJI.test(text))).toEqual([])
  })
})
