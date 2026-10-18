#!/usr/bin/env node
// T133 / SC-006, NFR-001: lightweight performance smoke. Runs autocannon
// against the MVP's hottest paths for ~60s at the documented per-role
// concurrency (10 guests + 3 staff + 2 station clients = 15 connections).
// Fails the process when the observed p95 latency exceeds 500ms.
//
// Intentionally lives outside vitest. Wired into the GH workflow as a
// non-blocking job; flip `continue-on-error: false` after the first green run.
import process from 'node:process'
import autocannon from 'autocannon'

const BASE = process.env.PERF_BASE_URL ?? 'http://localhost:3000'
const DURATION = Number(process.env.PERF_DURATION_S ?? 60)
const P95_BUDGET_MS = Number(process.env.PERF_P95_BUDGET_MS ?? 500)

interface Scenario {
  name: string
  method: 'GET' | 'POST'
  path: string
  connections: number
  headers?: Record<string, string>
  body?: string
}

const scenarios: Scenario[] = [
  { name: 'GET /api/menu', method: 'GET', path: '/api/menu', connections: 10 },
  { name: 'GET /api/tickets', method: 'GET', path: '/api/tickets', connections: 3 },
  { name: 'GET /api/production/queue', method: 'GET', path: '/api/production/queue', connections: 2 },
  {
    name: 'POST /api/orders',
    method: 'POST',
    path: '/api/orders',
    connections: 10,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tableNo: 3, items: [] }),
  },
]

interface CannonResult { latency: { p95?: number; average: number } }

function run(scenario: Scenario): Promise<CannonResult> {
  return new Promise((resolve, reject) => {
    autocannon(
      {
        url: BASE + scenario.path,
        method: scenario.method,
        headers: scenario.headers,
        body: scenario.body,
        connections: scenario.connections,
        duration: DURATION,
      },
      // autocannon's callback types are looser than our shape; coerce.
      (err: Error | null, result: unknown) => (err ? reject(err) : resolve(result as CannonResult)),
    )
  })
}

const summary: Array<{ name: string; p95: number }> = []
for (const s of scenarios) {
  console.log(`▶ ${s.name} (conn=${s.connections}, duration=${DURATION}s)`)
  const r = await run(s)
  summary.push({ name: s.name, p95: r.latency.p95 ?? r.latency.average })
}

let failed = false
for (const r of summary) {
  const ok = r.p95 <= P95_BUDGET_MS
  console.log(`${ok ? '✓' : '✗'} ${r.name}: p95=${r.p95}ms (budget ${P95_BUDGET_MS}ms)`)
  if (!ok) failed = true
}
process.exit(failed ? 1 : 0)
