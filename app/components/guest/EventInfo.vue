<script setup lang="ts">
import { computed } from 'vue'
import type { Branding } from '~/../server/lib/contracts/branding'

const props = defineProps<{ branding: Branding; open?: boolean }>()
const hasInfo = computed(() => Boolean(props.branding.program || props.branding.flyerUrl))
</script>

<template>
  <details
    v-if="hasInfo"
    class="rounded-lg border border-slate-200 bg-surface p-4"
    :open="open"
    data-test="event-info"
  >
    <summary class="cursor-pointer text-sm font-semibold text-brand-ink">
      {{ $t('guest.event.programHeading') }}
    </summary>
    <p v-if="branding.program" class="mt-3 whitespace-pre-line text-sm leading-6 text-slate-800">
      {{ branding.program }}
    </p>
    <template v-if="branding.flyerUrl">
      <a
        v-if="branding.flyerType === 'image'"
        :href="branding.flyerUrl"
        target="_blank"
        rel="noopener"
        class="mt-3 block"
      >
        <img
          :src="branding.flyerUrl"
          :alt="$t('guest.event.flyerAlt', { name: branding.eventName ?? '' })"
          class="w-full rounded border border-slate-200"
          loading="lazy"
        >
      </a>
      <a
        v-else
        :href="branding.flyerUrl"
        target="_blank"
        rel="noopener"
        class="mt-3 inline-flex min-h-[44px] items-center rounded bg-brand px-4 text-sm font-semibold text-brand-contrast"
      >
        {{ $t('guest.event.openFlyer') }}
      </a>
    </template>
  </details>
</template>
