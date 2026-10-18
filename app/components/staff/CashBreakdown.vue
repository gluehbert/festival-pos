<script setup lang="ts">
import { computed } from 'vue'
import { useFormat } from '~/composables/useFormat'
import type { CashSessionDto } from '~/../server/lib/contracts/cash'

// Soll of a cash drawer line by line; with a counted amount also the difference.
const props = defineProps<{ session: CashSessionDto; countedCents?: number | null }>()
const { euro } = useFormat()

const counted = computed(() => props.countedCents ?? props.session.countedCents)
const difference = computed(() => (counted.value === null || counted.value === undefined ? null : counted.value - props.session.expectedCents))
const diffClass = computed(() => {
  if (difference.value === null || difference.value === 0) return 'text-emerald-700'
  return difference.value < 0 ? 'text-rose-700' : 'text-amber-800'
})
const diffLabel = computed(() => {
  if (difference.value === null) return ''
  if (difference.value === 0) return 'staff.cash.diffExact'
  return difference.value < 0 ? 'staff.cash.diffShort' : 'staff.cash.diffOver'
})
</script>

<template>
  <dl class="divide-y divide-slate-100 text-base" data-test="cash-breakdown">
    <div class="flex justify-between py-2">
      <dt>{{ $t('staff.cash.opening') }}</dt>
      <dd class="tabular-nums">
        {{ euro(session.openingCents) }}
      </dd>
    </div>
    <div class="flex justify-between py-2">
      <dt>+ {{ $t('staff.cash.collected') }}</dt>
      <dd class="tabular-nums">
        {{ euro(session.collectedCents) }}
      </dd>
    </div>
    <div class="flex justify-between py-2">
      <dt>− {{ $t('staff.cash.refunded') }}</dt>
      <dd class="tabular-nums">
        {{ euro(session.refundedCents) }}
      </dd>
    </div>
    <div v-if="session.depositReturnedCents !== 0" class="flex justify-between py-2">
      <dt>{{ $t('staff.cash.depositReturned') }}</dt>
      <dd class="tabular-nums">
        {{ euro(session.depositReturnedCents) }}
      </dd>
    </div>
    <div class="flex justify-between py-2 font-bold">
      <dt>= {{ $t('staff.cash.expected') }}</dt>
      <dd class="tabular-nums" data-test="cash-expected">
        {{ euro(session.expectedCents) }}
      </dd>
    </div>
    <template v-if="difference !== null">
      <div class="flex justify-between py-2">
        <dt>{{ $t('staff.cash.counted') }}</dt>
        <dd class="tabular-nums">
          {{ euro(counted!) }}
        </dd>
      </div>
      <div class="flex justify-between py-2 text-lg font-bold" :class="diffClass" data-test="cash-difference">
        <dt>{{ $t('staff.cash.difference') }} · {{ $t(diffLabel) }}</dt>
        <dd class="tabular-nums">
          {{ difference > 0 ? '+' : '' }}{{ euro(difference) }}
        </dd>
      </div>
    </template>
  </dl>
</template>
