// Measurements of the full-flow load test: latency percentiles per endpoint,
// status codes, visibility delays and the end-of-run consistency check.

export const P95_BUDGET_MS = 500 // NFR-001
export const ERROR_RATE_BUDGET = 0.01
export const VISIBILITY_BUDGET_MS = 5000 // SC-005

// Nearest-rank percentile; p in (0, 100].
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!
}

// Same endpoint, whatever the ids: "/api/tickets/t-7" → "/api/tickets/:key".
export function endpointLabel(method: string, path: string): string {
  const clean = path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/t-\d+/g, '/:key')
  return `${method} ${clean}`
}

// 409s that come from several people working on the same thing: counted on
// their own and not an error of the app.
const CONTENTION_CODES = new Set(['LOCK_CONFLICT', 'CONFLICT'])

export interface Sample {
  endpoint: string
  status: number // 0 = no response (network error, timeout)
  ms: number
  code?: string
}

export type VisibilityKind = 'orderToQueue' | 'doneToWaiter'

export class Recorder {
  samples: Sample[] = []
  visibility: Record<VisibilityKind, number[]> = { orderToQueue: [], doneToWaiter: [] }
  visibilityMissed: Record<VisibilityKind, number> = { orderToQueue: 0, doneToWaiter: 0 }
  // Counters of the flow itself.
  counters: Record<string, number> = {}

  add(sample: Sample): void {
    this.samples.push(sample)
  }

  seen(kind: VisibilityKind, ms: number): void {
    this.visibility[kind].push(Math.max(0, Math.round(ms)))
  }

  missed(kind: VisibilityKind): void {
    this.visibilityMissed[kind]++
  }

  count(name: string, by = 1): void {
    this.counters[name] = (this.counters[name] ?? 0) + by
  }
}

export interface EndpointStats { endpoint: string, count: number, p50: number, p95: number, p99: number, errors: number }

export interface Summary {
  requests: number
  endpoints: EndpointStats[]
  statusCodes: Record<string, number>
  lockConflicts: number
  conflicts: number
  // Failed requests without the contention 409s above.
  errors: number
  errorRate: number
  worstP95Ms: number
  visibility: Record<VisibilityKind, { count: number, missed: number, p50: number, p95: number, max: number }>
}

const isContention = (s: Sample) => s.status === 409 && !!s.code && CONTENTION_CODES.has(s.code)
const isError = (s: Sample) => (s.status === 0 || s.status >= 400) && !isContention(s)

export function summarize(rec: Recorder): Summary {
  const byEndpoint = new Map<string, Sample[]>()
  const statusCodes: Record<string, number> = {}
  let lockConflicts = 0
  let conflicts = 0
  for (const s of rec.samples) {
    byEndpoint.set(s.endpoint, [...(byEndpoint.get(s.endpoint) ?? []), s])
    const status = s.status === 0 ? 'network' : String(s.status)
    statusCodes[status] = (statusCodes[status] ?? 0) + 1
    if (s.status === 409 && s.code === 'LOCK_CONFLICT') lockConflicts++
    if (s.status === 409 && s.code === 'CONFLICT') conflicts++
  }
  const endpoints = [...byEndpoint.entries()]
    .map(([endpoint, list]) => {
      const ms = list.map((s) => s.ms)
      return {
        endpoint,
        count: list.length,
        p50: percentile(ms, 50),
        p95: percentile(ms, 95),
        p99: percentile(ms, 99),
        errors: list.filter(isError).length,
      }
    })
    .sort((a, b) => a.endpoint.localeCompare(b.endpoint))
  const errors = rec.samples.filter(isError).length
  const vis = (kind: VisibilityKind) => ({
    count: rec.visibility[kind].length,
    missed: rec.visibilityMissed[kind],
    p50: percentile(rec.visibility[kind], 50),
    p95: percentile(rec.visibility[kind], 95),
    max: Math.max(0, ...rec.visibility[kind]),
  })
  return {
    requests: rec.samples.length,
    endpoints,
    statusCodes,
    lockConflicts,
    conflicts,
    errors,
    errorRate: rec.samples.length === 0 ? 0 : errors / rec.samples.length,
    worstP95Ms: Math.max(0, ...endpoints.map((e) => e.p95)),
    visibility: { orderToQueue: vis('orderToQueue'), doneToWaiter: vis('doneToWaiter') },
  }
}

// What the admin reports say, reduced to the numbers the check needs.
export interface ReportTotals {
  paymentsNetCents: number // payments_by_staff: net cash per staff, summed
  paymentsTipCents: number // payments_by_staff: tips, summed
  revenueCents: number // revenue_by_category, summed
  depositIssuedCents: number // deposits: Pfand collected with paid items
  tipsReportCents: number // tips: total row
  orderCount: number // orders_per_hour, summed
}

export interface ConsistencyResult {
  ok: boolean
  // True when the reports hold nothing at all (rehearsal mode: test data is not reported).
  skipped: boolean
  problems: string[]
}

// Net cash must be revenue plus Pfand; tips stay out of both. The run's own
// orders and tips are compared as a delta to the totals before the run.
export function checkConsistency(
  before: ReportTotals,
  after: ReportTotals,
  expected: { orders: number, tipCents: number },
): ConsistencyResult {
  const problems: string[] = []
  const empty = after.orderCount === before.orderCount && after.paymentsNetCents === before.paymentsNetCents
  if (empty && expected.orders > 0) {
    return { ok: true, skipped: true, problems: ['Reports did not change: is the event in rehearsal mode?'] }
  }
  if (after.paymentsNetCents !== after.revenueCents + after.depositIssuedCents) {
    problems.push(
      `Net cash ${after.paymentsNetCents} != revenue ${after.revenueCents} + deposit ${after.depositIssuedCents}`,
    )
  }
  if (after.paymentsTipCents !== after.tipsReportCents) {
    problems.push(`Tips per staff ${after.paymentsTipCents} != tips report ${after.tipsReportCents}`)
  }
  const orders = after.orderCount - before.orderCount
  if (orders !== expected.orders) problems.push(`Orders in reports +${orders}, but ${expected.orders} were created`)
  const tips = after.tipsReportCents - before.tipsReportCents
  if (tips !== expected.tipCents) problems.push(`Tips in reports +${tips}, but ${expected.tipCents} were booked`)
  return { ok: problems.length === 0, skipped: false, problems }
}

// Reasons to exit with 1; empty = the run passed.
export function verdict(s: Summary, consistency: ConsistencyResult, duplicates: number): string[] {
  const fails: string[] = []
  if (s.worstP95Ms > P95_BUDGET_MS) fails.push(`p95 ${s.worstP95Ms} ms > ${P95_BUDGET_MS} ms (NFR-001)`)
  if (s.errorRate > ERROR_RATE_BUDGET) fails.push(`error rate ${(s.errorRate * 100).toFixed(2)} % > 1 %`)
  for (const kind of ['orderToQueue', 'doneToWaiter'] as const) {
    const v = s.visibility[kind]
    if (v.max > VISIBILITY_BUDGET_MS) fails.push(`${kind} visibility ${v.max} ms > ${VISIBILITY_BUDGET_MS} ms (SC-005)`)
    if (v.missed > 0) fails.push(`${kind}: ${v.missed} samples never became visible`)
  }
  if (duplicates > 0) fails.push(`${duplicates} resent orders were booked twice`)
  if (!consistency.ok) fails.push(...consistency.problems)
  return fails
}

export function renderMarkdown(s: Summary, consistency: ConsistencyResult, fails: string[], counters: Record<string, number>): string {
  const lines = [
    '| Endpoint | n | p50 ms | p95 ms | p99 ms | errors |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...s.endpoints.map((e) => `| ${e.endpoint} | ${e.count} | ${e.p50} | ${e.p95} | ${e.p99} | ${e.errors} |`),
    '',
    `Requests: ${s.requests}, errors: ${s.errors} (${(s.errorRate * 100).toFixed(2)} %, 409 LOCK_CONFLICT/CONFLICT not counted)`,
    `Status codes: ${Object.entries(s.statusCodes).sort().map(([k, v]) => `${k}×${v}`).join(', ')}`,
    `409 LOCK_CONFLICT: ${s.lockConflicts}, 409 CONFLICT: ${s.conflicts}`,
    '',
    '| Visibility | samples | missed | p50 ms | p95 ms | max ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...(['orderToQueue', 'doneToWaiter'] as const).map((k) => {
      const v = s.visibility[k]
      const name = k === 'orderToQueue' ? 'ordered → production queue' : 'done → waiter'
      return `| ${name} | ${v.count} | ${v.missed} | ${v.p50} | ${v.p95} | ${v.max} |`
    }),
    '',
    `Flow: ${Object.entries(counters).sort().map(([k, v]) => `${k}=${v}`).join(', ')}`,
    `Consistency: ${consistency.skipped ? 'skipped' : consistency.ok ? 'ok' : 'FAILED'}${consistency.problems.length ? ` (${consistency.problems.join('; ')})` : ''}`,
    `Result: ${fails.length === 0 ? 'PASS' : `FAIL (${fails.join('; ')})`}`,
  ]
  return lines.join('\n')
}
