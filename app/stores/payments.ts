import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { useSendState } from '~/composables/useSendState'
import { newIdempotencyKey } from '~/utils/idempotency'
import { apiError } from '~/utils/api-error'
import type { PaymentResponse } from '~/../server/lib/contracts/staff'

export interface LockConflict {
  lockedBy: string
  expiresAt: string
}

export const usePaymentsStore = defineStore('payments', () => {
  const lastReceipt = ref<PaymentResponse | null>(null)
  const lockConflict = ref<LockConflict | null>(null)
  const submitting = ref(false)
  const error = ref<string | null>(null)
  // Server error code of the last void/refund, e.g. VOID_ADMIN_ONLY; the
  // dialog turns known codes into a readable message.
  const errorCode = ref<string | null>(null)
  // The last payment got no answer (network, timeout, 5xx): it may or may
  // not be booked. Sending the same selection again is safe, see below.
  const unconfirmed = ref(false)
  const { sending, begin, end, cancel: cancelSending } = useSendState()

  // One key per payment, kept while that same selection is retried: if the
  // first try was booked and only the answer got lost, the server returns
  // that payment instead of charging the next units again. A different
  // selection, a clear answer from the server or forgetPending() start over.
  let pendingKey: string | null = null
  let pendingBody = ''

  function forgetPending(): void {
    pendingKey = null
    pendingBody = ''
    unconfirmed.value = false
  }

  async function createPayment(
    ticketKey: string,
    orderItemIds: string[],
    quantities?: Record<string, number>,
    tipCents = 0,
  ): Promise<PaymentResponse | null> {
    submitting.value = true
    error.value = null
    lockConflict.value = null
    // The tip is part of the body, so a changed tip is a new payment (new key).
    const body = { ticketKey, orderItemIds, quantities, ...(tipCents > 0 && { tipCents }) }
    const bodyJson = JSON.stringify(body)
    if (!pendingKey || bodyJson !== pendingBody) {
      pendingKey = newIdempotencyKey()
      pendingBody = bodyJson
    }
    try {
      const api = useApi()
      const res = await api.post<PaymentResponse>('/api/payments', body, { headers: { 'idempotency-key': pendingKey }, ...begin() })
      lastReceipt.value = res
      forgetPending()
      return res
    }
    catch (e: unknown) {
      const err = e as { statusCode?: number; status?: number; data?: { message?: string } }
      const status = err.statusCode ?? err.status
      const { code, details } = apiError<LockConflict>(e)
      if (status === 409 && code === 'LOCK_CONFLICT' && details) {
        lockConflict.value = details
      }
      if (status === undefined || status >= 500) {
        unconfirmed.value = true
      }
      else {
        forgetPending()
      }
      error.value = err.data?.message ?? 'payment_failed'
      return null
    }
    finally {
      submitting.value = false
      end()
    }
  }

  async function releaseLock(lockId: string): Promise<void> {
    const api = useApi()
    await api.post(`/api/payments/${lockId}/release`)
    lockConflict.value = null
  }

  async function voidItem(orderItemId: string, reason: string): Promise<boolean> {
    submitting.value = true
    error.value = null
    errorCode.value = null
    try {
      await useApi().post(`/api/order-items/${orderItemId}/void`, { reason })
      return true
    }
    catch (e: unknown) {
      error.value = (e as { data?: { message?: string } }).data?.message ?? 'void_failed'
      errorCode.value = apiError(e).code ?? null
      return false
    }
    finally {
      submitting.value = false
    }
  }

  async function refundItem(orderItemId: string, reason: string): Promise<boolean> {
    submitting.value = true
    error.value = null
    errorCode.value = null
    try {
      await useApi().post(`/api/admin/order-items/${orderItemId}/refund`, { reason })
      return true
    }
    catch (e: unknown) {
      error.value = (e as { data?: { message?: string } }).data?.message ?? 'refund_failed'
      errorCode.value = apiError(e).code ?? null
      return false
    }
    finally {
      submitting.value = false
    }
  }

  function reset(): void {
    lastReceipt.value = null
    lockConflict.value = null
    error.value = null
    errorCode.value = null
    forgetPending()
  }

  return { lastReceipt, lockConflict, submitting, sending, cancelSending, error, errorCode, unconfirmed, createPayment, forgetPending, releaseLock, voidItem, refundItem, reset }
})
