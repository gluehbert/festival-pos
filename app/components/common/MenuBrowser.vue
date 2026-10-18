<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, useTemplateRef, watch } from 'vue'
import { useAllergenDisplay } from '~/composables/useAllergenDisplay'
import type { MenuItemDto, PopularItems } from '~/../server/lib/contracts/guest'
import { buildMenuTabs, searchMenu, type MenuSection } from '~/utils/menu-tabs'

// The menu split into tabs: "Frequent" (what this table usually orders and the
// event's best sellers), one tab per category with optional subcategory
// shortcuts, and a search across everything. Each item is rendered by the
// `item` slot, so guests and staff keep their own rows.
const props = withDefaults(defineProps<{
  items: MenuItemDto[]
  popular?: PopularItems | null
  // Quantities already in the order / cart, shown as a badge on each tab.
  quantities?: Record<string, number>
  listClass?: string
  // Staff: start with the search mostly scrolled out to the left, swipe
  // right to bring it in. Guests keep it in view.
  tuckSearch?: boolean
}>(), { popular: null, quantities: () => ({}), listClass: 'space-y-2', tuckSearch: false })

defineSlots<{ item(props: { item: MenuItemDto }): unknown }>()

const { t } = useI18n()
const uid = useId()
const root = useTemplateRef<HTMLElement>('root')
const bar = useTemplateRef<HTMLElement>('bar')
const searchInput = useTemplateRef<HTMLInputElement>('searchInput')
const row = useTemplateRef<HTMLElement>('row')
const searchToggle = useTemplateRef<HTMLElement>('searchToggle')

const allergens = useAllergenDisplay()
onMounted(allergens.init)

const POPULAR = 'popular'
const tabs = computed(() => buildMenuTabs(props.items))

const popularSections = computed<MenuSection[]>(() => {
  if (!props.popular) return []
  const byId = new Map(props.items.map((i) => [i.id, i]))
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((i): i is MenuItemDto => !!i)
  const sections: MenuSection[] = [
    { title: t('common.menuTabs.tableSection', { table: props.popular.tableNo ?? '' }), items: pick(props.popular.table) },
    { title: t('common.menuTabs.eventSection'), items: pick(props.popular.event) },
  ]
  return sections.filter((s) => s.items.length > 0)
})

const tabKeys = computed(() => [
  ...(popularSections.value.length > 0 ? [POPULAR] : []),
  ...tabs.value.map((tab) => tab.category),
])
const showBar = computed(() => tabKeys.value.length > 1)

// Tuck once, when the row first appears (the menu may load after mount).
// A row that fits the screen cannot scroll, so the search simply stays.
// The right half of the magnifier keeps peeking in, so it can be found.
const SEARCH_PEEK_PX = 20
let tucked = false
function tuck() {
  if (!props.tuckSearch || tucked || !row.value || !searchToggle.value) return
  tucked = true
  row.value.scrollLeft = searchToggle.value.offsetWidth - SEARCH_PEEK_PX
}
onMounted(tuck)
watch(row, tuck, { flush: 'post' })

const active = ref<string | null>(null)
// Until someone taps anything in the menu, "Frequent" is preselected as soon as
// it has items (it may load after the menu). After that the view never jumps.
const picked = ref(false)
watch(tabKeys, (keys) => {
  if (!picked.value || !active.value || !keys.includes(active.value)) active.value = keys[0] ?? null
}, { immediate: true })

const sections = computed<MenuSection[]>(() => {
  if (active.value === POPULAR) return popularSections.value
  const tab = tabs.value.find((x) => x.category === active.value) ?? tabs.value[0]
  if (!tab) return []
  // Without tabs the category name is the only heading there is.
  if (!showBar.value) return tab.sections.map((s) => ({ ...s, title: s.title ?? tab.category }))
  return tab.sections
})
const shortcuts = computed(() =>
  active.value === POPULAR ? [] : sections.value.map((s, i) => ({ title: s.title, i })).filter((s) => s.title),
)

function countOf(key: string): number {
  const tab = tabs.value.find((x) => x.category === key)
  if (!tab) return 0
  return tab.sections.reduce((sum, s) => sum + s.items.reduce((n, i) => n + (props.quantities[i.id] ?? 0), 0), 0)
}

function select(key: string) {
  active.value = key
  picked.value = true
  // Coming from further down the list: start the new tab at its top.
  if (root.value && root.value.getBoundingClientRect().top < 0) root.value.scrollIntoView({ block: 'start' })
}

function sectionId(i: number): string {
  return `${uid}-sec-${i}`
}

// Scroll a subcategory to just below the sticky tab bar.
function jump(i: number) {
  const el = document.getElementById(sectionId(i))
  if (!el) return
  const offset = (bar.value?.offsetHeight ?? 0) + 8
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' })
}

const searchOpen = ref(false)
const query = ref('')
const results = computed(() => searchMenu(props.items, query.value))
const searching = computed(() => searchOpen.value && query.value.trim() !== '')

async function toggleSearch() {
  searchOpen.value = !searchOpen.value
  query.value = ''
  if (searchOpen.value) {
    await nextTick()
    searchInput.value?.focus()
  }
}

function tabLabel(key: string): string {
  return key === POPULAR ? t('common.menuTabs.popular') : key
}
</script>

<template>
  <div ref="root" class="scroll-mt-2" @click.capture="picked = true">
    <div v-if="showBar" ref="bar" class="sticky top-0 z-10 -mx-4 px-4 pb-2 pt-2 backdrop-blur-md" data-test="menu-tabbar">
      <!-- One swipeable row: search first (mostly tucked away for staff),
           then the tabs, the allergen switch last. -->
      <div ref="row" class="flex gap-2 overflow-x-auto" data-test="menu-tabrow">
        <button
          ref="searchToggle"
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg"
          :class="searchOpen ? 'border-brand bg-brand text-brand-contrast' : 'border-slate-300 bg-surface text-slate-700'"
          :aria-label="searchOpen ? $t('common.menuTabs.searchClose') : $t('common.menuTabs.search')"
          :aria-expanded="searchOpen"
          data-test="menu-search-toggle"
          @click="toggleSearch"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <path v-if="searchOpen" d="M6 6l12 12M18 6L6 18" />
            <template v-else>
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" />
            </template>
          </svg>
        </button>
        <div role="tablist" :aria-label="$t('common.menuTabs.label')" class="flex shrink-0 gap-2" data-test="menu-tablist">
          <button
            v-for="key in tabKeys"
            :key="key"
            type="button"
            role="tab"
            :aria-selected="!searching && active === key"
            :aria-controls="`${uid}-panel`"
            class="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap"
            :class="!searching && active === key ? 'border-brand bg-brand text-brand-contrast' : 'border-slate-300 bg-surface text-slate-700'"
            data-test="menu-tab"
            @click="select(key)"
          >
            <UIcon v-if="key === POPULAR" name="i-lucide-star" class="-ml-1 size-4 shrink-0" aria-hidden="true" />
            {{ tabLabel(key) }}
            <span
              v-if="countOf(key) > 0"
              class="min-w-6 rounded-full px-1.5 text-xs leading-6"
              :class="!searching && active === key ? 'bg-surface text-brand-ink' : 'bg-brand text-brand-contrast'"
              :aria-label="$t('common.menuTabs.inOrder', { n: countOf(key) })"
            >{{ countOf(key) }}</span>
          </button>
        </div>
        <button
          type="button"
          class="flex h-11 shrink-0 items-center rounded-full border px-3 text-sm font-semibold whitespace-nowrap"
          :class="allergens.shown.value ? 'border-2 border-brand bg-surface text-brand-ink' : 'border-slate-300 bg-surface text-slate-700'"
          :aria-pressed="allergens.shown.value"
          data-test="allergen-toggle"
          @click="allergens.toggle"
        >
          <UIcon v-if="allergens.shown.value" name="i-lucide-check" class="-ml-1 mr-1 size-4 shrink-0" aria-hidden="true" />{{ $t('common.allergens.label') }}
        </button>
      </div>
      <input
        v-if="searchOpen"
        ref="searchInput"
        v-model="query"
        type="search"
        enterkeyhint="search"
        :placeholder="$t('common.menuTabs.searchPlaceholder')"
        :aria-label="$t('common.menuTabs.search')"
        class="mt-2 w-full rounded-lg border-2 border-slate-300 bg-surface px-3 py-2 text-base"
        data-test="menu-search"
        @keydown.esc="toggleSearch"
      >
      <nav
        v-if="!searching && shortcuts.length > 0"
        :aria-label="$t('common.menuTabs.subcategories')"
        class="mt-2 flex gap-2 overflow-x-auto"
      >
        <button
          v-for="s in shortcuts"
          :key="s.i"
          type="button"
          class="min-h-[36px] shrink-0 rounded-lg bg-slate-200 px-3 text-sm whitespace-nowrap text-slate-800"
          data-test="menu-subcategory"
          @click="jump(s.i)"
        >
          {{ s.title }}
        </button>
      </nav>
    </div>

    <div v-if="!showBar" class="flex justify-end pb-2">
      <button
        type="button"
        class="flex h-11 shrink-0 items-center rounded-full border px-3 text-sm font-semibold"
        :class="allergens.shown.value ? 'border-2 border-brand bg-surface text-brand-ink' : 'border-slate-300 bg-surface text-slate-700'"
        :aria-pressed="allergens.shown.value"
        data-test="allergen-toggle"
        @click="allergens.toggle"
      >
        <UIcon v-if="allergens.shown.value" name="i-lucide-check" class="-ml-1 mr-1 size-4 shrink-0" aria-hidden="true" />{{ $t('common.allergens.label') }}
      </button>
    </div>

    <div :id="`${uid}-panel`" :role="showBar ? 'tabpanel' : undefined" class="space-y-4">
      <template v-if="searching">
        <p class="mt-2 text-sm text-slate-500" role="status">
          {{ results.length > 0 ? $t('common.menuTabs.results', { n: results.length }) : $t('common.menuTabs.noResults') }}
        </p>
        <ul v-if="results.length > 0" :class="listClass">
          <template v-for="item in results" :key="item.id">
            <slot name="item" :item="item" />
          </template>
        </ul>
      </template>
      <template v-else>
        <section v-for="(sec, i) in sections" :id="sectionId(i)" :key="`${active}-${i}`" class="pt-2">
          <h3 v-if="sec.title" class="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
            {{ sec.title }}
          </h3>
          <ul :class="listClass">
            <template v-for="item in sec.items" :key="item.id">
              <slot name="item" :item="item" />
            </template>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>
