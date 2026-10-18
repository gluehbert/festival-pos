// The people of the festival as load: guests order from their phones, waiters
// collect, kitchen and bar work the queue, the admin watches the reports.
import { randomUUID } from 'node:crypto'
import { endpointLabel, type Recorder, type ReportTotals } from './metrics.ts'

export const EVENT_PIN = 'DEMO1234'
const GUEST_POLL_MS = 8000
const STAFF_POLL_MS = 4000
const ADMIN_POLL_MS = 15000
// Server limits for guests (server/lib/guest-order-limit.ts).
const GUEST_ORDERS_PER_TABLE = 15
const GUEST_WINDOW_MS = 10 * 60 * 1000
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export interface MenuItem { id: string, station: 'kitchen' | 'bar', stock: number | null }

export interface World {
  base: string
  rec: Recorder
  eventId: string
  tables: number[]
  waiterCount: number
  guestCount: number
  ordersPerHour: number
  menu: MenuItem[]
  guestsUntil: number // guests and admin stop here, staff keep going until drainUntil
  drainUntil: number
  // Visibility samples waiting to be seen: key → when it became true.
  orderPending: Map<string, { at: number }> // `${orderId}:${station}`
  donePending: Map<string, { at: number, tableNo: number }> // order item id
  tableOrders: Map<number, number[]>
}

// Sleeps, but never past `until`, so a long wait cannot hold the run open.
const nap = (ms: number, until: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, Math.min(ms, until - Date.now()))))
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1))
const expo = (mean: number) => Math.min(3 * mean, -Math.log(1 - Math.random()) * mean)
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)]!

interface Reply<T> { status: number, data: T, ms: number }

function errorCode(body: unknown): string | undefined {
  const b = body as { data?: { code?: string }, code?: string } | null
  return b?.data?.code ?? b?.code
}

// One device: its own cookies and CSRF token, like a browser.
export class Client {
  private cookies = new Map<string, string>()
  private w: Pick<World, 'base' | 'rec'>
  constructor(w: Pick<World, 'base' | 'rec'>) {
    this.w = w
  }

  async call<T = unknown>(method: string, path: string, opts: { body?: unknown, key?: string } = {}): Promise<Reply<T>> {
    const mutating = MUTATING.has(method)
    if (mutating && !this.cookies.has('csrf')) await this.call('GET', '/api/csrf-token')
    const headers: Record<string, string> = { accept: 'application/json' }
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    if (mutating) headers['x-csrf-token'] = this.cookies.get('csrf') ?? ''
    if (opts.body !== undefined) headers['content-type'] = 'application/json'
    if (opts.key) headers['idempotency-key'] = opts.key

    const t0 = performance.now()
    let status = 0
    let data: unknown = null
    try {
      const res = await fetch(this.w.base + path, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(20000),
      })
      const text = await res.text()
      status = res.status
      try { data = JSON.parse(text) }
      catch { data = null }
      this.store(res.headers.getSetCookie())
    }
    catch { /* status stays 0: counted as a network error */ }
    const ms = Math.round(performance.now() - t0)
    this.w.rec.add({ endpoint: endpointLabel(method, path), status, ms, code: errorCode(data) })
    return { status, data: data as T, ms }
  }

  private store(setCookies: string[]): void {
    for (const line of setCookies) {
      const [pair = ''] = line.split(';')
      const eq = pair.indexOf('=')
      if (eq < 1) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      if (value === '' || /max-age=0/i.test(line)) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }
}

// Calls fn every `ms` (after a random start, so devices do not poll in step).
async function every(until: number, ms: number, fn: () => Promise<void>): Promise<void> {
  await nap(rand(0, ms), until)
  while (Date.now() < until) {
    await fn()
    await nap(ms, until)
  }
}

export async function guest(w: World, index: number): Promise<void> {
  const c = new Client(w)
  const tableNo = w.tables[index % w.tables.length]!
  const joined = await c.call('POST', '/api/session', { body: { tableNo, pin: EVENT_PIN } })
  if (joined.status !== 200 && joined.status !== 201) return
  w.rec.count('guestsJoined')
  await c.call('GET', '/api/menu')

  const meanMs = (w.guestCount * 3600_000) / w.ordersPerHour
  const orders = async () => {
    await nap(rand(0, meanMs), w.guestsUntil)
    while (Date.now() < w.guestsUntil) {
      await placeOrder(w, c, tableNo)
      await nap(expo(meanMs), w.guestsUntil)
    }
  }
  await Promise.all([
    every(w.guestsUntil, GUEST_POLL_MS, async () => { await c.call('GET', '/api/orders/session') }),
    orders(),
  ])
}

async function placeOrder(w: World, c: Client, tableNo: number): Promise<void> {
  const now = Date.now()
  const recent = (w.tableOrders.get(tableNo) ?? []).filter((t) => now - t < GUEST_WINDOW_MS)
  w.tableOrders.set(tableNo, recent)
  if (recent.length >= GUEST_ORDERS_PER_TABLE) return w.rec.count('guestLimitSkipped')

  const chosen = new Set<MenuItem>()
  const wanted = randInt(1, 4)
  while (chosen.size < Math.min(wanted, w.menu.length)) chosen.add(pick(w.menu))
  const items = [...chosen].map((m) => ({ menuItemId: m.id, quantity: randInt(1, 2) }))
  const body = { tableNo, items }
  const key = randomUUID()

  const res = await c.call<{ orderId: string }>('POST', '/api/orders', { body, key })
  if (res.status !== 201) return
  recent.push(now)
  w.rec.count('ordersCreated')
  const at = performance.now()
  for (const station of new Set([...chosen].map((m) => m.station))) {
    w.orderPending.set(`${res.data.orderId}:${station}`, { at })
  }

  // 5 %: the phone lost the answer and sends the same request again.
  if (Math.random() < 0.05) {
    const again = await c.call<{ orderId: string }>('POST', '/api/orders', { body, key })
    if (again.status === 200 && again.data.orderId === res.data.orderId) w.rec.count('resendsDeduplicated')
    else if (again.status === 201 || (again.status === 200 && again.data.orderId !== res.data.orderId)) w.rec.count('duplicateOrders')
  }
}

interface TicketItem { orderItemId: string, quantity: number, productionStatus: string, paymentStatus: string, served: boolean }
interface TicketDetail { ticketKey: string, items: TicketItem[] }

export async function waiter(w: World, index: number, username: string, pin: string): Promise<void> {
  const c = new Client(w)
  const login = await c.call('POST', '/api/auth/login', { body: { username, secret: pin, kind: 'pin' } })
  if (login.status !== 200) return
  const mine = (tableNo: number) => tableNo % w.waiterCount === index

  await every(w.drainUntil, STAFF_POLL_MS, async () => {
    const list = await c.call<{ tickets: Array<{ tableNo: number, status: string, unpaidCents: number, ticketKey: string }> }>('GET', '/api/tickets')
    if (list.status !== 200) return

    // Did the tables of this waiter see what the station finished?
    const doneTables = new Set([...w.donePending.values()].filter((p) => mine(p.tableNo)).map((p) => p.tableNo))
    for (const tableNo of doneTables) {
      const d = await c.call<TicketDetail>('GET', `/api/tickets/t-${tableNo}`)
      if (d.status !== 200) continue
      const now = performance.now()
      for (const it of d.data.items) {
        const p = w.donePending.get(it.orderItemId)
        if (p && (it.productionStatus === 'done' || it.paymentStatus === 'paid')) {
          w.rec.seen('doneToWaiter', now - p.at)
          w.donePending.delete(it.orderItemId)
        }
      }
    }

    const open = list.data.tickets.filter((t) => t.status === 'open' && t.unpaidCents > 0 && mine(t.tableNo) && t.ticketKey.startsWith('t-'))
    if (open.length === 0 || Math.random() > 0.5) return
    const d = await c.call<TicketDetail>('GET', `/api/tickets/${pick(open).ticketKey}`)
    if (d.status === 200) await serveTable(w, c, d.data)
  })
}

async function serveTable(w: World, c: Client, ticket: TicketDetail): Promise<void> {
  const unpaid = ticket.items.filter((i) => i.paymentStatus === 'unpaid' && i.productionStatus !== 'cancelled')
  if (unpaid.length === 0) return
  if (unpaid.some((i) => i.productionStatus === 'done' && !i.served)) {
    await c.call('POST', `/api/tickets/${ticket.ticketKey}/served`, { body: {} })
    w.rec.count('served')
  }

  const open = unpaid.find((i) => i.productionStatus === 'pending')
  if (open && Math.random() < 0.05) {
    const res = await c.call('POST', `/api/order-items/${open.orderItemId}/void`, { body: { reason: 'perf: guest changed their mind' } })
    if (res.status === 200) w.rec.count('voids')
    return
  }

  const partly = Math.random() < 0.4
  const lines = partly ? unpaid.filter(() => Math.random() < 0.5) : unpaid
  if (lines.length === 0) lines.push(pick(unpaid))
  const quantities: Record<string, number> = {}
  if (partly) for (const l of lines) if (l.quantity > 1 && Math.random() < 0.5) quantities[l.orderItemId] = randInt(1, l.quantity - 1)
  const tipCents = Math.random() < 0.2 ? 50 * randInt(1, 6) : 0

  const pay = await c.call('POST', '/api/payments', {
    body: {
      ticketKey: ticket.ticketKey,
      orderItemIds: lines.map((l) => l.orderItemId),
      ...(Object.keys(quantities).length ? { quantities } : {}),
      tipCents,
    },
    key: randomUUID(),
  })
  if (pay.status === 201) {
    w.rec.count(partly ? 'paymentsPartly' : 'paymentsFully')
    if (tipCents) { w.rec.count('tips'); w.rec.count('tipCents', tipCents) }
  }
}

export async function station(w: World, username: string, kind: 'kitchen' | 'bar'): Promise<void> {
  const c = new Client(w)
  const login = await c.call('POST', '/api/auth/login', { body: { username, secret: '1111', kind: 'pin' } })
  if (login.status !== 200) return
  const readyAt = new Map<string, number>() // order item id → when it is cooked

  await every(w.drainUntil, STAFF_POLL_MS, async () => {
    const q = await c.call<{ items: Array<{ orderItemId: string, orderId: string, tableNo: number, productionStatus: string }> }>('GET', '/api/production/queue')
    if (q.status !== 200) return
    const now = performance.now()
    for (const it of q.data.items) {
      const key = `${it.orderId}:${kind}`
      const p = w.orderPending.get(key)
      if (p) { w.rec.seen('orderToQueue', now - p.at); w.orderPending.delete(key) }
    }

    // A busy cook takes a few items per round, not the whole backlog.
    for (const it of q.data.items.slice(0, 10)) {
      if (it.productionStatus === 'pending') {
        const res = await c.call('PATCH', `/api/production/items/${it.orderItemId}`, { body: { nextStatus: 'in_progress' } })
        if (res.status === 200) readyAt.set(it.orderItemId, performance.now() + rand(8000, 20000))
      }
      else if (performance.now() >= (readyAt.get(it.orderItemId) ?? 0)) {
        const res = await c.call('PATCH', `/api/production/items/${it.orderItemId}`, { body: { nextStatus: 'done' } })
        if (res.status === 200) {
          w.donePending.set(it.orderItemId, { at: performance.now(), tableNo: it.tableNo })
          w.rec.count('itemsDone')
        }
      }
    }
  })
}

// The columns of the five reports that the check reads.
interface ReportRow { totalCents: number, tipCents: number, issuedCents: number, orderCount: number, staffId: string | null }

export const REPORT_TYPES = ['revenue_by_category', 'payments_by_staff', 'deposits', 'tips', 'orders_per_hour'] as const

const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((t, r) => t + f(r), 0)

// Reads the reports the consistency check needs; null when one of them failed.
export async function readTotals(c: Client, eventId: string): Promise<ReportTotals | null> {
  const got = await Promise.all(REPORT_TYPES.map((type) =>
    c.call<{ rows: ReportRow[] }>('GET', `/api/admin/events/${eventId}/reports?type=${type}`)))
  if (got.some((g) => g.status !== 200)) return null
  const [revenue, payments, deposits, tips, perHour] = got.map((g) => g.data.rows)
  return {
    paymentsNetCents: sum(payments!, (r) => r.totalCents),
    paymentsTipCents: sum(payments!, (r) => r.tipCents),
    revenueCents: sum(revenue!, (r) => r.totalCents),
    depositIssuedCents: sum(deposits!, (r) => r.issuedCents),
    tipsReportCents: tips!.find((r) => r.staffId === null)?.tipCents ?? 0,
    orderCount: sum(perHour!, (r) => r.orderCount),
  }
}

export async function admin(w: World, c: Client): Promise<void> {
  await every(w.guestsUntil, ADMIN_POLL_MS, async () => { await readTotals(c, w.eventId) })
}
