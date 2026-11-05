import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Volunteers see the app once a year: one word per thing, in plain German.
// These words were replaced on purpose (UX review 2026-11); this test keeps
// them from coming back with a new text.
const BANNED: Array<[RegExp, string]> = [
  [/\bService\b/, 'Bedienung'],
  [/\bPreisliste\b/, 'Speisekarte'],
  [/\bPosition(en)?\b/, 'Artikel'],
  [/\bWalk-?ins?\b/i, 'Ohne Tisch'],
  [/\bProduktion\b/, 'Küche & Bar'],
  [/\bStaff\b/, 'Helfer / Bedienung'],
  [/\bNachgefragt\b/, 'War am Tisch'],
]

function strings(node: unknown, path: string[] = []): Array<[string, string]> {
  if (typeof node === 'string') return [[path.join('.'), node]]
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([k, v]) => strings(v, [...path, k]))
  return []
}

describe('German wording', () => {
  const de = JSON.parse(readFileSync(new URL('../../app/i18n/de.json', import.meta.url), 'utf8'))

  it.each(BANNED)('does not use %s (say „%s“)', (word) => {
    const hits = strings(de).filter(([, text]) => word.test(text)).map(([key]) => key)
    expect(hits).toEqual([])
  })
})
