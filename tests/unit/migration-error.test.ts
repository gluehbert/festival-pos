import { describe, expect, it } from 'vitest'
import { migrationError } from '../../scripts/lib/migration-error'

describe('migrationError', () => {
  it('names the Postgres reason and the failed statement', () => {
    const cause = Object.assign(new Error('column "buzzer_key" of relation "events" already exists'), { code: '42701' })
    const err = Object.assign(new Error('Failed query: ALTER TABLE "events" ADD COLUMN "buzzer_key" varchar(32);\nparams: '), { cause })
    expect(migrationError(err)).toBe([
      'migrate: failed: column "buzzer_key" of relation "events" already exists',
      '  code: 42701',
      '  Failed query: ALTER TABLE "events" ADD COLUMN "buzzer_key" varchar(32);',
    ].join('\n'))
  })

  it('reports a bare error, e.g. a refused connection', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })
    expect(migrationError(err)).toBe('migrate: failed: connect ECONNREFUSED 127.0.0.1:5432\n  code: ECONNREFUSED')
  })
})
