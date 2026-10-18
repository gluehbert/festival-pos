import { describe, expect, it } from 'vitest'
import { HealthSchema } from '../../server/lib/contracts/health'

describe('HealthSchema', () => {
  it('accepts the documented shape', () => {
    const parsed = HealthSchema.parse({ status: 'ok', dbLatencyMs: 42 })
    expect(parsed.status).toBe('ok')
    expect(parsed.dbLatencyMs).toBe(42)
  })

  it('rejects negative latency', () => {
    expect(() => HealthSchema.parse({ status: 'ok', dbLatencyMs: -1 })).toThrow()
  })

  it('rejects wrong status literal', () => {
    expect(() => HealthSchema.parse({ status: 'fail', dbLatencyMs: 0 })).toThrow()
  })
})
