import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import journal from '../../server/db/migrations/meta/_journal.json'
import { readSchemaVersion } from '../../server/lib/schema-version'
import { isSchemaMismatch } from '../../server/lib/errors'
import type { Db } from '../../server/db/client'
import { freshDatabase, testDatabaseUrl, type RealPg } from '../setup/real-pg'

const url = testDatabaseUrl()
const latest = journal.entries[journal.entries.length - 1]!

describe.skipIf(!url)('schema version against real Postgres', () => {
  let real: RealPg

  beforeAll(async () => {
    real = await freshDatabase(url!)
  })
  afterAll(async () => {
    await real?.pool.end()
  })

  it('matches after the committed migrations ran', async () => {
    expect(await readSchemaVersion(real.db as unknown as Db)).toEqual({ expected: latest.tag, actual: latest.tag, match: true })
  })

  it('notices a database a newer deploy migrated', async () => {
    await real.db.execute(sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('newer', ${latest.when + 1})`)
    const v = await readSchemaVersion(real.db as unknown as Db)
    expect(v.match).toBe(false)
    expect(v.actual).toBe(`newer than ${latest.tag}`)
  })

  it('recognises the driver error of a dropped column', async () => {
    const err = await real.db.execute(sql`SELECT no_such_column FROM events`).catch((e: unknown) => e)
    expect(isSchemaMismatch(err)).toBe(true)
  })
})
