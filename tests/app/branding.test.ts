import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import EventInfo from '~/components/guest/EventInfo.vue'
import EventBrandingForm from '~/components/admin/EventBrandingForm.vue'
import EventLogo from '~/components/common/EventLogo.vue'
import { EMPTY_BRANDING, type Branding } from '~/../server/lib/contracts/branding'
import { fetchRefresh, useCookie } from './setup/imports'

const branding = (over: Partial<Branding> = {}): Branding => ({
  ...EMPTY_BRANDING,
  eventId: '00000000-0000-4000-8000-000000000001',
  eventName: 'Summer Fair',
  ...over,
})

describe('EventInfo', () => {
  it('renders nothing without programme or flyer', () => {
    expect(mount(EventInfo, { props: { branding: branding() } }).find('[data-test="event-info"]').exists()).toBe(false)
  })

  it('shows the programme as plain text (no HTML) and an image flyer', () => {
    const w = mount(EventInfo, { props: { branding: branding({ program: '18:00 <b>Fassanstich</b>', flyerUrl: '/f.png', flyerType: 'image' }) } })
    expect(w.find('p').text()).toBe('18:00 <b>Fassanstich</b>')
    expect(w.find('b').exists()).toBe(false)
    expect(w.find('img').attributes('src')).toBe('/f.png')
  })

  it('links a PDF flyer instead of embedding it', () => {
    const w = mount(EventInfo, { props: { branding: branding({ flyerUrl: '/f.pdf', flyerType: 'pdf' }) } })
    expect(w.find('img').exists()).toBe(false)
    expect(w.find('a').attributes('href')).toBe('/f.pdf')
    expect(w.text()).toContain('guest.event.openFlyer')
  })
})

describe('EventLogo', () => {
  const logo = (over: Partial<Branding>) => mount(EventLogo, { props: { branding: branding(over), alt: 'Logo' } })

  it('puts a logo on a light plate in dark mode unless it fits dark', () => {
    expect(logo({ logoUrl: '/l.png' }).get('[data-test="logo-light"]').classes()).toContain('dark:bg-white')
    expect(logo({ logoUrl: '/l.png', logoFitsDark: true }).get('[data-test="logo-light"]').classes()).not.toContain('dark:bg-white')
  })

  it('swaps in the dark-mode logo without a plate', () => {
    const w = logo({ logoUrl: '/l.png', logoDarkUrl: '/d.png' })
    expect(w.get('[data-test="logo-light"]').classes()).toEqual(expect.arrayContaining(['dark:hidden']))
    expect(w.get('[data-test="logo-light"]').classes()).not.toContain('dark:bg-white')
    expect(w.get('[data-test="logo-dark"]').classes()).toEqual(expect.arrayContaining(['hidden', 'dark:block']))
    expect(w.get('[data-test="logo-dark"]').attributes('src')).toBe('/d.png')
  })

  it('renders nothing without a logo', () => {
    expect(logo({}).findAll('img')).toHaveLength(0)
  })
})

describe('EventBrandingForm', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    fetchRefresh.mockClear()
    vi.stubGlobal('$fetch', fetchMock)
    useCookie<string>('csrf').value = 'c'.repeat(64)
  })
  afterEach(() => vi.unstubAllGlobals())

  async function mountForm(initial: Branding) {
    fetchMock.mockResolvedValueOnce(initial)
    const w = mount(EventBrandingForm, { props: { eventId: initial.eventId!, eventName: 'Summer Fair' } })
    await flushPromises()
    return w
  }

  it('loads the event, previews the colour and saves colour, greeting and programme', async () => {
    const w = await mountForm(branding({ accentColor: '#e30613', program: '18:00' }))
    expect((w.find('input[maxlength="7"]').element as HTMLInputElement).value).toBe('#e30613')
    expect(w.find('[aria-hidden="true"] span[style]').attributes('style')).toContain('background: #e30613')

    await w.find('input[maxlength="7"]').setValue('#ffd500')
    expect(w.text()).toContain('admin.branding.lowContrast')
    await w.find('textarea').setValue('Willkommen!')

    fetchMock.mockResolvedValueOnce(branding({ accentColor: '#ffd500', welcomeText: 'Willkommen!' }))
    await w.find('form').trigger('submit')
    await flushPromises()
    const [path, opts] = fetchMock.mock.calls[1]!
    expect(path).toBe('/api/admin/events/00000000-0000-4000-8000-000000000001/branding')
    expect(opts).toMatchObject({ method: 'PATCH', body: { name: 'Summer Fair', accentColor: '#ffd500', welcomeText: 'Willkommen!', program: '18:00' } })
    expect(fetchRefresh).toHaveBeenCalled()
    expect(w.emitted('saved')).toEqual([['admin.branding.saved']])
  })

  it('shows the fields only after the stored values are loaded', async () => {
    let resolve!: (b: Branding) => void
    fetchMock.mockReturnValueOnce(new Promise<Branding>((r) => { resolve = r }))
    const w = mount(EventBrandingForm, { props: { eventId: branding().eventId!, eventName: 'Summer Fair' } })
    expect(w.find('form').exists()).toBe(false)
    expect(w.text()).toContain('admin.loading')
    resolve(branding({ accentColor: '#e30613' }))
    await flushPromises()
    expect((w.find('input[maxlength="7"]').element as HTMLInputElement).value).toBe('#e30613')
  })

  it('renames the event, previews the new name and blocks an empty one', async () => {
    const w = await mountForm(branding())
    const nameInput = w.find(`#name-${branding().eventId}`)
    expect((nameInput.element as HTMLInputElement).value).toBe('Summer Fair')
    await nameInput.setValue('Summer Fair 2026')
    expect(w.find('[aria-hidden="true"]').text()).toContain('Summer Fair 2026')

    await nameInput.setValue('  ')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    await w.find('form').trigger('submit')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await nameInput.setValue('Summer Fair 2026')
    fetchMock.mockResolvedValueOnce(branding({ eventName: 'Summer Fair 2026' }))
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: 'PATCH', body: { name: 'Summer Fair 2026' } })
  })

  it('blocks saving an invalid colour', async () => {
    const w = await mountForm(branding())
    await w.find('input[maxlength="7"]').setValue('rot')
    expect(w.text()).toContain('admin.branding.colorInvalid')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('uploads and removes the logo and reports server errors', async () => {
    const w = await mountForm(branding())
    const input = w.find('[data-test="upload-logo"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'logo.png')], configurable: true })
    fetchMock.mockResolvedValueOnce(branding({ logoUrl: '/api/events/x/assets/logo?v=1' }))
    await input.trigger('change')
    await flushPromises()
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: 'PUT' })
    expect(fetchMock.mock.calls[1]![1].body).toBeInstanceOf(FormData)
    expect(w.findAll('img').some((i) => i.attributes('src')?.includes('logo'))).toBe(true)

    fetchMock.mockRejectedValueOnce({ data: { message: 'File is too large' } })
    await w.findAll('button').find((b) => b.text() === 'admin.branding.remove')!.trigger('click')
    await flushPromises()
    expect(w.emitted('failed')).toEqual([['File is too large']])
  })

  it('tells the admin how the logo looks in dark mode and uploads a dark-mode logo', async () => {
    const w = await mountForm(branding({ logoUrl: '/l.png' }))
    expect(w.get('[data-test="asset-logo"] [data-test="asset-note"]').text()).toBe('admin.branding.logoOnPlate')

    const input = w.find('[data-test="upload-logo_dark"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'dark.png')], configurable: true })
    fetchMock.mockResolvedValueOnce(branding({ logoUrl: '/l.png', logoDarkUrl: '/d.png' }))
    await input.trigger('change')
    await flushPromises()
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/admin/events/00000000-0000-4000-8000-000000000001/assets/logo_dark')
    expect(w.get('[data-test="asset-logo"] [data-test="asset-note"]').text()).toBe('admin.branding.logoDarkInUse')
    expect(w.get('[data-test="asset-logo_dark"] img').attributes('src')).toBe('/d.png')
  })
})
