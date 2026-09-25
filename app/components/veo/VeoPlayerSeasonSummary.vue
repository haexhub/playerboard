<script setup lang="ts">
import { computed } from 'vue'
import type {
  VeoPlayerSeasonTotals,
  VeoUnassignedJerseySeasonTotals,
} from '~/composables/useVeoAnalytics'
import VeoPlayerStatsCompare, { type VeoPlayerStatEntry } from './VeoPlayerStatsCompare.vue'

const props = defineProps<{
  players: VeoPlayerSeasonTotals[]
  // Trainer-only — the parent only fetches/passes these for a trainer
  // (FR-002/FR-011/SC-004: regular members never see unassigned stats).
  unassignedJerseyTotals?: VeoUnassignedJerseySeasonTotals[]
}>()

const entries = computed<VeoPlayerStatEntry[]>(() => [
  ...props.players.map((p) => ({
    key: p.playerId,
    jerseyNumber: p.jerseyNumber,
    playerName: p.playerName,
    statTotals: p.statTotals,
  })),
  ...(props.unassignedJerseyTotals ?? []).map((u) => ({
    key: `jersey-${u.jerseyNumber}`,
    jerseyNumber: u.jerseyNumber,
    playerName: null,
    statTotals: u.statTotals,
  })),
])
</script>

<template>
  <div
    class="rounded border border-neutral-200 bg-white p-4 space-y-4"
    data-testid="veo-player-season-summary"
  >
    <h2 class="text-sm font-medium uppercase tracking-wide text-neutral-500">
      Spieler-Statistiken (Saison)
    </h2>
    <VeoPlayerStatsCompare :entries="entries" />
  </div>
</template>
