import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '~/composables/useApi'
import type { PricePreviewRow, PriceRuleDto, PriceRuleInput, PriceRulesList } from '~/../server/lib/contracts/pricing'

// Price rules of one event (admin workspace tab "Aktionspreise").
export const usePriceRulesStore = defineStore('price-rules', () => {
  const eventId = ref<string | null>(null)
  const rules = ref<PriceRuleDto[]>([])
  const preview = ref<PricePreviewRow[]>([])

  async function fetch(id: string): Promise<void> {
    if (eventId.value !== id) {
      rules.value = []
      preview.value = []
    }
    const res = await useApi().get<PriceRulesList>(`/api/admin/events/${id}/price-rules`)
    eventId.value = res.eventId
    rules.value = res.rules
    preview.value = res.preview
  }

  // Every change can alter what runs right now: reload list and preview.
  async function reload(): Promise<void> {
    if (eventId.value) await fetch(eventId.value)
  }

  async function create(id: string, input: PriceRuleInput): Promise<PriceRuleDto> {
    const res = await useApi().post<PriceRuleDto>(`/api/admin/events/${id}/price-rules`, input)
    await reload()
    return res
  }

  async function update(id: string, input: PriceRuleInput | { isActive: boolean }): Promise<PriceRuleDto> {
    const res = await useApi().patch<PriceRuleDto>(`/api/admin/price-rules/${id}`, input)
    await reload()
    return res
  }

  async function remove(id: string): Promise<void> {
    await useApi().del(`/api/admin/price-rules/${id}`)
    rules.value = rules.value.filter((r) => r.id !== id)
    await reload()
  }

  return { eventId, rules, preview, fetch, reload, create, update, remove }
})
