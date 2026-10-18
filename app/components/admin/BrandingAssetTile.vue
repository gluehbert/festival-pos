<script setup lang="ts">
import type { AssetKind } from '~/../server/lib/contracts/branding'

// One upload slot of the branding form: logo, dark-mode logo or flyer.
const props = defineProps<{
  kind: AssetKind
  url: string | null
  isPdf?: boolean
  note?: string | null
  busy: boolean
}>()
const emit = defineEmits<{ (e: 'upload', file: File): void; (e: 'remove'): void }>()

const ACCEPT_IMAGES = 'image/png,image/jpeg,image/webp'

function onChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('upload', file)
}
</script>

<template>
  <div class="rounded border border-slate-200 bg-surface p-3" :data-test="`asset-${kind}`">
    <p class="text-sm font-semibold text-slate-800">
      {{ $t(`admin.branding.${kind}`) }}
    </p>
    <p class="text-xs text-slate-600">
      {{ $t(`admin.branding.${kind}Hint`) }}
    </p>
    <template v-if="url">
      <a
        v-if="isPdf"
        :href="url"
        target="_blank"
        rel="noopener"
        class="mt-2 inline-block text-sm text-slate-800 underline"
      >{{ $t('guest.event.openFlyer') }}</a>
      <!-- The dark-mode logo is previewed on the dark surface it is meant for. -->
      <img
        v-else
        :src="url"
        :alt="$t(`admin.branding.${kind}`)"
        class="mt-2 max-h-40 w-auto rounded border border-slate-200 object-contain"
        :class="props.kind === 'logo_dark' ? 'bg-[#0f172b] p-2' : ''"
      >
    </template>
    <p v-if="note" class="mt-2 text-xs text-slate-600" data-test="asset-note">
      {{ note }}
    </p>
    <div class="mt-2 flex flex-wrap items-center gap-3">
      <label class="min-h-[44px] cursor-pointer content-center rounded border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
        {{ $t('admin.branding.upload') }}
        <input
          type="file"
          class="sr-only"
          :accept="kind === 'flyer' ? `${ACCEPT_IMAGES},application/pdf` : ACCEPT_IMAGES"
          :disabled="busy"
          :data-test="`upload-${kind}`"
          @change="onChange"
        >
      </label>
      <button
        v-if="url"
        type="button"
        class="text-sm text-rose-700 underline"
        :disabled="busy"
        @click="emit('remove')"
      >
        {{ $t('admin.branding.remove') }}
      </button>
    </div>
  </div>
</template>
