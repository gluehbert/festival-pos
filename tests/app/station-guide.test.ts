import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StationGuide from '~/components/production/StationGuide.vue'

const steps = (station: 'kitchen' | 'bar' | 'cafe') =>
  mount(StationGuide, { props: { station } }).findAll('[data-step]').map((li) => li.attributes('data-step'))

describe('StationGuide', () => {
  it('explains the kitchen with the optional "Start" step', () => {
    expect(steps('kitchen')).toEqual(['arrive', 'start', 'done', 'soldOut'])
  })

  it('leaves out "Start" at the bar and the cake counter, which can close itself', () => {
    expect(steps('bar')).toEqual(['arrive', 'done', 'soldOut'])
    expect(steps('cafe')).toEqual(['arrive', 'done', 'soldOut', 'cafeClose'])
  })

  it('still says that nothing is waiting', () => {
    expect(mount(StationGuide, { props: { station: 'bar' } }).text()).toContain('production.empty')
  })
})
