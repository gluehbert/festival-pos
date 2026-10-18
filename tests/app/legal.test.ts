import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { EMPTY_BRANDING, type Branding } from '~/../server/lib/contracts/branding'
import { useCookie } from './setup/imports'

const branding = ref<Branding>({ ...EMPTY_BRANDING })
vi.mock('~/composables/useBranding', () => ({
  useBranding: () => ({ branding: computed(() => branding.value), dates: computed(() => null), refresh: vi.fn(async () => {}) }),
}))

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
  useCookie<string>('csrf').value = 'c'.repeat(64)
  branding.value = { ...EMPTY_BRANDING }
})
afterEach(() => vi.unstubAllGlobals())

describe('Impressum / Datenschutz in the app', () => {
  it('shows footer links only for texts that exist', async () => {
    const LegalFooter = (await import('~/components/common/LegalFooter.vue')).default
    const stubs = { NuxtLink: RouterLinkStub }
    expect(mount(LegalFooter, { global: { stubs } }).find('[data-test="legal-footer"]').exists()).toBe(false)
    branding.value = { ...EMPTY_BRANDING, hasImprint: true }
    const w = mount(LegalFooter, { global: { stubs } })
    const links = w.findAllComponents(RouterLinkStub)
    expect(links.map((l) => l.props('to'))).toEqual(['/legal/imprint'])
  })

  it('admin loads and saves both texts', async () => {
    const EventLegalForm = (await import('~/components/admin/EventLegalForm.vue')).default
    fetchMock.mockResolvedValueOnce({ eventName: 'Fair', imprintText: 'Club Inc.', privacyText: null })
    const w = mount(EventLegalForm, { props: { eventId: 'e1' } })
    await flushPromises()
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/events/e1/legal')
    expect((w.find('[data-test="legal-imprint"]').element as HTMLTextAreaElement).value).toBe('Club Inc.')
    await w.find('[data-test="legal-privacy"]').setValue('No cookies except the session.')
    fetchMock.mockResolvedValueOnce({ ...EMPTY_BRANDING, hasImprint: true, hasPrivacy: true })
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(fetchMock.mock.calls[1]).toMatchObject([
      '/api/admin/events/e1/branding',
      { method: 'PATCH', body: { imprintText: 'Club Inc.', privacyText: 'No cookies except the session.' } },
    ])
    expect(w.emitted('saved')).toEqual([['admin.legal.saved']])
  })
})
