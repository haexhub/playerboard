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

const { currentTeam, currentSlug, isTrainer } = useTeamContext()
const { listMatches, getSyncStatus, listUnassignedJerseyStats, getActiveRoster } = useVeoAnalytics()

const matches = ref<VeoMatch[]>([])
const selectedMatchId = ref<string | null>(null)
const syncStatus = ref<VeoSyncStatus | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const activeRoster = ref<ActiveRosterPlayer[]>([])
const unassignedByMatch = ref<Record<string, VeoUnassignedJerseyStat[]>>({})
const correctionError = ref<string | null>(null)
let loadVersion = 0

const load = async () => {
  const requestVersion = ++loadVersion
  const teamId = currentTeam.value?.id
  if (!teamId) return
  const isCurrentLoad = () => requestVersion === loadVersion && currentTeam.value?.id === teamId
  isLoading.value = true
  loadError.value = null
  correctionError.value = null
  try {
    const [matchesResult, statusResult] = await Promise.allSettled([
      listMatches(teamId),
      getSyncStatus(teamId),
    ])
    if (!isCurrentLoad()) return
    // A failed status fetch must not hide the match list.
    syncStatus.value = statusResult.status === 'fulfilled' ? statusResult.value : null
    if (matchesResult.status === 'rejected') throw matchesResult.reason
    const freshMatches = matchesResult.value

    // US3 — trainer-only correction data, fetched alongside the match list
    // but never mixed into the member-facing `matches` above.
    let freshRoster: ActiveRosterPlayer[] = []
    let freshUnassigned: Record<string, VeoUnassignedJerseyStat[]> = {}
    let freshCorrectionError: string | null = null
    if (isTrainer.value) {
      const matchIds = freshMatches.map((m) => m.id)
      const [rosterResult, unassignedResult] = await Promise.allSettled([
        getActiveRoster(teamId),
        listUnassignedJerseyStats(matchIds),
      ])
      if (!isCurrentLoad()) return
      freshRoster = rosterResult.status === 'fulfilled' ? rosterResult.value : []
      freshUnassigned = unassignedResult.status === 'fulfilled' ? unassignedResult.value : {}
      const failed = [rosterResult, unassignedResult].find((r) => r.status === 'rejected')
      freshCorrectionError = failed
        ? failed.reason instanceof Error
          ? failed.reason.message
          : 'Trikotnummer-Zuordnung konnte nicht geladen werden'
        : null
    }
    if (!isCurrentLoad()) return

    // Assigned together, with no `await` in between: a jersey number
    // transitioning between assigned/unassigned must never be briefly
    // absent from both `matches` and `unassignedByMatch` at once — that
    // transient gap was resetting VeoMatchCard's own jersey selection.
    matches.value = freshMatches
    activeRoster.value = freshRoster
    unassignedByMatch.value = freshUnassigned
    correctionError.value = freshCorrectionError
    // Keep the trainer's current selection across a reload (e.g. after
    // assigning a jersey number); only default to the newest match when
    // nothing is selected yet or the selected match is gone.
    if (!matches.value.some((m) => m.id === selectedMatchId.value)) {
      selectedMatchId.value = matches.value[0]?.id ?? null
    }
  } catch (err) {
    if (!isCurrentLoad()) return
    loadError.value = err instanceof Error ? err.message : 'Konnte Veo-Daten nicht laden'
  } finally {
    if (requestVersion === loadVersion) isLoading.value = false
  }
}

watch(
  () => currentTeam.value?.id,
  () => {
    matches.value = []
    selectedMatchId.value = null
    syncStatus.value = null
    loadError.value = null
    activeRoster.value = []
    unassignedByMatch.value = {}
    correctionError.value = null
    isLoading.value = false
    void load()
  },
  { immediate: true },
)

const seasonSummary = computed(() => computeSeasonSummary(matches.value))
const selectedMatch = computed(
  () => matches.value.find((m) => m.id === selectedMatchId.value) ?? null,
)

const matchOptionLabel = (match: VeoMatch) => {
  const date = new Date(match.played_at).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const score =
    match.own_score !== null && match.opponent_score !== null
      ? ` (${match.own_score}:${match.opponent_score})`
      : ''
  return `${date} · vs. ${match.opponent_name}${score}`
}
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

    <!-- `isLoading` only replaces the match view on the very first load
    (no matches yet) — a reload triggered by `@reassigned` must not unmount
    VeoMatchCard, or its own selection state (jersey/player dropdowns)
    silently resets. -->
    <p v-if="isLoading && !matches.length" class="text-sm text-neutral-500">Lade Veo-Daten…</p>
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

      <label class="block max-w-md space-y-1 text-sm">
        <span class="text-neutral-700">Spiel auswählen</span>
        <select
          v-model="selectedMatchId"
          class="min-h-touch w-full rounded border border-neutral-300 px-2 text-sm"
          data-testid="veo-match-select"
        >
          <option v-for="match in matches" :key="match.id" :value="match.id">
            {{ matchOptionLabel(match) }}
          </option>
        </select>
      </label>

      <VeoMatchCard
        v-if="selectedMatch"
        :key="selectedMatch.id"
        :match="selectedMatch"
        :team-id="currentTeam?.id"
        :slug="currentSlug ?? undefined"
        :is-trainer="isTrainer"
        :roster="activeRoster"
        :unassigned-stats="unassignedByMatch[selectedMatch.id] ?? []"
        @reassigned="load"
      />
    </div>
  </section>
</template>
