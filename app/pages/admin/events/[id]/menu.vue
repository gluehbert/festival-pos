<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import MenuImport from '~/components/admin/MenuImport.vue'
import MenuItemForm from '~/components/admin/MenuItemForm.vue'
import MenuItemTable from '~/components/admin/MenuItemTable.vue'
import { useAdminToast } from '~/composables/useAdminPage'
import { useAdminStore } from '~/stores/admin'
import type { CreateMenuItem, EventDto, MenuImportResult, UpdateMenuItem } from '~/../server/lib/contracts/admin'

const props = defineProps<{ event: EventDto }>()

const { t } = useI18n()
const admin = useAdminStore()
const toast = useAdminToast()
const busyIds = ref<Set<string>>(new Set())
const loaded = ref(false)

const distinct = (values: Array<string | null>) =>
  [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'de'))
const categories = computed(() => distinct(admin.menuItems.map((i) => i.category)))
const subcategories = computed(() => distinct(admin.menuItems.map((i) => i.subcategory)))
const missingAllergens = computed(() => admin.menuItems.filter((i) => !i.allergens).length)
const pdfBusy = ref(false)

onMounted(async () => {
  try {
    await admin.fetchMenuItems(props.event.id)
  }
  catch {
    toast.failure(t('admin.toast.actionFailed'))
  }
  loaded.value = true
})

async function onCreate(input: CreateMenuItem) {
  try {
    await admin.createMenuItem(props.event.id, input)
    toast.success(t('admin.menu.created'))
  }
  catch {
    toast.failure(t('admin.toast.createFailed'))
  }
}

function onImported(result: MenuImportResult) {
  toast.success(t('admin.menuImport.done', { created: result.created, updated: result.updated }))
}

async function onPatch(id: string, patch: UpdateMenuItem) {
  try {
    await admin.updateMenuItem(id, patch)
    toast.success(t('admin.menu.saved'))
  }
  catch {
    toast.failure(t('admin.toast.actionFailed'))
  }
}

async function downloadAllergenPdf() {
  pdfBusy.value = true
  try {
    const url = URL.createObjectURL(await admin.downloadAllergenPdf(props.event.id))
    const a = document.createElement('a')
    a.href = url
    a.download = 'allergene.pdf'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
  catch {
    toast.failure(t('admin.menu.pdfFailed'))
  }
  finally {
    pdfBusy.value = false
  }
}

async function onToggle(id: string, isAvailable: boolean) {
  if (busyIds.value.has(id)) return
  busyIds.value = new Set(busyIds.value).add(id)
  try {
    await admin.toggleAvailability(id, isAvailable)
    toast.success(isAvailable ? t('admin.menu.available') : t('admin.menu.unavailable'))
  }
  catch {
    toast.failure(t('admin.toast.actionFailed'))
  }
  finally {
    const after = new Set(busyIds.value)
    after.delete(id)
    busyIds.value = after
  }
}
</script>

<template>
  <div class="space-y-6">
    <MenuImport :event-id="event.id" @imported="onImported" />

    <section>
      <h2 class="mb-2 text-sm font-semibold text-slate-700">
        {{ $t('admin.menu.new') }}
      </h2>
      <MenuItemForm :categories="categories" :subcategories="subcategories" @submit="onCreate" />
    </section>

    <section>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-semibold text-slate-700">
          {{ $t('admin.menu.list') }}
        </h2>
        <button
          type="button"
          class="min-h-[44px] rounded border border-slate-300 bg-surface px-3 text-sm font-medium disabled:opacity-50"
          :disabled="pdfBusy || admin.menuItems.length === 0"
          data-test="allergen-pdf"
          @click="downloadAllergenPdf"
        >
          {{ $t('admin.menu.pdf') }}
        </button>
      </div>
      <p v-if="loaded && missingAllergens > 0" class="mb-2 text-sm text-amber-700" data-test="allergens-missing">
        {{ $t('admin.menu.missingCount', { n: missingAllergens }) }}
      </p>
      <p v-if="!loaded" class="text-sm text-slate-500">
        {{ $t('admin.loading') }}
      </p>
      <MenuItemTable
        v-else
        :items="admin.menuItems"
        :busy-ids="busyIds"
        :categories="categories"
        :subcategories="subcategories"
        @toggle="onToggle"
        @patch="onPatch"
      />
    </section>
  </div>
</template>
