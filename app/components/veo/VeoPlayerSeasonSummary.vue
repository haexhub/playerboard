<script setup lang="ts">
import type { VeoPlayerSeasonTotals } from '~/composables/useVeoAnalytics'
import { statLabel } from '~/utils/veoStatLabels'

defineProps<{ players: VeoPlayerSeasonTotals[] }>()

// Fixed display order, same curated list as research.md §3.
const CURATED_STAT_ORDER = [
  'distance_total_meters',
  'sprints_total',
  'top_speed_kmh',
  'average_speed_kmh',
  'high_intensity_runs_total',
  'seconds_played_total',
  'football_shots_total',
  'football_goal_total',
  'football_goal_involvement_total',
]
</script>

<template>
  <div
    class="rounded border border-neutral-200 bg-white p-4 space-y-4"
    data-testid="veo-player-season-summary"
  >
    <h2 class="text-sm font-medium uppercase tracking-wide text-neutral-500">
      Spieler-Statistiken (Saison)
    </h2>
    <div
      v-for="player in players"
      :key="player.playerId"
      class="space-y-1"
      data-testid="veo-player-season-row"
    >
      <p class="text-sm font-semibold text-neutral-900">
        <span v-if="player.jerseyNumber !== null" class="tabular-nums">
          #{{ player.jerseyNumber }}
        </span>
        {{ player.playerName }}
      </p>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <template
          v-for="statType in CURATED_STAT_ORDER.filter((s) => player.statTotals[s] !== undefined)"
          :key="statType"
        >
          <span class="text-neutral-700">{{ statLabel(statType) }}</span>
          <span
            class="text-right tabular-nums font-medium"
            :data-testid="`veo-player-season-stat-${player.playerId}-${statType}`"
          >
            {{ player.statTotals[statType] }}
          </span>
        </template>
      </div>
    </div>
  </div>
</template>
