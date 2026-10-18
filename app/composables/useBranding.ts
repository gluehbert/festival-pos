import { computed } from 'vue'
import { useFetch } from '#imports'
import { EMPTY_BRANDING, type Branding } from '~/../server/lib/contracts/branding'
import { useFormat } from '~/composables/useFormat'

// Branding of the active event (name, colour, logo, greeting, programme,
// flyer). Fetched during SSR so the page renders in the event's colours.
export function useBranding() {
  const { data, refresh } = useFetch<Branding>('/api/event/branding', {
    key: 'event-branding',
    default: () => EMPTY_BRANDING,
  })
  const branding = computed<Branding>(() => data.value ?? EMPTY_BRANDING)
  const { eventDates } = useFormat()
  // Formatted event day(s) in the UI language, or null when no date is set.
  const dates = computed(() => eventDates(branding.value.startsOn, branding.value.endsOn))
  return { branding, dates, refresh }
}
