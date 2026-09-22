<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PublicRankingTable from '~/components/stats/PublicRankingTable.vue'
import TimeframePicker from '~/components/stats/TimeframePicker.vue'
import { usePublicRanking, type PublicRanking } from '~/composables/usePublicRanking'
import { useTimeframe } from '~/composables/useTimeframe'

definePageMeta({
  layout: 'public',
})

const route = useRoute()
const slug = computed(() => String(route.params.slug))

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
</script>

<template>
  <section class="space-y-6" data-testid="public-ranking-page">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-neutral-900">
        {{ ranking?.team_name ?? 'Rangliste' }}
      </h1>
      <p class="text-neutral-600">Öffentliche Rangliste</p>
    </header>

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
  </section>
</template>
