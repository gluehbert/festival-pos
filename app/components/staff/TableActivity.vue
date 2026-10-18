<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { tableActivity } from '~/utils/table-activity'

// Plain text on purpose: no colour, no alarm. The waiter decides.
interface Props {
  lastOrderAt: string
  lastCheckAt: string | null
  // Server clock minus device clock, so a wrong phone clock does not matter.
  clockOffsetMs?: number
}
const props = withDefaults(defineProps<Props>(), { clockOffsetMs: 0 })

const { t } = useI18n()
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => { now.value = Date.now() }, 30_000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const text = computed(() => {
  const a = tableActivity(props.lastOrderAt, props.lastCheckAt, now.value + props.clockOffsetMs)
  const age = a.minutes < 1
    ? t('staff.ticket.justNow')
    : a.minutes < 60
      ? t('staff.ticket.minutesAgo', { n: a.minutes })
      : t('staff.ticket.hoursAgo', { h: Math.floor(a.minutes / 60), m: a.minutes % 60 })
  return t(a.kind === 'check' ? 'staff.activity.check' : 'staff.activity.order', { age })
})
</script>

<template>
  <p class="text-xs text-slate-600" data-test="table-activity">
    {{ text }}
  </p>
</template>
