<script setup lang="ts">
import { computed } from 'vue'
import { useApi } from '~/composables/useApi'
import { usePolling } from '~/composables/usePolling'
import ReportSection from '~/components/admin/reports/ReportSection.vue'
import RevenueTable from '~/components/admin/reports/RevenueTable.vue'
import TopItemsTable from '~/components/admin/reports/TopItemsTable.vue'
import VoidsTable from '~/components/admin/reports/VoidsTable.vue'
import PerStaffTable from '~/components/admin/reports/PerStaffTable.vue'
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
  ReportType,
  RevenueByCategoryRow,
  StaffMealReportRow,
  TopItemRow,
  VoidRow,
} from '~/../server/lib/contracts/reports'

interface Envelope<R> {
  eventId: string
  generatedAt: string
  type: string
  rows: R[]
}

const props = defineProps<{ event: EventDto }>()

const api = useApi()
const { t } = useI18n()
// Live numbers only change while the event is running.
const intervalMs = props.event.isActive ? 5000 : 60_000

function poll<R>(type: ReportType) {
  const p = usePolling<Envelope<R>>(
    () => api.get<Envelope<R>>(`/api/admin/events/${props.event.id}/reports?type=${type}`),
    { intervalMs },
  )
  return computed(() => p.data.value?.rows ?? [])
}

const revenue = poll<RevenueByCategoryRow>('revenue_by_category')
const topItems = poll<TopItemRow>('top_items')
const voids = poll<VoidRow>('voids')
const perStaff = poll<PaymentsByStaffRow>('payments_by_staff')
const perHour = poll<OrdersPerHourRow>('orders_per_hour')
const cashSessions = poll<CashSessionDto>('cash_sessions')
const deposits = poll<DepositReportRow>('deposits')
const staffMeals = poll<StaffMealReportRow>('staff_meals')
const assignments = poll<TableAssignment>('table_assignments')
const promos = poll<PriceRuleReportRow>('price_rules')
const usage = poll<AppUsageRow>('app_usage')
</script>

<template>
  <div>
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
