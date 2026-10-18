<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PricePreview from '~/components/admin/pricing/PricePreview.vue'
import PriceRuleForm from '~/components/admin/pricing/PriceRuleForm.vue'
import PriceRuleList from '~/components/admin/pricing/PriceRuleList.vue'
import { useAdminToast } from '~/composables/useAdminPage'
import { useAdminStore } from '~/stores/admin'
import { usePriceRulesStore } from '~/stores/price-rules'
import type { EventDto } from '~/../server/lib/contracts/admin'
import type { PriceRuleDto, PriceRuleInput } from '~/../server/lib/contracts/pricing'

// Aktionspreise: time-dependent prices (Happy Hour, Restposten). Prices are
// computed by the server when the menu loads and when an order is booked.
const props = defineProps<{ event: EventDto }>()

const { t } = useI18n()
const admin = useAdminStore()
const store = usePriceRulesStore()
const toast = useAdminToast()
const loaded = ref(false)
const editing = ref<PriceRuleDto | null>(null)
const busy = ref(false)
const busyId = ref<string | null>(null)
// New form after each create, so it starts empty.
const formKey = ref(0)

onMounted(async () => {
  try {
    await Promise.all([store.fetch(props.event.id), admin.fetchMenuItems(props.event.id)])
  }
  catch {
    toast.failure(t('admin.toast.actionFailed'))
  }
  loaded.value = true
})

async function onSubmit(input: PriceRuleInput) {
  busy.value = true
  try {
    if (editing.value) {
      await store.update(editing.value.id, input)
      editing.value = null
      toast.success(t('admin.pricing.saved'))
    }
    else {
      await store.create(props.event.id, input)
      toast.success(t('admin.pricing.created'))
    }
    formKey.value++
  }
  catch {
    toast.failure(t('admin.toast.actionFailed'))
  }
  finally {
    busy.value = false
  }
}

async function onToggle(rule: PriceRuleDto) {
  busyId.value = rule.id
  try {
    await store.update(rule.id, { isActive: !rule.isActive })
    toast.success(rule.isActive ? t('admin.pricing.deactivated') : t('admin.pricing.activated'))
  }
  catch {
    toast.failure(t('admin.toast.actionFailed'))
  }
  finally {
    busyId.value = null
  }
}

async function onRemove(rule: PriceRuleDto) {
  try {
    await store.remove(rule.id)
    if (editing.value?.id === rule.id) editing.value = null
    toast.success(t('admin.pricing.deleted'))
  }
  catch {
    toast.failure(t('admin.toast.actionFailed'))
  }
}

function onEdit(rule: PriceRuleDto) {
  editing.value = rule
  formKey.value++
}
</script>

<template>
  <div class="space-y-6">
    <p class="text-sm text-slate-600">
      {{ $t('admin.pricing.intro') }}
    </p>
    <p v-if="!loaded" class="text-sm text-slate-500">
      {{ $t('admin.loading') }}
    </p>
    <template v-else>
      <PricePreview :rows="store.preview" />

      <section>
        <h2 class="mb-2 text-sm font-semibold text-slate-700">
          {{ editing ? $t('admin.pricing.editTitle', { name: editing.name }) : $t('admin.pricing.new') }}
        </h2>
        <PriceRuleForm
          :key="formKey"
          :items="admin.menuItems"
          :rule="editing"
          :busy="busy"
          @submit="onSubmit"
          @cancel="editing = null; formKey++"
        />
      </section>

      <section>
        <h2 class="mb-2 text-sm font-semibold text-slate-700">
          {{ $t('admin.pricing.list') }}
        </h2>
        <PriceRuleList
          :rules="store.rules"
          :items="admin.menuItems"
          :busy-id="busyId"
          @toggle="onToggle"
          @edit="onEdit"
          @remove="onRemove"
        />
        <p class="mt-2 text-xs text-slate-500">
          {{ $t('admin.pricing.priorityHint') }}
        </p>
      </section>
    </template>
  </div>
</template>
