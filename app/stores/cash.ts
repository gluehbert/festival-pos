import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '~/composables/useApi'
import type { CashSessionDto, CurrentCashSession } from '~/../server/lib/contracts/cash'
import type { DepositReturnDto } from '~/../server/lib/contracts/deposit'

// The waiter's own cash drawer: open with the change float, close with the
// counted cash.
export const useCashStore = defineStore('cash', () => {
  const session = ref<CashSessionDto | null>(null)
  const lastClosed = ref<CashSessionDto | null>(null)
  const loading = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)

  const message = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? 'error'

  async function load(): Promise<void> {
    loading.value = true
    try {
      session.value = (await useApi().get<CurrentCashSession>('/api/cash/session')).session
      error.value = null
    }
    catch (e) {
      error.value = message(e)
    }
    finally {
      loading.value = false
    }
  }

  async function open(openingCents: number): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      session.value = await useApi().post<CashSessionDto>('/api/cash/session', { openingCents })
      lastClosed.value = null
      return true
    }
    catch (e) {
      error.value = message(e)
      return false
    }
    finally {
      busy.value = false
    }
  }

  async function close(countedCents: number, note?: string): Promise<boolean> {
    busy.value = true
    error.value = null
    try {
      lastClosed.value = await useApi().post<CashSessionDto>('/api/cash/session/close', { countedCents, note })
      session.value = null
      return true
    }
    catch (e) {
      error.value = message(e)
      return false
    }
    finally {
      busy.value = false
    }
  }

  // Pfand handed back: one booking per deposit value with a count.
  async function returnDeposit(counts: Record<number, number>): Promise<number | null> {
    busy.value = true
    error.value = null
    let total = 0
    try {
      for (const [unit, quantity] of Object.entries(counts)) {
        if (quantity <= 0) continue
        const res = await useApi().post<DepositReturnDto>('/api/deposit-returns', { unitCents: Number(unit), quantity })
        total += res.amountCents
      }
      return total
    }
    catch (e) {
      error.value = message(e)
      return null
    }
    finally {
      busy.value = false
    }
  }

  return { session, lastClosed, loading, busy, error, load, open, close, returnDeposit }
})
