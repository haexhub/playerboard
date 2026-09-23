<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PublicRankingTable from '~/components/stats/PublicRankingTable.vue'
import PublicVeoStatsTable from '~/components/stats/PublicVeoStatsTable.vue'
import TimeframePicker from '~/components/stats/TimeframePicker.vue'
import { usePublicRanking, type PublicRanking } from '~/composables/usePublicRanking'
import { usePublicVeoStats, type PublicVeoStats } from '~/composables/usePublicVeoStats'
import { useTimeframe } from '~/composables/useTimeframe'

definePageMeta({
  layout: 'public',
})

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const activeTab = ref<'points' | 'veo'>('points')

const { getPublicRanking } = usePublicRanking()
const seasonStart = ref<string | null>(null)
const timeframe = useTimeframe(slug, seasonStart)

const ranking = ref<PublicRanking | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
let latestLoad = 0

const load = async () => {
  const loadId = ++latestLoad
  isLoading.value = true
  loadError.value = null
  try {
    const next = await getPublicRanking(
      slug.value,
      timeframe.range.value.from,
      timeframe.range.value.to,
    )
    if (loadId !== latestLoad) return
    ranking.value = next
  } catch (err) {
    if (loadId === latestLoad) {
      loadError.value = err instanceof Error ? err.message : 'Rangliste konnte nicht geladen werden'
    }
  } finally {
    if (loadId === latestLoad) isLoading.value = false
  }
}

watch(
  () => [slug.value, timeframe.range.value.from, timeframe.range.value.to],
  () => void load(),
  { immediate: true },
)

// Fetched eagerly (not lazily on tab switch) — FR-005 requires the Veo tab
// button itself to be absent unless both gates are on, which can only be
// known after this call returns.
const { getPublicVeoStats } = usePublicVeoStats()
const veoStats = ref<PublicVeoStats | null>(null)
const veoLoadError = ref<string | null>(null)
let latestVeoLoad = 0

const loadVeoStats = async (teamSlug: string) => {
  const loadId = ++latestVeoLoad
  veoStats.value = null
  activeTab.value = 'points'
  veoLoadError.value = null
  try {
    const next = await getPublicVeoStats(teamSlug)
    if (loadId !== latestVeoLoad) return
    veoStats.value = next
    if (!next.enabled) activeTab.value = 'points'
  } catch (err) {
    if (loadId !== latestVeoLoad) return
    veoLoadError.value =
      err instanceof Error ? err.message : 'Veo-Stats konnten nicht geladen werden'
  }
}

watch(slug, (teamSlug) => void loadVeoStats(teamSlug), { immediate: true })
</script>

<template>
  <section class="space-y-6" data-testid="public-ranking-page">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-neutral-900">
        {{ ranking?.team_name ?? 'Rangliste' }}
      </h1>
      <p class="text-neutral-600">Öffentliche Rangliste</p>
    </header>

    <div v-if="veoStats?.enabled" class="flex gap-2" role="tablist" data-testid="public-tab-switch">
      <ShadcnButton
        :variant="activeTab === 'points' ? 'default' : 'outline'"
        role="tab"
        :aria-selected="activeTab === 'points'"
        data-testid="public-tab-points"
        @click="activeTab = 'points'"
      >
        Trainingsbewertungen
      </ShadcnButton>
      <ShadcnButton
        :variant="activeTab === 'veo' ? 'default' : 'outline'"
        role="tab"
        :aria-selected="activeTab === 'veo'"
        data-testid="public-tab-veo"
        @click="activeTab = 'veo'"
      >
        Veo-Stats
      </ShadcnButton>
    </div>

    <template v-if="activeTab === 'points'">
      <TimeframePicker
        v-if="!ranking?.not_found"
        :preset="timeframe.preset.value"
        :range="timeframe.range.value"
        :custom-from="timeframe.customFrom.value"
        :custom-to="timeframe.customTo.value"
        :season-available="false"
        @update:preset="timeframe.setPreset"
        @update:custom="(v) => timeframe.setCustom(v.from, v.to)"
      />

      <p v-if="isLoading" class="text-sm text-neutral-500">Lade…</p>
      <p v-else-if="loadError" class="text-sm text-red-700" role="alert">{{ loadError }}</p>
      <p
        v-else-if="ranking?.not_found"
        class="text-sm text-neutral-500"
        data-testid="public-ranking-not-found"
      >
        Kein Team unter dieser Adresse gefunden.
      </p>
      <PublicRankingTable v-else :ranking="ranking" />
    </template>

    <template v-else>
      <p v-if="veoStats?.season_start" class="text-sm text-neutral-600">
        Seit {{ new Date(veoStats.season_start).toLocaleDateString('de-DE') }}
      </p>
      <p v-if="veoLoadError" class="text-sm text-red-700" role="alert">{{ veoLoadError }}</p>
      <PublicVeoStatsTable v-else :veo-stats="veoStats" />
    </template>
  </section>
</template>
