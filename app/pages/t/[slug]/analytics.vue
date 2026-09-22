<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import VeoMatchCard from '~/components/veo/VeoMatchCard.vue'
import VeoSeasonSummary from '~/components/veo/VeoSeasonSummary.vue'
import VeoSyncStatusBanner from '~/components/veo/VeoSyncStatusBanner.vue'
import {
  computeSeasonSummary,
  useVeoAnalytics,
  type VeoMatch,
  type VeoSyncStatus,
} from '~/composables/useVeoAnalytics'

definePageMeta({
  middleware: ['team-context'],
})

const { currentTeam } = useTeamContext()
const { listMatches, getSyncStatus } = useVeoAnalytics()

const matches = ref<VeoMatch[]>([])
const syncStatus = ref<VeoSyncStatus | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)

const load = async () => {
  const teamId = currentTeam.value?.id
  if (!teamId) return
  isLoading.value = true
  loadError.value = null
  try {
    const [matchesResult, statusResult] = await Promise.allSettled([
      listMatches(teamId),
      getSyncStatus(teamId),
    ])
    // A failed status fetch must not hide the match list.
    syncStatus.value = statusResult.status === 'fulfilled' ? statusResult.value : null
    if (matchesResult.status === 'rejected') throw matchesResult.reason
    matches.value = matchesResult.value
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Konnte Veo-Daten nicht laden'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => currentTeam.value?.id,
  () => void load(),
  { immediate: true },
)

const seasonSummary = computed(() => computeSeasonSummary(matches.value))
</script>

<template>
  <section class="space-y-6" data-testid="veo-analytics-page">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-neutral-900">Veo-Analytics</h1>
      <p class="text-sm text-neutral-600">
        Ergebnisse und Team-Statistiken, automatisch aus der Veo-Kamera übernommen.
      </p>
    </header>

    <VeoSyncStatusBanner v-if="!isLoading && !loadError" :status="syncStatus" />

    <p v-if="isLoading" class="text-sm text-neutral-500">Lade Veo-Daten…</p>
    <p v-else-if="loadError" class="text-sm text-red-700" role="alert">{{ loadError }}</p>
    <p
      v-else-if="!matches.length"
      class="text-sm text-neutral-500"
      data-testid="veo-analytics-empty"
    >
      Noch keine Veo-Daten für dieses Team.
    </p>
    <div v-else class="space-y-4">
      <VeoSeasonSummary :summary="seasonSummary" />
      <VeoMatchCard v-for="match in matches" :key="match.id" :match="match" />
    </div>
  </section>
</template>
