<script setup lang="ts">
import { ref } from 'vue'
import QrRangeForm from '~/components/admin/QrRangeForm.vue'
import { useAdminStore } from '~/stores/admin'
import type { EventDto } from '~/../server/lib/contracts/admin'

const props = defineProps<{ event: EventDto }>()

const { t } = useI18n()
const admin = useAdminStore()
const busy = ref(false)
const error = ref<string | null>(null)

async function onSubmit(from: number, to: number) {
  error.value = null
  busy.value = true
  try {
    const blob = await admin.downloadQrPdf(props.event.id, from, to)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `qr-codes-${from}-${to}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
  catch (e: unknown) {
    error.value = (e as { data?: { message?: string } })?.data?.message ?? t('admin.qr.failed')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="max-w-3xl">
    <p class="mb-3 text-sm text-slate-600">
      {{ $t('admin.qr.hint') }}
    </p>

    <QrRangeForm
      :key="event.id"
      :busy="busy"
      :default-from="event.tableRangeFrom"
      :default-to="event.tableRangeTo"
      @submit="onSubmit"
    />

    <p v-if="error" class="mt-4 text-sm text-rose-600">
      {{ error }}
    </p>
  </div>
</template>
