import { describe, expect, it } from 'vitest'
import {
  checkConsistency, endpointLabel, percentile, Recorder, summarize, verdict,
  type ReportTotals,
} from '../perf/metrics'

const totals = (over: Partial<ReportTotals> = {}): ReportTotals => ({
  paymentsNetCents: 0, paymentsTipCents: 0, revenueCents: 0, depositIssuedCents: 0, tipsReportCents: 0, orderCount: 0, ...over,
})

describe('percentile', () => {
  const ms = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  it('uses the nearest rank', () => {
    expect(percentile(ms, 50)).toBe(50)
    expect(percentile(ms, 95)).toBe(100)
    expect(percentile(ms, 99)).toBe(100)
    expect(percentile([5], 99)).toBe(5)
  })
  it('does not depend on the order and is 0 without samples', () => {
    expect(percentile([30, 10, 20], 50)).toBe(20)
    expect(percentile([], 95)).toBe(0)
  })
})

describe('endpointLabel', () => {
  it('folds ids and table keys', () => {
    expect(endpointLabel('GET', '/api/tickets/t-12')).toBe('GET /api/tickets/:key')
    expect(endpointLabel('POST', '/api/order-items/0b9c1d6e-1a2b-4c3d-8e4f-5a6b7c8d9e0f/void')).toBe('POST /api/order-items/:id/void')
  })
})

describe('summarize and verdict', () => {
  it('counts contention 409s apart from errors', () => {
    const rec = new Recorder()
    for (let i = 0; i < 97; i++) rec.add({ endpoint: 'GET /a', status: 200, ms: 100 })
    rec.add({ endpoint: 'POST /b', status: 409, ms: 50, code: 'LOCK_CONFLICT' })
    rec.add({ endpoint: 'POST /b', status: 409, ms: 50, code: 'CONFLICT' })
    rec.add({ endpoint: 'POST /b', status: 500, ms: 50 })
    const s = summarize(rec)
    expect(s.lockConflicts).toBe(1)
    expect(s.conflicts).toBe(1)
    expect(s.errors).toBe(1)
    expect(s.errorRate).toBeCloseTo(0.01)
    expect(s.statusCodes).toEqual({ 200: 97, 409: 2, 500: 1 })
  })

  it('fails on p95, error rate, slow or missing visibility and duplicates', () => {
    const rec = new Recorder()
    for (let i = 0; i < 10; i++) rec.add({ endpoint: 'GET /slow', status: 200, ms: 600 })
    rec.add({ endpoint: 'GET /err', status: 503, ms: 10 })
    rec.seen('orderToQueue', 5001)
    rec.missed('doneToWaiter')
    const fails = verdict(summarize(rec), { ok: true, skipped: false, problems: [] }, 1).join('\n')
    expect(fails).toContain('p95 600 ms')
    expect(fails).toContain('error rate')
    expect(fails).toContain('orderToQueue visibility 5001')
    expect(fails).toContain('doneToWaiter: 1 samples')
    expect(fails).toContain('booked twice')
  })

  it('passes a healthy run', () => {
    const rec = new Recorder()
    rec.add({ endpoint: 'GET /a', status: 200, ms: 40 })
    rec.seen('orderToQueue', 4200)
    rec.seen('doneToWaiter', 3000)
    expect(verdict(summarize(rec), { ok: true, skipped: false, problems: [] }, 0)).toEqual([])
  })
})

describe('checkConsistency', () => {
  const before = totals({ orderCount: 10, tipsReportCents: 100 })
  // 2 x 450 revenue + 100 deposit = 1000 net cash, 300 of tips on top.
  const after = totals({
    paymentsNetCents: 1000, paymentsTipCents: 400, revenueCents: 900, depositIssuedCents: 100, tipsReportCents: 400, orderCount: 14,
  })

  it('accepts net cash = revenue + deposit with tips kept apart', () => {
    expect(checkConsistency(before, after, { orders: 4, tipCents: 300 })).toEqual({ ok: true, skipped: false, problems: [] })
  })

  it('reports tips that leaked into revenue', () => {
    const r = checkConsistency(before, { ...after, revenueCents: 1200 }, { orders: 4, tipCents: 300 })
    expect(r.ok).toBe(false)
    expect(r.problems[0]).toContain('Net cash 1000 != revenue 1200 + deposit 100')
  })

  it('reports a missing or duplicated order and wrong tips', () => {
    const r = checkConsistency(before, after, { orders: 3, tipCents: 250 })
    expect(r.problems).toEqual([
      'Orders in reports +4, but 3 were created',
      'Tips in reports +300, but 250 were booked',
    ])
  })

  it('skips when the reports did not move (rehearsal mode)', () => {
    const r = checkConsistency(before, before, { orders: 4, tipCents: 0 })
    expect(r).toMatchObject({ ok: true, skipped: true })
  })
})
