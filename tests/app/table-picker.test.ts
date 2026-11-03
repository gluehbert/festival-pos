import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TablePicker from '~/components/staff/TablePicker.vue'
import type { Tile } from '~/utils/table-grid'

const ANNA = { staffId: '00000000-0000-4000-8000-00000000000a', username: 'anna' }
const BEN = { staffId: '00000000-0000-4000-8000-00000000000b', username: 'ben' }

const tile = (tableNo: number, assignee: Tile['assignee'] = null, state: Tile['state'] = 'free'): Tile =>
  ({ tableNo, state, ticket: null, assignee })
const TILES = [tile(1), tile(2, ANNA, 'ready'), tile(3, BEN), tile(4, ANNA)]

const numbers = (w: ReturnType<typeof mount>) =>
  w.findAll('[data-test="picker-table"]').map((b) => Number.parseInt(b.text(), 10))

describe('TablePicker', () => {
  it('shows a waiter their own tables first and all tables on request', async () => {
    const w = mount(TablePicker, { props: { tiles: TILES, myId: ANNA.staffId, current: null } })
    expect(numbers(w)).toEqual([2, 4])
    expect(w.find('[data-test="picker-mine"]').text()).toContain('staff.order.picker.mine')
    expect(w.find('[data-test="picker-table"]').attributes('aria-label')).toMatch(/^staff.order.picker.tileMineAria.*"n":2/)

    await w.find('[data-test="picker-all"]').trigger('click')
    expect(numbers(w)).toEqual([1, 2, 3, 4])
    // Own tables keep a star among all of them.
    expect(w.findAll('[data-test="picker-table"]')[1]!.find('[data-icon="i-lucide-star"]').exists()).toBe(true)
  })

  it('shows all tables without a switch when none are assigned', () => {
    const w = mount(TablePicker, { props: { tiles: TILES, myId: '00000000-0000-4000-8000-00000000000c', current: null } })
    expect(numbers(w)).toEqual([1, 2, 3, 4])
    expect(w.find('[data-test="picker-mine"]').exists()).toBe(false)
  })

  it('picks a table with one tap', async () => {
    const w = mount(TablePicker, { props: { tiles: TILES, current: null } })
    await w.findAll('[data-test="picker-table"]')[2]!.trigger('click')
    expect(w.emitted('pick')).toEqual([[3]])
    expect(w.find('[data-test="picker-keep"]').exists()).toBe(false)
  })

  it('takes a typed number for tables outside the grid', async () => {
    const w = mount(TablePicker, { props: { tiles: TILES, current: null } })
    expect(w.find('[data-test="order-table"]').exists()).toBe(false)
    await w.find('[data-test="picker-other"]').trigger('click')
    const ok = w.find('[data-test="order-table-ok"]')
    expect(ok.attributes('disabled')).toBeDefined()
    await w.find('[data-test="order-table"]').setValue('0')
    expect(ok.attributes('disabled')).toBeDefined()
    await w.find('[data-test="order-table"]').setValue('55')
    await w.find('[data-test="order-table"]').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('pick')).toEqual([[55]])
  })

  it('falls back to typing when no tables could be loaded', () => {
    const w = mount(TablePicker, { props: { tiles: [], current: null } })
    expect(w.find('[data-test="picker-table"]').exists()).toBe(false)
    expect(w.find('[data-test="order-table"]').exists()).toBe(true)
  })

  it('offers to stay at the table when changing it', async () => {
    const w = mount(TablePicker, { props: { tiles: TILES, current: 7 } })
    await w.find('[data-test="picker-keep"]').trigger('click')
    expect(w.emitted('keep')).toHaveLength(1)
  })
})
