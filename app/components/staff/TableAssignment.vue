<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useTicketsStore } from '~/stores/tickets'
import type { Assignee } from '~/../server/lib/contracts/tables'

// Who looks after the table. Waiters only see it (the shift lead hands out
// tables); the shift lead and admin also get "Mein Tisch" / "Abgeben" /
// "Take over table" here.
const props = defineProps<{ tableNo: number; assignee: Assignee | null }>()

const auth = useAuthStore()
const tickets = useTicketsStore()
const busy = ref(false)
const failed = ref(false)
// Someone else holds the table: taking it over needs a second tap.
const confirmFrom = ref<Assignee | null>(null)

const myId = computed(() => auth.staff?.staffId)
const mine = computed(() => props.assignee !== null && props.assignee.staffId === myId.value)
const other = computed(() => (props.assignee && !mine.value ? props.assignee : null))
const canManage = computed(() => auth.hasRole(['lead', 'admin']))

async function run(action: () => Promise<boolean>) {
  busy.value = true
  failed.value = false
  try {
    failed.value = !(await action())
  }
  finally {
    busy.value = false
  }
}

function take() {
  return run(async () => {
    const res = await tickets.assign(props.tableNo, confirmFrom.value !== null)
    if (res.ok) {
      confirmFrom.value = null
      return true
    }
    // Taken by someone else in the meantime: ask before taking it over.
    if (res.heldBy) {
      confirmFrom.value = res.heldBy
      return true
    }
    return false
  })
}

function askTakeOver() {
  confirmFrom.value = other.value
}

function release() {
  return run(() => tickets.release(props.tableNo))
}
</script>

<template>
  <div class="mt-3 rounded-lg border border-slate-200 bg-surface px-3 py-2" data-test="table-assignment">
    <div v-if="!confirmFrom" class="flex flex-wrap items-center justify-between gap-2">
      <p class="flex items-center gap-1 text-sm" :class="mine ? 'font-semibold text-brand-ink' : 'text-slate-700'">
        <UIcon :name="mine ? 'i-lucide-star' : 'i-lucide-user'" class="size-4 shrink-0" aria-hidden="true" />
        <template v-if="mine">
          {{ $t('staff.assign.mine') }}
        </template>
        <template v-else-if="other">
          {{ $t('staff.assign.heldBy', { name: other.username }) }}
        </template>
        <template v-else>
          {{ $t('staff.assign.free') }}
        </template>
      </p>
      <div v-if="canManage" class="flex gap-2">
        <button
          v-if="!assignee"
          type="button"
          class="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-contrast disabled:opacity-50"
          :disabled="busy"
          data-test="assign-take"
          @click="take"
        >
          <UIcon name="i-lucide-user-plus" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('staff.assign.take') }}
        </button>
        <button
          v-if="other"
          type="button"
          class="inline-flex min-h-[44px] items-center gap-1 rounded-lg border-2 border-slate-300 bg-surface px-3 text-sm font-semibold text-slate-900 disabled:opacity-50"
          :disabled="busy"
          data-test="assign-takeover"
          @click="askTakeOver"
        >
          <UIcon name="i-lucide-arrow-right-left" class="size-4 shrink-0" aria-hidden="true" /> {{ $t('staff.assign.takeOver') }}
        </button>
        <button
          v-if="mine || other"
          type="button"
          class="inline-flex min-h-[44px] items-center gap-1 rounded-lg border-2 border-slate-300 bg-surface px-3 text-sm font-semibold text-slate-900 disabled:opacity-50"
          :disabled="busy"
          data-test="assign-release"
          @click="release"
        >
          <UIcon name="i-lucide-user-minus" class="size-4 shrink-0" aria-hidden="true" /> {{ $t(mine ? 'staff.assign.release' : 'staff.assign.unassign') }}
        </button>
      </div>
    </div>
    <div v-else class="flex flex-wrap items-center justify-between gap-2" role="alertdialog" :aria-label="$t('staff.assign.takeOver')">
      <p class="text-sm font-semibold text-slate-900">
        {{ $t('staff.assign.confirm', { n: tableNo, name: confirmFrom.username }) }}
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          class="min-h-[44px] rounded-lg border-2 border-slate-300 bg-surface px-3 text-sm font-semibold text-slate-900"
          data-test="assign-cancel"
          @click="confirmFrom = null"
        >
          {{ $t('staff.assign.cancel') }}
        </button>
        <button
          type="button"
          class="min-h-[44px] rounded-lg bg-brand px-3 text-sm font-semibold text-brand-contrast disabled:opacity-50"
          :disabled="busy"
          data-test="assign-confirm"
          @click="take"
        >
          {{ $t('staff.assign.confirmYes') }}
        </button>
      </div>
    </div>
    <p v-if="failed" class="mt-1 text-xs text-red-700" role="alert">
      {{ $t('staff.assign.failed') }}
    </p>
  </div>
</template>
