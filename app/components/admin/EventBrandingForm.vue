<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminStore } from '~/stores/admin'
import { useBranding } from '~/composables/useBranding'
import { accentTheme, contrastRatio, DEFAULT_ACCENT, HEX_COLOR } from '~/../server/lib/color'
import type { AssetKind, Branding } from '~/../server/lib/contracts/branding'
import BrandingAssetTile from '~/components/admin/BrandingAssetTile.vue'
import EventLogo from '~/components/common/EventLogo.vue'

const props = defineProps<{ eventId: string; eventName: string }>()
const emit = defineEmits<{ (e: 'saved' | 'failed', text: string): void }>()

const { t } = useI18n()
const admin = useAdminStore()
const { refresh: refreshPublicBranding } = useBranding()

const branding = ref<Branding | null>(null)
const name = ref(props.eventName)
const color = ref(DEFAULT_ACCENT)
const welcomeText = ref('')
const program = ref('')
const startsOn = ref('')
const endsOn = ref('')
const busy = ref(false)

const validName = computed(() => name.value.trim().length > 0)
const validColor = computed(() => HEX_COLOR.test(color.value))
const validDates = computed(() => !startsOn.value || !endsOn.value || endsOn.value >= startsOn.value)
const theme = computed(() => accentTheme(validColor.value ? color.value : DEFAULT_ACCENT))
// Light colours stay usable (darker text variant), but a hint helps admins.
const lowContrast = computed(() => validColor.value && contrastRatio(color.value, '#ffffff') < 3)

const assetUrls = computed<Record<AssetKind, string | null>>(() => ({
  logo: branding.value?.logoUrl ?? null,
  logo_dark: branding.value?.logoDarkUrl ?? null,
  flyer: branding.value?.flyerUrl ?? null,
}))
// How the logo appears in dark mode, so admins know whether to add a variant.
const logoNote = computed(() => {
  const b = branding.value
  if (!b?.logoUrl) return null
  if (b.logoDarkUrl) return t('admin.branding.logoDarkInUse')
  return t(b.logoFitsDark ? 'admin.branding.logoFitsDark' : 'admin.branding.logoOnPlate')
})

function apply(b: Branding) {
  branding.value = b
  name.value = b.eventName ?? props.eventName
  color.value = b.accentColor ?? DEFAULT_ACCENT
  welcomeText.value = b.welcomeText ?? ''
  program.value = b.program ?? ''
  startsOn.value = b.startsOn ?? ''
  endsOn.value = b.endsOn ?? ''
}

function errorText(e: unknown): string {
  return (e as { data?: { message?: string } })?.data?.message ?? t('admin.toast.actionFailed')
}

async function run(action: () => Promise<Branding>, message: string) {
  busy.value = true
  try {
    apply(await action())
    await refreshPublicBranding()
    emit('saved', message)
  }
  catch (e) {
    emit('failed', errorText(e))
  }
  finally {
    busy.value = false
  }
}

onMounted(async () => {
  try {
    apply(await admin.fetchBranding(props.eventId))
  }
  catch (e) {
    emit('failed', errorText(e))
  }
})

function save() {
  if (!validName.value || !validColor.value || !validDates.value) return
  void run(() => admin.saveBranding(props.eventId, {
    name: name.value,
    accentColor: color.value,
    welcomeText: welcomeText.value,
    program: program.value,
    startsOn: startsOn.value,
    endsOn: endsOn.value,
  }), t('admin.branding.saved'))
}

function resetColor() {
  color.value = DEFAULT_ACCENT
}

function upload(kind: AssetKind, file: File) {
  void run(() => admin.uploadAsset(props.eventId, kind, file), t('admin.branding.uploaded'))
}

function remove(kind: AssetKind) {
  void run(() => admin.deleteAsset(props.eventId, kind), t('admin.branding.removed'))
}
</script>

<template>
  <div class="grid gap-6 border-t border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-2" data-test="event-branding">
    <!-- Fields appear only once the stored values are loaded; otherwise input
         typed early would be overwritten by the loaded values. -->
    <p v-if="!branding" class="text-sm text-slate-600">
      {{ $t('admin.loading') }}
    </p>
    <form v-if="branding" class="space-y-4" @submit.prevent="save">
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-600" :for="`name-${eventId}`">
          {{ $t('admin.branding.name') }}
        </label>
        <input
          :id="`name-${eventId}`"
          v-model="name"
          required
          maxlength="200"
          class="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          :aria-invalid="!validName"
        >
      </div>

      <div>
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-600" :for="`color-${eventId}`">
          {{ $t('admin.branding.color') }}
        </label>
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model="color"
            type="color"
            class="h-10 w-14 cursor-pointer rounded border border-slate-300 bg-surface"
            :aria-label="$t('admin.branding.colorPicker')"
          >
          <input
            :id="`color-${eventId}`"
            v-model.trim="color"
            class="w-28 rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            maxlength="7"
            :aria-invalid="!validColor"
          >
          <button type="button" class="text-sm text-slate-600 underline" @click="resetColor">
            {{ $t('admin.branding.resetColor') }}
          </button>
        </div>
        <p v-if="!validColor" class="mt-1 text-xs text-rose-700">
          {{ $t('admin.branding.colorInvalid') }}
        </p>
        <p v-else-if="lowContrast" class="mt-1 text-xs text-amber-800">
          {{ $t('admin.branding.lowContrast') }}
        </p>
      </div>

      <fieldset>
        <legend class="block text-xs font-semibold uppercase tracking-wide text-slate-600">
          {{ $t('admin.branding.dates') }}
        </legend>
        <div class="mt-1 grid grid-cols-2 gap-2">
          <label class="text-xs text-slate-600">
            {{ $t('admin.events.startsOn') }}
            <input v-model="startsOn" type="date" class="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-900">
          </label>
          <label class="text-xs text-slate-600">
            {{ $t('admin.events.endsOn') }}
            <input v-model="endsOn" type="date" :min="startsOn || undefined" class="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-900" :aria-invalid="!validDates">
          </label>
        </div>
        <p v-if="!validDates" class="mt-1 text-xs text-rose-700">
          {{ $t('admin.validation.endsAfterStart') }}
        </p>
      </fieldset>

      <div>
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-600" :for="`welcome-${eventId}`">
          {{ $t('admin.branding.welcome') }}
        </label>
        <textarea
          :id="`welcome-${eventId}`"
          v-model="welcomeText"
          rows="2"
          maxlength="300"
          class="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          :placeholder="$t('admin.branding.welcomePlaceholder')"
        />
      </div>

      <div>
        <label class="block text-xs font-semibold uppercase tracking-wide text-slate-600" :for="`program-${eventId}`">
          {{ $t('admin.branding.program') }}
        </label>
        <textarea
          :id="`program-${eventId}`"
          v-model="program"
          rows="6"
          maxlength="4000"
          class="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          :placeholder="$t('admin.branding.programPlaceholder')"
        />
      </div>

      <button
        type="submit"
        class="min-h-[44px] rounded bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
        :disabled="busy || !validName || !validColor || !validDates"
      >
        {{ $t('admin.branding.save') }}
      </button>
    </form>

    <div v-if="branding" class="space-y-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {{ $t('admin.branding.preview') }}
        </p>
        <div class="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-surface" aria-hidden="true">
          <div class="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-sm font-semibold" :style="{ color: `light-dark(${theme.ink}, ${theme.inkDark})` }">
            <EventLogo :branding="branding" alt="" img-class="h-8 w-auto max-w-24 object-contain" />
            <span>{{ name }}</span>
          </div>
          <div class="space-y-2 p-3">
            <p v-if="welcomeText" class="whitespace-pre-line text-sm text-slate-800">
              {{ welcomeText }}
            </p>
            <span
              class="inline-block rounded-lg px-4 py-2 text-sm font-semibold"
              :style="{ background: theme.brand, color: theme.onBrand }"
            >{{ $t('admin.branding.sampleButton') }}</span>
          </div>
        </div>
      </div>

      <BrandingAssetTile
        v-for="kind in (['logo', 'logo_dark', 'flyer'] as const)"
        :key="kind"
        :kind="kind"
        :url="assetUrls[kind]"
        :is-pdf="kind === 'flyer' && branding?.flyerType === 'pdf'"
        :note="kind === 'logo' ? logoNote : null"
        :busy="busy"
        @upload="upload(kind, $event)"
        @remove="remove(kind)"
      />
    </div>
  </div>
</template>
