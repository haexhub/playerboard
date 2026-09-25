<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import VeoMatchCard from '~/components/veo/VeoMatchCard.vue'
import VeoLinkForm from '~/components/veo/VeoLinkForm.vue'
import VeoPublicStatsToggle from '~/components/veo/VeoPublicStatsToggle.vue'
import VeoSeasonSummary from '~/components/veo/VeoSeasonSummary.vue'
import VeoSyncStatusBanner from '~/components/veo/VeoSyncStatusBanner.vue'
import {
  computeSeasonSummary,
  useVeoAnalytics,
  type ActiveRosterPlayer,
  type VeoMatch,
  type VeoSyncStatus,
  type VeoUnassignedJerseyStat,
} from '~/composables/useVeoAnalytics'

definePageMeta({
  middleware: ['team-context'],
})

const { currentTeam, isTrainer } = useTeamContext()
const { listMatches, getSyncStatus, listUnassignedJerseyStats, getActiveRoster } = useVeoAnalytics()

const matches = ref<VeoMatch[]>([])
const syncStatus = ref<VeoSyncStatus | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const activeRoster = ref<ActiveRosterPlayer[]>([])
const unassignedByMatch = ref<Record<string, VeoUnassignedJerseyStat[]>>({})
const correctionError = ref<string | null>(null)

const load = async () => {
  const teamId = currentTeam.value?.id
  if (!teamId) return
  isLoading.value = true
  loadError.value = null
  correctionError.value = null
  try {
    const [matchesResult, statusResult] = await Promise.allSettled([
      listMatches(teamId),
      getSyncStatus(teamId),
    ])
    // A failed status fetch must not hide the match list.
    syncStatus.value = statusResult.status === 'fulfilled' ? statusResult.value : null
    if (matchesResult.status === 'rejected') throw matchesResult.reason
    matches.value = matchesResult.value

    // US3 — trainer-only correction data, fetched alongside the match list
    // but never mixed into the member-facing `matches` above.
    if (isTrainer.value) {
      const matchIds = matches.value.map((m) => m.id)
      const [rosterResult, unassignedResult] = await Promise.allSettled([
        getActiveRoster(teamId),
        listUnassignedJerseyStats(matchIds),
      ])
      activeRoster.value = rosterResult.status === 'fulfilled' ? rosterResult.value : []
      unassignedByMatch.value =
        unassignedResult.status === 'fulfilled' ? unassignedResult.value : {}
      const failed = [rosterResult, unassignedResult].find((r) => r.status === 'rejected')
      correctionError.value = failed
        ? failed.reason instanceof Error
          ? failed.reason.message
          : 'Trikotnummer-Zuordnung konnte nicht geladen werden'
        : null
    } else {
      activeRoster.value = []
      unassignedByMatch.value = {}
      correctionError.value = null
    }
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

    <section
      v-if="isTrainer && currentTeam?.id"
      class="space-y-8 rounded-lg border border-border bg-card p-4 sm:p-6"
      data-testid="veo-analytics-settings"
    >
      <header class="space-y-1">
        <h2 class="text-lg font-semibold text-neutral-900">Veo-Einstellungen</h2>
        <p class="text-sm text-neutral-600">
          Verknüpfe die Veo-Kamera und lege fest, ob die Saisonstatistiken öffentlich angezeigt
          werden.
        </p>
      </header>

      <VeoLinkForm :key="currentTeam.id" :team-id="currentTeam.id" />
      <VeoPublicStatsToggle :key="`public-${currentTeam.id}`" :team-id="currentTeam.id" />

      <p
        v-if="correctionError"
        class="text-sm text-red-700"
        role="alert"
        data-testid="veo-correction-error"
      >
        Trikotnummer-Zuordnung konnte nicht geladen werden: {{ correctionError }}
      </p>
    </section>

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
      <VeoMatchCard
        v-for="match in matches"
        :key="match.id"
        :match="match"
        :team-id="currentTeam?.id"
        :is-trainer="isTrainer"
        :roster="activeRoster"
        :unassigned-stats="unassignedByMatch[match.id] ?? []"
        @reassigned="load"
      />
    </div>
  </section>
</template>
