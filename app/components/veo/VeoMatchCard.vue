<script setup lang="ts">
import { computed } from 'vue'
import type { VeoMatch } from '~/composables/useVeoAnalytics'
import { categoryLabel, statLabel } from '~/utils/veoStatLabels'

const props = defineProps<{ match: VeoMatch }>()

type StatPair = {
  statType: string
  category: string
  own: number
  opponent: number
}

const statPairs = computed<StatPair[]>(() => {
  const byKey = new Map<string, StatPair>()
  for (const stat of props.match.stats) {
    const existing = byKey.get(stat.stat_type) ?? {
      statType: stat.stat_type,
      category: stat.category,
      own: 0,
      opponent: 0,
    }
    existing[stat.team_association] = stat.value
    byKey.set(stat.stat_type, existing)
  }
  return [...byKey.values()]
})

const categories = computed(() => [...new Set(statPairs.value.map((s) => s.category))])
const statsForCategory = (category: string) =>
  statPairs.value.filter((s) => s.category === category)

const dateLabel = computed(() =>
  new Date(props.match.played_at).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }),
)

const hasScore = computed(
  () => props.match.own_score !== null && props.match.opponent_score !== null,
)
</script>

<template>
  <div
    class="rounded border border-neutral-200 bg-white p-4 space-y-4"
    data-testid="veo-match-card"
  >
    <header class="flex items-start justify-between gap-3">
      <div>
        <p class="text-sm text-neutral-500">
          {{ dateLabel }} · {{ match.home_or_away === 'home' ? 'Heim' : 'Auswärts' }}
        </p>
        <p class="text-lg font-semibold text-neutral-900">vs. {{ match.opponent_name }}</p>
      </div>
      <p class="text-2xl font-bold tabular-nums" data-testid="veo-match-score">
        {{ hasScore ? `${match.own_score}:${match.opponent_score}` : '–' }}
      </p>
    </header>

    <div v-if="!statPairs.length" class="text-sm text-neutral-500">
      Noch keine Statistik-Kategorien von Veo verfügbar.
    </div>

    <div v-for="category in categories" :key="category" class="space-y-1">
      <p class="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {{ categoryLabel(category) }}
      </p>
      <div
        v-for="stat in statsForCategory(category)"
        :key="stat.statType"
        class="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-sm"
        :data-testid="`veo-stat-${stat.statType}`"
      >
        <span class="text-neutral-700">{{ statLabel(stat.statType) }}</span>
        <span class="w-8 text-right tabular-nums font-medium">{{ stat.own }}</span>
        <span class="w-8 text-right tabular-nums text-neutral-500">{{ stat.opponent }}</span>
      </div>
    </div>
  </div>
</template>
