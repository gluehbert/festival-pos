#!/usr/bin/env node
// Full festival flow as a load test: guests order from their phones, waiters
// collect, kitchen and bar work the queue, the admin reads the reports. Prints
// a Markdown table and writes a JSON file; exits 1 when p95 > 500 ms
// (NFR-001), the error rate > 1 %, a status change takes > 5 s to show up
// (SC-005) or the reports do not add up.
//
// Run it against a seeded app (admin / admin123, kitchen1 and bar1 with PIN
// 1111, event PIN DEMO1234). Orders and payments are real unless the event is
// in rehearsal mode, so use a rehearsal event or a throwaway database.
import { writeFileSync } from 'node:fs'
import process from 'node:process'
import {
  admin, Client, guest, readTotals, station, waiter,
  type MenuItem, type World,
} from './actors.ts'
import { checkConsistency, Recorder, renderMarkdown, summarize, verdict } from './metrics.ts'

const num = (name: string, fallback: number) => Number(process.env[name] ?? fallback)
const BASE = (process.env.PERF_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const TABLES = num('PERF_TABLES', 30)
const GUESTS = num('PERF_GUESTS', 40)
const WAITERS = num('PERF_WAITERS', 6)
const DURATION_S = num('PERF_DURATION_S', 300)
const ORDERS_PER_HOUR = num('PERF_ORDERS_PER_HOUR', 300) // spec: 200/h
const OUT = process.env.PERF_OUT ?? 'perf-flow-result.json'
const WAITER_PIN = '4711'
// Staff keep polling a little after the guests stop, so the last changes can show up.
const DRAIN_MS = 12000
// Phones and staff do not all sign in in the same instant: spread the start.
const RAMP_MS = 10000
// A sample younger than this may simply not have been polled yet.
const GRACE_MS = 8000

interface StaffRow { id: string, username: string }

function fail(message: string): never {
  console.error(message)
  process.exit(2)
}

// Creates the waiter accounts, or resets the PIN of those that exist.
async function ensureWaiters(c: Client): Promise<string[]> {
  const list = await c.call<{ staff: StaffRow[] }>('GET', '/api/admin/staff')
  if (list.status !== 200) fail(`Cannot list staff (${list.status})`)
  const existing = new Map(list.data.staff.map((s) => [s.username, s.id]))
  const names: string[] = []
  for (let i = 1; i <= WAITERS; i++) {
    const username = `perf-waiter-${i}`
    names.push(username)
    const id = existing.get(username)
    const res = id
      ? await c.call('PATCH', `/api/admin/staff/${id}`, { body: { pin: WAITER_PIN, isActive: true } })
      : await c.call('POST', '/api/admin/staff', { body: { username, role: 'waiter', pin: WAITER_PIN } })
    if (res.status !== 200 && res.status !== 201) fail(`Cannot set up ${username} (${res.status})`)
  }
  return names
}

async function main(): Promise<number> {
  const setupRec = new Recorder() // setup and the final read stay out of the numbers
  const setup = new Client({ base: BASE, rec: setupRec })
  const login = await setup.call('POST', '/api/auth/login', { body: { username: 'admin', secret: 'admin123', kind: 'password' } })
  if (login.status !== 200) fail(`Admin login failed (${login.status}): is the app seeded?`)

  const events = await setup.call<{ events: Array<{ id: string, isActive: boolean, tableRangeFrom: number, tableRangeTo: number, trialMode: boolean }> }>('GET', '/api/admin/events')
  const ev = events.data?.events?.find((e) => e.isActive)
  if (!ev) fail('No active event')
  const menu = await setup.call<{ items: Array<MenuItem & { isAvailable: boolean }> }>('GET', '/api/menu')
  // Items that run out would turn the test into a stock test.
  const orderable = (menu.data?.items ?? []).filter((m) => m.isAvailable && (m.stock === null || m.stock >= 100))
  if (orderable.length === 0) fail('No orderable menu items without a low stock')

  const waiterNames = await ensureWaiters(setup)
  const tableCount = Math.min(TABLES, ev.tableRangeTo - ev.tableRangeFrom + 1)
  const tables = Array.from({ length: tableCount }, (_, i) => ev.tableRangeFrom + i)
  const before = await readTotals(setup, ev.id)
  if (!before) fail('Cannot read the reports')

  const rec = new Recorder()
  const start = Date.now()
  const w: World = {
    base: BASE, rec, eventId: ev.id, tables, waiterCount: WAITERS, guestCount: GUESTS, ordersPerHour: ORDERS_PER_HOUR,
    menu: orderable,
    guestsUntil: start + DURATION_S * 1000,
    drainUntil: start + DURATION_S * 1000 + DRAIN_MS,
    orderPending: new Map(),
    donePending: new Map(),
    tableOrders: new Map(),
  }
  console.log(`Flow against ${BASE}: ${GUESTS} guests at ${tableCount} tables, ${WAITERS} waiters, ${DURATION_S}s, ${ORDERS_PER_HOUR} orders/h${ev.trialMode ? ' (event in rehearsal mode)' : ''}`)

  const adminClient = new Client(w)
  await adminClient.call('POST', '/api/auth/login', { body: { username: 'admin', secret: 'admin123', kind: 'password' } })
  const later = (ms: number, run: () => Promise<void>) => new Promise<void>((r) => setTimeout(r, ms)).then(run)
  await Promise.all([
    ...Array.from({ length: GUESTS }, (_, i) => later((i / GUESTS) * RAMP_MS, () => guest(w, i))),
    ...waiterNames.map((name, i) => later(i * 500, () => waiter(w, i, name, WAITER_PIN))),
    later(0, () => station(w, 'kitchen1', 'kitchen')),
    later(250, () => station(w, 'bar1', 'bar')),
    admin(w, adminClient),
  ])

  const old = (at: number) => performance.now() - at > GRACE_MS
  for (const p of w.orderPending.values()) if (old(p.at)) rec.missed('orderToQueue')
  for (const p of w.donePending.values()) if (old(p.at)) rec.missed('doneToWaiter')

  const after = await readTotals(setup, ev.id)
  if (!after) fail('Cannot read the reports')
  const consistency = checkConsistency(before, after, {
    orders: rec.counters.ordersCreated ?? 0,
    tipCents: rec.counters.tipCents ?? 0,
  })
  const summary = summarize(rec)
  const fails = verdict(summary, consistency, rec.counters.duplicateOrders ?? 0)
  const markdown = renderMarkdown(summary, consistency, fails, rec.counters)
  console.log(`\n${markdown}`)
  writeFileSync(OUT, JSON.stringify({
    config: { base: BASE, tables: tableCount, guests: GUESTS, waiters: WAITERS, durationS: DURATION_S, ordersPerHour: ORDERS_PER_HOUR },
    summary, consistency, counters: rec.counters, fails, pass: fails.length === 0,
  }, null, 2))
  console.log(`\nWrote ${OUT}. Local numbers are not Vercel numbers: compare only runs against the same target.`)
  return fails.length === 0 ? 0 : 1
}

process.exit(await main())
