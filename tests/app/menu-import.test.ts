import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MenuImport from '~/components/admin/MenuImport.vue'
import { useCookie } from './setup/imports'

const fetchMock = vi.fn()
const EVENT = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
})
afterEach(() => vi.unstubAllGlobals())

async function choose(w: ReturnType<typeof mount>, name = 'karte.csv') {
  const input = w.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [new File(['x'], name)], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

const preview = (over = {}) => ({
  applied: false, created: 1, updated: 1, unchanged: 0, errors: [],
  rows: [{ row: 2, nameDe: 'Pommes', action: 'update' }, { row: 3, nameDe: 'Radler', action: 'create' }],
  ...over,
})

describe('MenuImport', () => {
  it('previews an upload with a dry run, then applies it and reloads the menu', async () => {
    fetchMock.mockResolvedValueOnce(preview())
    const w = mount(MenuImport, { props: { eventId: EVENT } })
    await choose(w)
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/admin/events/${EVENT}/menu-items/import?dryRun=1`)
    expect(fetchMock.mock.calls[0]![1].body).toBeInstanceOf(FormData)
    expect(w.text()).toContain('admin.menuImport.summary')
    expect(w.text()).toContain('Radler')
    expect(w.text()).toContain('admin.menuImport.action.create')

    fetchMock
      .mockResolvedValueOnce(preview({ applied: true }))
      .mockResolvedValueOnce({ eventId: 'e', items: [] })
    const apply = w.findAll('button').find((b) => b.text() === 'admin.menuImport.apply')!
    await apply.trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/admin/events/${EVENT}/menu-items/import`)
    expect(fetchMock.mock.calls[2]![0]).toBe(`/api/admin/events/${EVENT}/menu-items`)
    expect(w.emitted('imported')).toHaveLength(1)
    expect(w.find('[data-test="menu-import-preview"]').exists()).toBe(false)
  })

  it('lists row errors and blocks applying', async () => {
    fetchMock.mockResolvedValueOnce(preview({ errors: [{ row: 4, message: 'Invalid price' }], rows: [] }))
    const w = mount(MenuImport, { props: { eventId: EVENT } })
    await choose(w)
    expect(w.text()).toContain('Invalid price')
    const apply = w.findAll('button').find((b) => b.text() === 'admin.menuImport.apply')!
    expect(apply.attributes('disabled')).toBeDefined()
    await w.findAll('button').find((b) => b.text() === 'admin.menuImport.cancel')!.trigger('click')
    expect(w.find('[data-test="menu-import-preview"]').exists()).toBe(false)
  })

  it('shows server errors and downloads the template', async () => {
    fetchMock.mockRejectedValueOnce({ data: { message: 'Kein aktives Event' } })
    const w = mount(MenuImport, { props: { eventId: EVENT } })
    await choose(w)
    expect(w.find('[role="alert"]').text()).toBe('Kein aktives Event')

    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
    globalThis.URL.revokeObjectURL = vi.fn()
    fetchMock.mockResolvedValueOnce(new Blob(['PK']))
    await w.find('button').trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/admin/events/${EVENT}/menu-items/template`)
    expect(fetchMock.mock.calls[1]![1].responseType).toBe('blob')
    expect(URL.createObjectURL).toHaveBeenCalled()
  })
})
