<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue'
import { NOTE_MAX_LENGTH } from '~/../server/lib/contracts/guest'

// Note on a cart / pad line ("ohne Zwiebeln"), typed in on demand.
const props = defineProps<{ note: string; name: string }>()
const emit = defineEmits<{ (e: 'update', note: string): void }>()

const editing = ref(false)
const draft = ref('')
const input = useTemplateRef<HTMLInputElement>('input')

async function open() {
  draft.value = props.note
  editing.value = true
  await nextTick()
  input.value?.focus()
}

function save() {
  editing.value = false
  if (draft.value.trim() !== props.note) emit('update', draft.value)
}
</script>

<template>
  <form v-if="editing" class="mt-1 flex gap-2" @submit.prevent="save">
    <input
      ref="input"
      v-model="draft"
      type="text"
      :maxlength="NOTE_MAX_LENGTH"
      :placeholder="$t('common.note.placeholder')"
      :aria-label="$t('common.note.aria', { name })"
      class="min-h-[44px] min-w-0 flex-1 rounded-lg border border-slate-300 bg-surface px-3 text-sm"
      data-test="line-note-input"
      @blur="save"
    >
    <button type="submit" class="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm font-semibold">
      {{ $t('common.note.done') }}
    </button>
  </form>
  <button
    v-else
    type="button"
    class="mt-1 flex min-h-[44px] max-w-full items-center gap-1 rounded-lg px-2 text-left text-sm"
    :class="note ? 'bg-amber-100 font-semibold text-amber-900' : 'text-brand-ink hover:bg-slate-100'"
    :aria-label="note ? $t('common.note.editAria', { name, note }) : $t('common.note.addAria', { name })"
    data-test="line-note"
    @click="open"
  >
    <UIcon name="i-lucide-pencil" class="size-4 shrink-0" aria-hidden="true" />
    <span class="truncate">{{ note || $t('common.note.add') }}</span>
  </button>
</template>
