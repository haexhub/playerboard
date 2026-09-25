<script setup lang="ts">
import { computed } from 'vue'
import type { PublicVeoStats, PublicVeoStatsRow } from '~/composables/usePublicVeoStats'
import { statLabel } from '~/utils/veoStatLabels'
import { medalRanksForStat } from '~/utils/veoPublicStats'

const props = defineProps<{
  veoStats: PublicVeoStats | null
}>()

// Fixed order, per 004-veo-player-analytics research.md §3.
const STAT_COLUMNS = [
  'distance_total_meters',
  'sprints_total',
  'top_speed_kmh',
  'average_speed_kmh',
  'high_intensity_runs_total',
  'seconds_played_total',
  'football_shots_total',
  'football_goal_total',
  'football_goal_involvement_total',
] as const

const rows = computed<PublicVeoStatsRow[]>(() => props.veoStats?.rows ?? [])

const medalRanks = computed(
  () =>
    Object.fromEntries(
      STAT_COLUMNS.map((statType) => [
        statType,
        medalRanksForStat(
          rows.value.map((row) => row.stats[statType]),
          3,
        ),
      ]),
    ) as Record<string, Array<number | null>>,
)

const medalClass = (rowIndex: number, statType: string): string => {
  const rank = medalRanks.value[statType]?.[rowIndex]
  if (rank === 1) return 'rounded bg-yellow-100 font-semibold text-yellow-900'
  if (rank === 2) return 'rounded bg-slate-200 font-semibold text-slate-800'
  if (rank === 3) return 'rounded bg-orange-100 font-semibold text-orange-900'
  return ''
}

const displayValue = (row: PublicVeoStatsRow, statType: string): string => {
  const value = row.stats?.[statType]
  if (value === undefined) return '–'
  if (statType === 'seconds_played_total') return String(Math.round(value / 60))
  return String(Math.round(value * 10) / 10)
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border">
    <ShadcnTable class="min-w-max" data-testid="public-veo-stats-table">
      <ShadcnTableHeader>
        <ShadcnTableRow class="hover:bg-transparent">
          <ShadcnTableHead class="sticky left-0 bg-card border-r">Trikot</ShadcnTableHead>
          <ShadcnTableHead
            v-for="statType in STAT_COLUMNS"
            :key="statType"
            class="text-right whitespace-nowrap"
          >
            {{ statLabel(statType) }}
          </ShadcnTableHead>
        </ShadcnTableRow>
      </ShadcnTableHeader>
      <ShadcnTableBody>
        <ShadcnTableEmpty
          v-if="!rows.length"
          :colspan="STAT_COLUMNS.length + 1"
          data-testid="public-veo-stats-empty"
        >
          Noch keine Veo-Daten für diese Saison.
        </ShadcnTableEmpty>
        <ShadcnTableRow v-for="(row, i) in rows" :key="i" data-testid="public-veo-stats-row">
          <th scope="row" class="sticky left-0 bg-card border-r px-2 py-2 text-left">
            {{ row.jersey_number !== null ? `#${row.jersey_number}` : '—' }}
          </th>
          <ShadcnTableCell
            v-for="statType in STAT_COLUMNS"
            :key="statType"
            class="text-right tabular-nums"
            :class="medalClass(i, statType)"
            :data-testid="`public-veo-stat-${statType}`"
          >
            {{ displayValue(row, statType) }}
          </ShadcnTableCell>
        </ShadcnTableRow>
      </ShadcnTableBody>
    </ShadcnTable>
  </div>
</template>
