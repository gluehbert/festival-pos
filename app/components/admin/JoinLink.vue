<script setup lang="ts">
import { ref, watch } from 'vue'
import QRCode from 'qrcode'

// The event's join link as QR code (to show at the briefing or print) plus
// copy/share for the messenger group.
const props = defineProps<{ url: string | null; busy: boolean }>()
const emit = defineEmits<{ create: [] }>()
const { t } = useI18n()

const qr = ref<string | null>(null)
const copied = ref(false)

watch(() => props.url, async (url) => {
  try {
    qr.value = url ? await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, scale: 8 }) : null
  }
  catch {
    qr.value = null // no canvas: the link below still works
  }
}, { immediate: true })

async function share() {
  if (!props.url) return
  if (navigator.share) {
    try {
      await navigator.share({ url: props.url })
    }
    catch { /* closed the share sheet */ }
    return
  }
  await navigator.clipboard.writeText(props.url)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function renew() {
  if (window.confirm(t('admin.join.renewConfirm'))) emit('create')
}
</script>

<template>
  <section class="rounded-lg border border-slate-200 bg-surface p-4" data-test="join-link">
    <h2 class="text-base font-semibold text-slate-900">
      {{ $t('admin.join.linkTitle') }}
    </h2>
    <p class="mt-1 text-sm text-slate-600">
      {{ $t('admin.join.linkHint') }}
    </p>
    <button
      v-if="!url"
      type="button"
      class="mt-3 min-h-[44px] rounded bg-primary px-4 font-semibold text-white disabled:opacity-60"
      :disabled="busy"
      data-test="join-create"
      @click="emit('create')"
    >
      {{ $t('admin.join.create') }}
    </button>
    <template v-else>
      <img v-if="qr" :src="qr" :alt="$t('admin.join.qrAlt')" class="mt-3 size-56 rounded bg-white p-2" data-test="join-qr">
      <p class="mt-2 break-all font-mono text-xs text-slate-600" data-test="join-url">
        {{ url }}
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="inline-flex min-h-[44px] items-center gap-2 rounded bg-primary px-4 font-semibold text-white" data-test="join-share" @click="share">
          <UIcon name="i-lucide-share-2" class="size-4 shrink-0" aria-hidden="true" />
          {{ $t(copied ? 'admin.join.copied' : 'admin.join.share') }}
        </button>
        <button type="button" class="min-h-[44px] rounded border border-slate-300 px-4 text-sm disabled:opacity-60" :disabled="busy" data-test="join-renew" @click="renew">
          {{ $t('admin.join.renew') }}
        </button>
      </div>
    </template>
  </section>
</template>
