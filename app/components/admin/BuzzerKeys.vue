<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useApi } from '~/composables/useApi'
import { laneColor } from '~/utils/buzzer-lanes'
import type { EventDto } from '~/../server/lib/contracts/admin'
import { BUZZERS_PER_STATION, LANE_COLOR_NAMES, laneColors, type LaneColor, type Station, type StationBuzzers } from '~/../server/lib/contracts/production'

// Buzzers per station, each a one-key keyboard with its own lane on that
// station's screen. The admin presses the buzzer once and its key is stored,
// and picks the buzzer's colour, which its lane on the screen then takes
// (by default green, blue, amber, violet); rows of the features list.
const props = defineProps<{ event: EventDto }>()
const emit = defineEmits<{ (e: 'saved' | 'failed', text: string): void }>()

const { t } = useI18n()
const STATIONS: Station[] = ['kitchen', 'bar', 'cafe']
const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']
const buzzers = ref<StationBuzzers | null>(null)
const busy = ref(false)
// The buzzer waiting for its key; `index` = list length adds a new one.
const listening = ref<{ station: Station; index: number } | null>(null)

onMounted(async () => {
  try {
    buzzers.value = await useApi().get<StationBuzzers>(`/api/admin/events/${props.event.id}/buzzers`)
  }
  catch {
    emit('failed', t('admin.toast.actionFailed'))
  }
})

// Each buzzer's colour, a free default where none was picked; one more for
// the buzzer being added. Saved as shown, so a colour stays with its buzzer.
function colorsOf(station: Station): LaneColor[] {
  return laneColors(buzzers.value!.colors[station], buzzers.value![station].length + 1)
}

async function save(station: Station, keys: string[], colors: LaneColor[]) {
  busy.value = true
  try {
    buzzers.value = await useApi().put<StationBuzzers>(`/api/admin/events/${props.event.id}/buzzers`, { station, keys, colors: colors.slice(0, keys.length) })
    emit('saved', t('admin.features.saved'))
  }
  catch {
    emit('failed', t('admin.toast.actionFailed'))
  }
  finally {
    busy.value = false
  }
}

function setKey(station: Station, index: number, key: string) {
  const keys = [...buzzers.value![station]]
  if (keys.some((k, i) => k === key && i !== index)) {
    emit('failed', t('admin.features.buzzer.sameKey'))
    return
  }
  keys[index] = key
  void save(station, keys, colorsOf(station))
}

function remove(station: Station, index: number) {
  void save(station, buzzers.value![station].filter((_, i) => i !== index), colorsOf(station).filter((_, i) => i !== index))
}

function setColor(station: Station, index: number, color: LaneColor) {
  const colors = colorsOf(station)
  if (colors.some((c, i) => c === color && i !== index && i < buzzers.value![station].length)) return
  colors[index] = color
  void save(station, buzzers.value![station], colors)
}
// Colours another buzzer of the station already has.
const takenBy = (station: Station, index: number) => colorsOf(station).filter((_, i) => i !== index && i < buzzers.value![station].length)

function onCaptureKey(e: KeyboardEvent) {
  if (MODIFIERS.includes(e.key) || !listening.value) return
  e.preventDefault()
  e.stopPropagation()
  const { station, index } = listening.value
  stop()
  setKey(station, index, e.key)
}

function listen(station: Station, index: number) {
  listening.value = { station, index }
  window.addEventListener('keydown', onCaptureKey, true)
}

function stop() {
  listening.value = null
  window.removeEventListener('keydown', onCaptureKey, true)
}

const isListening = (station: Station, index: number) => listening.value?.station === station && listening.value.index === index
const keyLabel = (key: string) => (key === ' ' ? t('admin.features.buzzer.space') : key)

onBeforeUnmount(stop)
</script>

<template>
  <li class="py-3" data-test="buzzers">
    <p class="font-semibold text-slate-800">
      {{ $t('admin.features.buzzer.label') }}
    </p>
    <p class="text-slate-600">
      {{ $t('admin.features.buzzer.hint') }}
    </p>
    <details class="text-slate-600">
      <summary class="inline-flex min-h-[32px] cursor-pointer items-center font-semibold text-slate-700 underline">
        {{ $t('admin.features.moreLabel') }}
      </summary>
      <p>{{ $t('admin.features.buzzer.more') }}</p>
      <p class="mt-1">{{ $t('admin.features.buzzer.colorHint') }}</p>
    </details>
    <div v-if="buzzers" class="mt-2 grid gap-4 md:grid-cols-2">
      <section v-for="station in STATIONS" :key="station" :data-test="`buzzers-${station}`">
        <h3 class="font-semibold text-slate-700">
          {{ $t(`common.station.${station}`) }}
        </h3>
        <ul class="divide-y divide-slate-100">
          <li
            v-for="n in buzzers[station].length + (isListening(station, buzzers[station].length) ? 1 : 0)"
            :key="n"
            class="flex flex-wrap items-center justify-between gap-2 py-2"
            :data-test="`buzzer-${station}-${n}`"
          >
            <span class="flex items-center gap-2 font-semibold text-slate-800">
              <span class="size-4 rounded-full" :class="laneColor(colorsOf(station)[n - 1]!).bg" aria-hidden="true" />
              <template v-if="isListening(station, n - 1)">
                {{ $t('admin.features.buzzer.lane', { n, color: $t(`admin.features.buzzer.color.${colorsOf(station)[n - 1]}`) }) }}
              </template>
              <template v-else>
                {{ $t('admin.features.buzzer.name', { n }) }}
              </template>
              <select
                v-if="!isListening(station, n - 1)"
                class="min-h-[44px] rounded border border-slate-300 bg-surface px-2 font-semibold text-slate-700"
                :value="colorsOf(station)[n - 1]"
                :aria-label="$t('admin.features.buzzer.colorLabel', { n })"
                :disabled="busy || listening !== null"
                data-test="buzzer-color"
                @change="setColor(station, n - 1, ($event.target as HTMLSelectElement).value as LaneColor)"
              >
                <option v-for="c in LANE_COLOR_NAMES" :key="c" :value="c" :disabled="takenBy(station, n - 1).includes(c)">
                  {{ $t(`admin.features.buzzer.color.${c}`) }}
                </option>
              </select>
            </span>
            <span class="flex items-center gap-2">
              <template v-if="isListening(station, n - 1)">
                <span class="font-semibold text-slate-800" role="status">{{ $t('admin.features.buzzer.listening') }}</span>
                <button type="button" class="min-h-[44px] rounded border border-slate-300 px-3 font-semibold text-slate-700 hover:bg-slate-100" data-test="buzzer-cancel" @click="stop">
                  {{ $t('common.dialog.cancel') }}
                </button>
              </template>
              <template v-else>
                <kbd class="rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-slate-800" data-test="buzzer-current">
                  {{ keyLabel(buzzers[station][n - 1]!) }}
                </kbd>
                <button
                  type="button"
                  class="min-h-[44px] rounded border border-slate-300 px-3 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  :disabled="busy || listening !== null"
                  data-test="buzzer-set"
                  @click="listen(station, n - 1)"
                >
                  {{ $t('admin.features.buzzer.change') }}
                </button>
                <button
                  type="button"
                  class="min-h-[44px] rounded px-3 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  :disabled="busy || listening !== null"
                  data-test="buzzer-clear"
                  @click="remove(station, n - 1)"
                >
                  {{ $t('admin.features.buzzer.clear') }}
                </button>
              </template>
            </span>
          </li>
        </ul>
        <button
          v-if="buzzers[station].length < BUZZERS_PER_STATION && !isListening(station, buzzers[station].length)"
          type="button"
          class="mt-1 min-h-[44px] rounded border border-slate-300 px-3 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          :disabled="busy || listening !== null"
          data-test="buzzer-add"
          @click="listen(station, buzzers[station].length)"
        >
          {{ $t('admin.features.buzzer.add') }}
        </button>
      </section>
    </div>
  </li>
</template>
