<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PlayerForm from '~/components/players/PlayerForm.vue'
import PlayerProgressChart from '~/components/stats/PlayerProgressChart.vue'
import TimeframePicker from '~/components/stats/TimeframePicker.vue'
import { useCategories, type ActiveCategory } from '~/composables/useCategories'
import { usePlayerScores, type PlayerScoreWithTeamStats } from '~/composables/usePlayerScores'
import { useTeamSettings } from '~/composables/useTeamSettings'
import { useTimeframe } from '~/composables/useTimeframe'
import type { Database } from '~/types/database'
import { errorMessage } from '~/utils/errors'

definePageMeta({
  middleware: ['team-context'],
})

const route = useRoute()
const playerId = String(route.params.id)

const { currentTeam, currentSlug, isTrainer } = useTeamContext()
const client = useSupabaseClient<Database>()
const teamId = computed(() => currentTeam.value?.id ?? '')
const slug = computed(() => currentSlug.value ?? '')

const { listActive: listCategories } = useCategories()
const { forPlayer, teamStatsForActivePlayers, playerTimeSeries } = usePlayerScores()
const { get: getSettings } = useTeamSettings()

const seasonStart = ref<string | null>(null)
if (teamId.value) {
  const s = await getSettings(teamId.value)
  seasonStart.value = s?.season_start ?? null
}

type PlayerInfo = {
  id: string
  team_id: string
  name: string
  jersey_number: number | null
  position: string | null
  photo_consent: boolean
  active: boolean
  email: string | null
  linked_user_id: string | null
}

const player = ref<PlayerInfo | null>(null)
const categories = ref<ActiveCategory[]>([])
const scores = ref<PlayerScoreWithTeamStats[]>([])
const timeSeries = ref<Map<string, { date: string; value: number }[]>>(new Map())
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const isEditing = ref(false)
const playerFormRef = ref<InstanceType<typeof PlayerForm> | null>(null)
const playerReloadError = ref<string | null>(null)
const isReloadingPlayer = ref(false)
let latestLoad = 0

const timeframe = useTimeframe(slug, seasonStart)

const loadStatic = async () => {
  // Fetch by id only (RLS scopes it) and take team_id from the row: the team
  // context's membership lookup can still be in flight on a first SSR visit,
  // and filtering on its empty id would render "nicht gefunden" for a real player.
  const { data: p, error } = await client
    .from('players')
    .select(
      'id, team_id, name, jersey_number, position, photo_consent, active, email, linked_user_id',
    )
    .eq('id', playerId)
    .maybeSingle()
  if (error) throw error
  player.value = p
  if (!p) return
  categories.value = await listCategories(p.team_id)
}

const reloadPlayer = async () => {
  playerReloadError.value = null
  isReloadingPlayer.value = true
  try {
    await loadStatic()
    return true
  } catch (err) {
    playerReloadError.value = errorMessage(
      err,
      'Spieler konnte nach dem Speichern nicht neu geladen werden.',
    )
    return false
  } finally {
    isReloadingPlayer.value = false
  }
}

const onPlayerSaved = async () => {
  if (await reloadPlayer()) isEditing.value = false
}

const loadTimeframed = async () => {
  if (!player.value) return
  const { team_id } = player.value
  const loadId = ++latestLoad
  isLoading.value = true
  loadError.value = null
  try {
    const [s, teamStats, series] = await Promise.all([
      forPlayer(team_id, playerId, timeframe.range.value.from, timeframe.range.value.to),
      teamStatsForActivePlayers(team_id, timeframe.range.value.from, timeframe.range.value.to),
      playerTimeSeries(team_id, playerId, timeframe.range.value.from, timeframe.range.value.to),
    ])
    if (loadId !== latestLoad) return
    scores.value = s.map((row) => {
      const stats = teamStats.get(row.category_id)
      return {
        ...row,
        team_avg: stats?.avg ?? null,
        team_median: stats?.median ?? null,
      }
    })
    timeSeries.value = series
  } catch (err) {
    if (loadId === latestLoad) {
      loadError.value = err instanceof Error ? err.message : 'Konnte Verlauf nicht laden'
    }
  } finally {
    if (loadId === latestLoad) isLoading.value = false
  }
}

await loadStatic()

watch(
  () => [timeframe.range.value.from, timeframe.range.value.to],
  () => void loadTimeframed(),
  { immediate: true },
)
</script>

<template>
  <section v-if="player" class="space-y-6" data-testid="player-detail-page">
    <header class="space-y-1">
      <div class="flex items-center justify-between gap-3">
        <h1 class="text-2xl font-semibold text-neutral-900">
          <span class="text-neutral-500 mr-2">
            {{ player.jersey_number !== null ? `#${player.jersey_number}` : '—' }}
          </span>
          {{ player.name }}
        </h1>
        <ShadcnButton
          v-if="isTrainer && !isEditing"
          type="button"
          variant="outline"
          size="sm"
          data-testid="player-detail-edit-button"
          @click="isEditing = true"
        >
          Bearbeiten
        </ShadcnButton>
      </div>
      <p v-if="player.position" class="text-sm text-neutral-600">Position: {{ player.position }}</p>
      <p v-if="isTrainer" class="text-sm text-neutral-600">
        Foto-Einwilligung: {{ player.photo_consent ? 'Ja' : 'Nein' }} ·
        {{ player.active ? 'Aktiv' : 'Inaktiv' }}
      </p>
    </header>

    <div
      v-if="isEditing"
      class="space-y-3 rounded-md border border-input p-4"
      data-testid="player-detail-edit-form"
    >
      <PlayerForm
        ref="playerFormRef"
        :team-id="player.team_id"
        :player="player"
        @saved="onPlayerSaved"
      />
      <div class="flex gap-2">
        <ShadcnButton
          type="button"
          variant="outline"
          :disabled="playerFormRef?.loading || isReloadingPlayer"
          @click="isEditing = false"
        >
          Abbrechen
        </ShadcnButton>
        <ShadcnButton
          type="submit"
          form="player-form"
          :disabled="playerFormRef?.loading || isReloadingPlayer"
          data-testid="player-detail-edit-submit"
        >
          {{ playerFormRef?.loading ? 'Speichere…' : 'Speichern' }}
        </ShadcnButton>
      </div>
    </div>
    <p v-if="playerReloadError" class="text-sm text-red-700" role="alert">
      {{ playerReloadError }}
      <button type="button" class="ml-2 underline" @click="reloadPlayer">Erneut versuchen</button>
    </p>

    <TimeframePicker
      :preset="timeframe.preset.value"
      :range="timeframe.range.value"
      :custom-from="timeframe.customFrom.value"
      :custom-to="timeframe.customTo.value"
      :season-available="!!seasonStart"
      @update:preset="timeframe.setPreset"
      @update:custom="(v) => timeframe.setCustom(v.from, v.to)"
    />

    <p v-if="isLoading" class="text-sm text-neutral-500">Lade Verlauf…</p>
    <p v-else-if="loadError" class="text-sm text-red-700" role="alert">
      {{ loadError }}
      <button type="button" class="ml-2 underline" @click="loadTimeframed">Erneut versuchen</button>
    </p>
    <PlayerProgressChart
      v-else
      :categories="categories"
      :time-series="timeSeries"
      :scores="scores"
    />

    <NuxtLink :to="`/t/${slug}/ranking`" class="text-sm underline text-neutral-600">
      ← Zur Rangliste
    </NuxtLink>
  </section>
  <p v-else class="text-neutral-500">Spieler:in nicht gefunden.</p>
</template>
