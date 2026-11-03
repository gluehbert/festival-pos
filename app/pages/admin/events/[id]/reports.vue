<script setup lang="ts">
import { computed } from 'vue'
import { useApi } from '~/composables/useApi'
import { usePolling } from '~/composables/usePolling'
import ReportSection from '~/components/admin/reports/ReportSection.vue'
import RevenueTable from '~/components/admin/reports/RevenueTable.vue'
import TopItemsTable from '~/components/admin/reports/TopItemsTable.vue'
import VoidsTable from '~/components/admin/reports/VoidsTable.vue'
import PerStaffTable from '~/components/admin/reports/PerStaffTable.vue'
import TipsTable from '~/components/admin/reports/TipsTable.vue'
import OrdersPerHourTable from '~/components/admin/reports/OrdersPerHourTable.vue'
import CashSessionsTable from '~/components/admin/reports/CashSessionsTable.vue'
import DepositsTable from '~/components/admin/reports/DepositsTable.vue'
import StaffMealsTable from '~/components/admin/reports/StaffMealsTable.vue'
import TableAssignmentsTable from '~/components/admin/reports/TableAssignmentsTable.vue'
import type { TableAssignment } from '~/../server/lib/contracts/tables'
import PriceRulesTable from '~/components/admin/reports/PriceRulesTable.vue'
import AppUsageReport from '~/components/admin/reports/AppUsageReport.vue'
import type { EventDto } from '~/../server/lib/contracts/admin'
import type { CashSessionDto } from '~/../server/lib/contracts/cash'
import type { DepositReportRow } from '~/../server/lib/contracts/deposit'
import type { PriceRuleReportRow } from '~/../server/lib/contracts/pricing'
import type {
  AppUsageRow,
  OrdersPerHourRow,
  PaymentsByStaffRow,
  ReportsAll,
  RevenueByCategoryRow,
  StaffMealReportRow,
  TipRow,
  TopItemRow,
  VoidRow,
} from '~/../server/lib/contracts/reports'

const props = defineProps<{ event: EventDto }>()

const api = useApi()
const { t, locale } = useI18n()
// Live numbers only change while the event is running.
const intervalMs = props.event.isActive ? 15_000 : 60_000

// One request for all tables, so they show the same snapshot.
const polling = usePolling<ReportsAll>(
  () => api.get<ReportsAll>(`/api/admin/events/${props.event.id}/reports/all`),
  { intervalMs },
)
const reports = computed(() => polling.data.value?.reports)
const revenue = computed<RevenueByCategoryRow[]>(() => reports.value?.revenue_by_category ?? [])
const topItems = computed<TopItemRow[]>(() => reports.value?.top_items ?? [])
const voids = computed<VoidRow[]>(() => reports.value?.voids ?? [])
const perStaff = computed<PaymentsByStaffRow[]>(() => reports.value?.payments_by_staff ?? [])
const tips = computed<TipRow[]>(() => reports.value?.tips ?? [])
const perHour = computed<OrdersPerHourRow[]>(() => reports.value?.orders_per_hour ?? [])
const cashSessions = computed<CashSessionDto[]>(() => reports.value?.cash_sessions ?? [])
const deposits = computed<DepositReportRow[]>(() => reports.value?.deposits ?? [])
const staffMeals = computed<StaffMealReportRow[]>(() => reports.value?.staff_meals ?? [])
const assignments = computed<TableAssignment[]>(() => reports.value?.table_assignments ?? [])
const promos = computed<PriceRuleReportRow[]>(() => reports.value?.price_rules ?? [])
const usage = computed<AppUsageRow[]>(() => reports.value?.app_usage ?? [])

const asOf = computed(() => {
  const at = polling.data.value?.generatedAt
  return at
    ? new Date(at).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : null
})
</script>

<template>
  <div>
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-slate-500" data-test="reports-internal-note">
        {{ t('admin.reports.internalNote') }}
      </p>
      <div class="flex items-center gap-2 text-xs text-slate-500">
        <span v-if="asOf" data-test="reports-as-of">{{ t('admin.reports.asOf', { time: asOf }) }}</span>
        <button
          type="button"
          data-test="reports-refresh"
          class="min-h-[36px] rounded border border-slate-300 bg-surface px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          @click="polling.refresh()"
        >
          {{ t('admin.reports.refreshNow') }}
        </button>
      </div>
    </div>
    <ReportSection
      :title="t('admin.reports.sections.revenue')"
      :hint="t('admin.reports.revenueHint')"
      :event-id="event.id"
      type="revenue_by_category"
    >
      <RevenueTable :rows="revenue" />
    </ReportSection>
    <ReportSection
      :title="t('admin.reports.sections.topItems')"
      :hint="t('admin.reports.revenueHint')"
      :event-id="event.id"
      type="top_items"
    >
      <TopItemsTable :rows="topItems" />
    </ReportSection>
    <ReportSection
      :title="t('admin.reports.sections.promos')"
      :hint="t('admin.reports.promoHint')"
      :event-id="event.id"
      type="price_rules"
    >
      <PriceRulesTable :rows="promos" />
    </ReportSection>
    <ReportSection
      :title="t('admin.reports.sections.usage')"
      :hint="t('admin.reports.usageHint')"
      :event-id="event.id"
      type="app_usage"
    >
      <AppUsageReport :rows="usage" />
    </ReportSection>
    <ReportSection :title="t('admin.reports.sections.voids')" :event-id="event.id" type="voids">
      <VoidsTable :rows="voids" />
    </ReportSection>
    <ReportSection
      :title="t('admin.reports.sections.tableAssignments')"
      :hint="t('admin.reports.tableAssignmentsHint')"
      :event-id="event.id"
      type="table_assignments"
    >
      <TableAssignmentsTable :rows="assignments" />
    </ReportSection>
    <ReportSection :title="t('admin.reports.sections.perStaff')" :event-id="event.id" type="payments_by_staff">
      <PerStaffTable :rows="perStaff" />
    </ReportSection>
    <ReportSection
      :title="t('admin.reports.sections.tips')"
      :hint="t('admin.reports.tipsHint')"
      :event-id="event.id"
      type="tips"
    >
      <TipsTable :rows="tips" />
    </ReportSection>
    <ReportSection :title="t('admin.reports.sections.cashSessions')" :event-id="event.id" type="cash_sessions">
      <CashSessionsTable :rows="cashSessions" />
    </ReportSection>
    <ReportSection
      :title="t('admin.reports.sections.deposits')"
      :hint="t('admin.reports.depositHint')"
      :event-id="event.id"
      type="deposits"
    >
      <DepositsTable :rows="deposits" />
    </ReportSection>
    <ReportSection
      :title="t('admin.reports.sections.staffMeals')"
      :hint="t('admin.reports.staffMealHint')"
      :event-id="event.id"
      type="staff_meals"
    >
      <StaffMealsTable :rows="staffMeals" />
    </ReportSection>
    <ReportSection
      :title="t('admin.reports.sections.perHour')"
      :hint="t('admin.reports.perHourHint')"
      :event-id="event.id"
      type="orders_per_hour"
    >
      <OrdersPerHourTable :rows="perHour" />
    </ReportSection>
  </div>
</template>
