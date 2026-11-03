import { describe, expect, it } from 'vitest'
import journal from '../../server/db/migrations/meta/_journal.json'
import { describeSchema } from '../../server/lib/schema-version'

const entries = journal.entries
const latest = entries[entries.length - 1]!
const previous = entries[entries.length - 2]!

describe('describeSchema', () => {
  it('matches when the database ran this build\'s latest migration', () => {
    expect(describeSchema(latest.when)).toEqual({ expected: latest.tag, actual: latest.tag, match: true })
  })

  it('names an older database by its migration', () => {
    expect(describeSchema(previous.when)).toEqual({ expected: latest.tag, actual: previous.tag, match: false })
  })

  it('says so when a newer deploy already migrated the database', () => {
    expect(describeSchema(latest.when + 1000)).toEqual({ expected: latest.tag, actual: `newer than ${latest.tag}`, match: false })
  })

  it('reports a database that was never migrated', () => {
    expect(describeSchema(null)).toEqual({ expected: latest.tag, actual: null, match: false })
  })
})
