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
  // Name of the ended event whose drawer is still open, if any.
  const otherEventName = ref<string | null>(null)
  // The live event counts cash per drawer (feature switch, from the branding
  // via CashOpenPrompt or from the drawer answer); null = not known yet.
  const required = ref<boolean | null>(null)
  // The "count your float" dialog is waiting for an answer.
  const prompting = ref(false)
  let answerPrompt: ((opened: boolean) => void) | null = null
  const loading = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)

  const message = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? 'error'

  async function load(): Promise<void> {
    loading.value = true
    try {
      const res = await useApi().get<CurrentCashSession>('/api/cash/session')
      session.value = res.session
      otherEventName.value = res.otherEventName
      required.value = res.required
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
      otherEventName.value = null
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

  // Before cash changes hands: with drawers on and none open for the live
  // event, ask for the float first (CashOpenPrompt). False when the helper
  // cancels; the caller then does nothing.
  async function ensureOpen(): Promise<boolean> {
    if (!required.value) return true
    if (!session.value || otherEventName.value) await load()
    if (!required.value || (session.value && !otherEventName.value)) return true
    prompting.value = true
    return new Promise((resolve) => { answerPrompt = resolve })
  }

  function finishPrompt(opened: boolean): void {
    prompting.value = false
    answerPrompt?.(opened)
    answerPrompt = null
  }

  // The server says the drawer is not open (closed on another device).
  function forgetSession(): void {
    session.value = null
    required.value = true
  }

  // Pfand handed back: one booking per deposit value with a count.
  async function returnDeposit(counts: Record<number, number>): Promise<number | null> {
    if (!(await ensureOpen())) return null
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

  return { session, lastClosed, otherEventName, required, prompting, loading, busy, error, load, open, close, ensureOpen, finishPrompt, forgetSession, returnDeposit }
})
