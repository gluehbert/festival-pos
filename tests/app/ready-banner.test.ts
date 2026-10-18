import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ReadyBanner from '~/components/staff/ReadyBanner.vue'

describe('ReadyBanner', () => {
  it('is hidden while nothing is ready', () => {
    expect(mount(ReadyBanner, { props: { kitchen: 0, bar: 0 } }).find('[data-test="ready-banner"]').exists()).toBe(false)
  })

  it('offers one button for the station that is ready', async () => {
    const w = mount(ReadyBanner, { props: { kitchen: 0, bar: 2 } })
    // Cashing clears it anyway: the banner says so, "Gebracht" is only an extra.
    expect(w.get('[data-test="ready-hint"]').text()).toBe('staff.detail.servedHint')
    // A walk-in is paid already: no such promise there.
    expect(mount(ReadyBanner, { props: { kitchen: 1, bar: 0, walkin: true } }).find('[data-test="ready-hint"]').exists()).toBe(false)
    const buttons = w.findAll('button')
    expect(buttons.map((b) => b.text())).toEqual(['staff.detail.served'])
    await buttons[0]!.trigger('click')
    expect(w.emitted('served')).toEqual([['bar']])
  })

  it('splits food and drinks once both are ready', async () => {
    const w = mount(ReadyBanner, { props: { kitchen: 1, bar: 3 } })
    expect(w.findAll('button').map((b) => b.text())).toEqual(['staff.detail.served_kitchen', 'staff.detail.served_bar'])
    await w.find('[data-test="served-kitchen"]').trigger('click')
    await w.find('[data-test="served-bar"]').trigger('click')
    expect(w.emitted('served')).toEqual([['kitchen'], ['bar']])
    await w.setProps({ busy: true })
    expect(w.find('[data-test="served-bar"]').attributes('disabled')).toBeDefined()
  })
})
