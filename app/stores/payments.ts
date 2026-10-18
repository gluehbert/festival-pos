import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { useSendState } from '~/composables/useSendState'
import { newIdempotencyKey } from '~/utils/idempotency'
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
  ): Promise<PaymentResponse | null> {
    submitting.value = true
    error.value = null
    lockConflict.value = null
    const body = { ticketKey, orderItemIds, quantities }
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
      const err = e as { statusCode?: number; status?: number; data?: { code?: string; message?: string; details?: LockConflict } }
      const status = err.statusCode ?? err.status
      if (status === 409 && err.data?.code === 'LOCK_CONFLICT' && err.data.details) {
        lockConflict.value = err.data.details
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
      const err = e as { data?: { code?: string; message?: string } }
      error.value = err.data?.message ?? 'void_failed'
      errorCode.value = err.data?.code ?? null
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
