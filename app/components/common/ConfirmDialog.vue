<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

// Browser-dialog replacement: title, body slot, cancel and confirm button.
// Focus starts on the first button (cancel), Escape cancels, the page behind
// is locked while open.
const props = defineProps<{
  open: boolean
  title: string
  confirmLabel: string
  /** Red confirm button for actions that cannot be undone. */
  danger?: boolean
  busy?: boolean
}>()
const emit = defineEmits<{ confirm: [], cancel: [] }>()

const root = ref<HTMLElement | null>(null)

function setLocked(locked: boolean) {
  if (typeof document !== 'undefined') document.body.style.overflow = locked ? 'hidden' : ''
}

watch(() => props.open, async (open) => {
  setLocked(open)
  if (!open) return
  await nextTick()
  root.value?.querySelector<HTMLButtonElement>('button')?.focus()
}, { immediate: true })

onBeforeUnmount(() => setLocked(false))

// Keeps Tab inside the dialog.
function trapTab(e: KeyboardEvent) {
  const buttons = [...(root.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex]') ?? [])]
  if (buttons.length === 0) return
  const first = buttons[0]!
  const last = buttons[buttons.length - 1]!
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  }
  else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <div
    v-if="open"
    ref="root"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-title"
    data-test="confirm-dialog"
    @keydown.esc="emit('cancel')"
    @keydown.tab="trapTab"
  >
    <div class="w-full max-w-sm rounded-lg bg-surface p-4 shadow-xl">
      <h2 id="confirm-title" class="text-lg font-semibold text-slate-900">
        {{ title }}
      </h2>
      <div class="mt-2 text-sm text-slate-700">
        <slot />
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="min-h-[44px] rounded px-4 text-sm text-slate-700 hover:bg-slate-100" data-test="confirm-cancel" @click="emit('cancel')">
          {{ $t('common.dialog.cancel') }}
        </button>
        <button
          type="button"
          class="min-h-[44px] rounded px-4 text-sm font-semibold text-white disabled:opacity-50"
          :class="danger ? 'bg-danger' : 'bg-primary'"
          :disabled="busy"
          data-test="confirm-ok"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
