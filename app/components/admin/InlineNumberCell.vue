<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { useFormat } from '~/composables/useFormat'
import { parseEuroInput } from '~/utils/euro-input'

// A table cell edited in place: euro amounts (cents) or counts. `nullable`
// lets an empty input mean "none" (e.g. no stock tracking).
const props = withDefaults(defineProps<{
  value: number | null
  label: string
  mode?: 'euro' | 'count'
  nullable?: boolean
  busy?: boolean
}>(), { mode: 'euro', nullable: false, busy: false })
const emit = defineEmits<{ (e: 'save', value: number | null): void }>()

const { euro } = useFormat()
const editing = ref(false)
const draft = ref('')
const input = useTemplateRef<HTMLInputElement>('input')

const shown = computed(() => {
  if (props.value === null) return '–'
  return props.mode === 'euro' ? euro(props.value) : String(props.value)
})

function parse(raw: string): number | null | undefined {
  if (raw.trim() === '') return props.nullable ? null : (props.mode === 'euro' ? 0 : undefined)
  if (props.mode === 'euro') return parseEuroInput(raw) ?? undefined
  return /^\d{1,6}$/.test(raw.trim()) ? Number.parseInt(raw, 10) : undefined
}
const parsed = computed(() => parse(draft.value))

async function start() {
  draft.value = props.value === null ? '' : props.mode === 'euro' ? (props.value / 100).toFixed(2).replace('.', ',') : String(props.value)
  editing.value = true
  await nextTick()
  input.value?.select()
}

function save() {
  if (parsed.value === undefined) return
  editing.value = false
  if (parsed.value !== props.value) emit('save', parsed.value)
}
</script>

<template>
  <form v-if="editing" class="flex items-center justify-end gap-1" @submit.prevent="save">
    <input
      ref="input"
      v-model="draft"
      :inputmode="mode === 'euro' ? 'decimal' : 'numeric'"
      :aria-label="label"
      :aria-invalid="parsed === undefined"
      class="min-h-[44px] w-20 rounded border px-2 text-right tabular-nums"
      :class="parsed === undefined ? 'border-rose-400' : 'border-slate-300'"
      data-test="inline-number-input"
      @keydown.esc="editing = false"
    >
    <button
      type="submit"
      class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-slate-300 text-sm"
      :aria-label="$t('common.save')"
      :disabled="parsed === undefined"
    >
      <UIcon name="i-lucide-check" class="size-4 shrink-0" aria-hidden="true" />
    </button>
  </form>
  <button
    v-else
    type="button"
    class="min-h-[44px] w-full rounded px-2 text-right tabular-nums hover:bg-slate-100 disabled:opacity-50"
    :aria-label="`${label}: ${shown}`"
    :disabled="busy"
    data-test="inline-number"
    @click="start"
  >
    {{ shown }}
  </button>
</template>
