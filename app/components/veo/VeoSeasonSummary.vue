<script setup lang="ts">
import { computed } from 'vue'
import type { VeoSeasonSummary } from '~/composables/useVeoAnalytics'
import { statLabel } from '~/utils/veoStatLabels'

const props = defineProps<{ summary: VeoSeasonSummary }>()

const totalGames = computed(() => props.summary.wins + props.summary.draws + props.summary.losses)
const categoryEntries = computed(() => Object.entries(props.summary.categoryTotals))
</script>

<template>
  <div
    class="rounded border border-neutral-200 bg-white p-4 space-y-3"
    data-testid="veo-season-summary"
  >
    <h2 class="text-sm font-medium uppercase tracking-wide text-neutral-500">Saison-Übersicht</h2>
    <p class="text-lg font-semibold text-neutral-900" data-testid="veo-season-record">
      {{ summary.wins }}S {{ summary.draws }}U {{ summary.losses }}N
      <span class="text-sm font-normal text-neutral-500">({{ totalGames }} Spiele)</span>
    </p>
    <div v-if="categoryEntries.length" class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <template v-for="[statType, value] in categoryEntries" :key="statType">
        <span class="text-neutral-700">{{ statLabel(statType) }}</span>
        <span
          class="text-right tabular-nums font-medium"
          :data-testid="`veo-season-total-${statType}`"
        >
          {{ value }}
        </span>
      </template>
    </div>
  </div>
</template>
