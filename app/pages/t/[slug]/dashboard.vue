<script setup lang="ts">
import { computed, ref } from 'vue'
import RankingTable from '~/components/stats/RankingTable.vue'
import TimeframePicker from '~/components/stats/TimeframePicker.vue'
import VeoPlayerSeasonSummary from '~/components/veo/VeoPlayerSeasonSummary.vue'
import { useTimeframedRanking } from '~/composables/useRanking'
import {
  computePlayerSeasonSummary,
  computeUnassignedJerseySeasonSummary,
  useVeoAnalytics,
} from '~/composables/useVeoAnalytics'
import type { Database } from '~/types/database'

definePageMeta({
  middleware: ['team-context'],
})

const { currentTeam, currentSlug, isTrainer } = useTeamContext()
const user = useSupabaseUser()
const client = useSupabaseClient<Database>()
const teamId = computed(() => currentTeam.value?.id ?? '')
const slug = computed(() => currentSlug.value ?? '')

const { timeframe, seasonStart, ranking, isLoading, loadError } = await useTimeframedRanking(
  teamId,
  slug,
)

const linkedPlayerId = ref<string | null>(null)

const loadLinkedPlayer = async () => {
  if (!teamId.value || !user.value) return
  const { data, error } = await client
    .from('players')
    .select('id')
    .eq('team_id', teamId.value)
    .eq('linked_user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  linkedPlayerId.value = data?.id ?? null
}

await loadLinkedPlayer()

const { listMatches, listUnassignedJerseyStats } = useVeoAnalytics()
const veoPlayerSeasonSummary = ref<ReturnType<typeof computePlayerSeasonSummary>>([])
const veoUnassignedJerseySeasonSummary = ref<
  ReturnType<typeof computeUnassignedJerseySeasonSummary>
>([])

const loadVeoPlayerStats = async () => {
  if (!teamId.value) return
  try {
    const matches = await listMatches(teamId.value)
    // Trainer-only (FR-002/FR-011/SC-004) — lets the leaderboard include a
    // jersey number nobody has claimed yet instead of silently omitting it.
    // Fetched before assigning either ref: a jersey number transitioning
    // between assigned/unassigned must never be briefly missing from both
    // at once (see the same fix in analytics.vue's `load()`).
    let freshUnassigned: ReturnType<typeof computeUnassignedJerseySeasonSummary> = []
    if (isTrainer.value) {
      try {
        freshUnassigned = computeUnassignedJerseySeasonSummary(
          await listUnassignedJerseyStats(matches.map((m) => m.id)),
        )
      } catch {
        // Unassigned correction data is optional; keep the assigned summary
        // visible when this trainer-only request fails.
      }
    }
    veoPlayerSeasonSummary.value = computePlayerSeasonSummary(matches)
    veoUnassignedJerseySeasonSummary.value = freshUnassigned
  } catch {
    // Veo is an optional per-team integration; a fetch error here must not
    // break the rest of the dashboard.
    veoPlayerSeasonSummary.value = []
    veoUnassignedJerseySeasonSummary.value = []
  }
}
await loadVeoPlayerStats()

const myRow = computed(() =>
  linkedPlayerId.value
    ? (ranking.value?.rows.find((r) => r.player_id === linkedPlayerId.value) ?? null)
    : null,
)

const topThree = computed(() => ranking.value?.rows.slice(0, 3) ?? [])
</script>

<template>
  <section class="space-y-6" data-testid="dashboard-page">
    <header class="space-y-1.5">
      <h1 class="text-2xl font-semibold text-foreground">{{ currentTeam?.name ?? 'Team' }}</h1>
      <div class="flex items-center gap-2">
        <ShadcnBadge variant="secondary">
          {{ isTrainer ? 'Trainer-Ansicht' : 'Spieler-Ansicht' }}
        </ShadcnBadge>
        <ShadcnButton v-if="isTrainer" as-child variant="outline" size="sm">
          <NuxtLink :to="`/t/${slug}/analytics`" data-testid="dashboard-veo-link">
            Veo-Analytics konfigurieren
          </NuxtLink>
        </ShadcnButton>
      </div>
    </header>

    <TimeframePicker
      :preset="timeframe.preset.value"
      :range="timeframe.range.value"
      :custom-from="timeframe.customFrom.value"
      :custom-to="timeframe.customTo.value"
      :season-available="!!seasonStart"
      @update:preset="timeframe.setPreset"
      @update:custom="(v) => timeframe.setCustom(v.from, v.to)"
    />

    <template v-if="!isTrainer">
      <ShadcnCard v-if="myRow" data-testid="my-rank-card">
        <ShadcnCardContent class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm text-muted-foreground">Dein Platz</p>
            <p class="text-3xl font-semibold text-foreground">
              {{ myRow.rank_position }}
            </p>
          </div>
          <ShadcnButton v-if="linkedPlayerId" as-child variant="outline" size="sm">
            <NuxtLink :to="`/t/${slug}/players/${linkedPlayerId}`"> Mein Zeitverlauf </NuxtLink>
          </ShadcnButton>
        </ShadcnCardContent>
      </ShadcnCard>
      <p
        v-else-if="linkedPlayerId"
        class="text-sm text-muted-foreground"
        data-testid="my-rank-missing"
      >
        Für dich sind im gewählten Zeitraum keine Punkte erfasst.
      </p>
      <p v-else class="text-sm text-muted-foreground" data-testid="not-linked">
        Dein Account ist noch keinem Spieler-Datensatz zugeordnet.
      </p>
    </template>

    <section class="space-y-2" data-testid="top-three">
      <h2 class="text-lg font-semibold text-foreground">Top 3</h2>
      <p v-if="isLoading" class="text-sm text-muted-foreground">Lade…</p>
      <p v-else-if="loadError" class="text-sm text-destructive" role="alert">{{ loadError }}</p>
      <p v-else-if="topThree.length === 0" class="text-sm text-muted-foreground">
        Noch keine Punkte im gewählten Zeitraum.
      </p>
      <ol v-else class="space-y-1.5">
        <li v-for="row in topThree" :key="row.player_id">
          <ShadcnCard class="py-0 gap-0">
            <ShadcnCardContent class="flex items-center justify-between px-3 py-2">
              <span class="flex items-center gap-2">
                <ShadcnBadge variant="default" class="min-w-6 justify-center tabular-nums">
                  {{ row.rank_position }}
                </ShadcnBadge>
                <span class="text-muted-foreground text-sm">
                  {{ row.jersey_number !== null ? `#${row.jersey_number}` : '—' }}
                </span>
                {{ row.name }}
              </span>
              <ShadcnButton as-child variant="link" size="sm">
                <NuxtLink :to="`/t/${slug}/players/${row.player_id}`"> Details </NuxtLink>
              </ShadcnButton>
            </ShadcnCardContent>
          </ShadcnCard>
        </li>
      </ol>
    </section>

    <RankingTable
      v-if="isTrainer && !isLoading && !loadError"
      :ranking="ranking"
      :slug="slug"
      :link-players="true"
      :highlight-player-id="linkedPlayerId"
    />

    <VeoPlayerSeasonSummary
      v-if="veoPlayerSeasonSummary.length || veoUnassignedJerseySeasonSummary.length"
      :players="veoPlayerSeasonSummary"
      :unassigned-jersey-totals="veoUnassignedJerseySeasonSummary"
    />
  </section>
</template>
