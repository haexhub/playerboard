<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import type {
  ActiveRosterPlayer,
  VeoMatch,
  VeoUnassignedJerseyStat,
} from '~/composables/useVeoAnalytics'
import { useVeoPlayerAssignment } from '~/composables/useVeoPlayerAssignment'
import { categoryLabel, formatStatValue, statLabel } from '~/utils/veoStatLabels'
import VeoPlayerStatsCompare, { type VeoPlayerStatEntry } from './VeoPlayerStatsCompare.vue'

const props = defineProps<{
  match: VeoMatch
  teamId?: string
  slug?: string
  isTrainer?: boolean
  roster?: ActiveRosterPlayer[]
  unassignedStats?: VeoUnassignedJerseyStat[]
}>()

const emit = defineEmits<{ reassigned: [] }>()

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

// User Story 2 — per-player breakdown for this match. Assigned rows are
// already filtered member-facing by useVeoAnalytics().listMatches(); unassigned
// ones only ever arrive via `unassignedStats`, which the parent only passes
// for a trainer (FR-002/FR-011/SC-004).
const playerStatEntries = computed<VeoPlayerStatEntry[]>(() => {
  const byKey = new Map<string, VeoPlayerStatEntry>()
  for (const stat of props.match.player_stats) {
    const existing = byKey.get(stat.player_id) ?? {
      key: stat.player_id,
      playerId: stat.player_id,
      jerseyNumber: stat.jersey_number,
      playerName: stat.player_name,
      statTotals: {},
    }
    existing.statTotals[stat.stat_type] = stat.value
    byKey.set(stat.player_id, existing)
  }
  for (const stat of props.unassignedStats ?? []) {
    const key = `jersey-${stat.veoJerseyNumber}`
    const existing = byKey.get(key) ?? {
      key,
      playerId: null,
      jerseyNumber: stat.veoJerseyNumber,
      playerName: null,
      statTotals: {},
    }
    existing.statTotals[stat.statType] = stat.value
    byKey.set(key, existing)
  }
  return [...byKey.values()].sort(
    (a, b) => (a.jerseyNumber ?? Infinity) - (b.jerseyNumber ?? Infinity),
  )
})

// User Story 3 — trainer-only jersey-number assignment/correction. Unassigned
// jerseys carry their raw stats too (never a guessed player name, SC-004) —
// a trainer sees them as a hint that a mapping is still missing, instead of
// the jersey number silently disappearing.
type JerseyGroup = {
  jerseyNumber: number
  playerId: string | null
  playerName: string | null
  stats: { statType: string; value: number }[]
}

const jerseyGroups = computed<JerseyGroup[]>(() => {
  const byJersey = new Map<number, JerseyGroup>()
  for (const stat of props.match.player_stats) {
    if (!byJersey.has(stat.veo_jersey_number)) {
      byJersey.set(stat.veo_jersey_number, {
        jerseyNumber: stat.veo_jersey_number,
        playerId: stat.player_id,
        playerName: stat.player_name,
        stats: [],
      })
    }
  }
  for (const stat of props.unassignedStats ?? []) {
    const existing = byJersey.get(stat.veoJerseyNumber)
    if (existing) {
      existing.stats.push({ statType: stat.statType, value: stat.value })
    } else {
      byJersey.set(stat.veoJerseyNumber, {
        jerseyNumber: stat.veoJerseyNumber,
        playerId: null,
        playerName: null,
        stats: [{ statType: stat.statType, value: stat.value }],
      })
    }
  }
  return [...byJersey.values()].sort((a, b) => a.jerseyNumber - b.jerseyNumber)
})

// One jersey number's correction at a time, picked via dropdown — a full
// season can have many pending corrections, stacking them all is as
// cluttered as the match/player lists this mirrors.
const selectedJerseyNumber = ref<number | null>(null)

watch(
  jerseyGroups,
  (groups) => {
    if (!groups.some((g) => g.jerseyNumber === selectedJerseyNumber.value)) {
      selectedJerseyNumber.value = groups[0]?.jerseyNumber ?? null
    }
  },
  { immediate: true },
)

const selectedJerseyGroup = computed(
  () => jerseyGroups.value.find((g) => g.jerseyNumber === selectedJerseyNumber.value) ?? null,
)

const { assignPlayer, assignPlayerToAllMatches } = useVeoPlayerAssignment()
const selections = reactive<Record<number, string>>({})
const saving = reactive<Record<number, boolean>>({})
// Registering a player only after their matches already synced is common
// (FR-003 keeps the sync-time assignment frozen, on purpose) — this lets a
// trainer fix every already-synced match in one go instead of once each.
const applyToAllMatches = reactive<Record<number, boolean>>({})

const submitAssignment = async (jerseyNumber: number) => {
  const playerId = selections[jerseyNumber] ?? ''
  if (!props.teamId) return
  saving[jerseyNumber] = true
  try {
    if (playerId !== '' && applyToAllMatches[jerseyNumber]) {
      await assignPlayerToAllMatches({
        team_id: props.teamId,
        veo_jersey_number: jerseyNumber,
        player_id: playerId,
      })
    } else {
      await assignPlayer({
        team_id: props.teamId,
        match_id: props.match.id,
        veo_jersey_number: jerseyNumber,
        player_id: playerId === '' ? null : playerId,
      })
    }
    selections[jerseyNumber] = ''
    applyToAllMatches[jerseyNumber] = false
    emit('reassigned')
  } catch {
    toast.error('Zuordnung konnte nicht gespeichert werden')
  } finally {
    saving[jerseyNumber] = false
  }
}
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

    <div v-if="playerStatEntries.length" class="space-y-2 border-t border-neutral-100 pt-3">
      <p class="text-xs font-medium uppercase tracking-wide text-neutral-500">
        Spieler-Statistiken
      </p>
      <VeoPlayerStatsCompare :entries="playerStatEntries" :slug="slug" />
    </div>

    <div
      v-if="isTrainer && jerseyGroups.length"
      class="space-y-2 border-t border-neutral-100 pt-3"
      data-testid="veo-match-assignment"
    >
      <p class="text-xs font-medium uppercase tracking-wide text-neutral-500">
        Trikotnummer-Zuordnung
      </p>
      <select
        v-model.number="selectedJerseyNumber"
        class="min-h-touch w-full max-w-xs rounded border border-neutral-300 px-2 text-sm"
        data-testid="veo-jersey-select"
      >
        <option v-for="group in jerseyGroups" :key="group.jerseyNumber" :value="group.jerseyNumber">
          #{{ group.jerseyNumber }} · {{ group.playerName ?? 'Nicht zugeordnet' }}
        </option>
      </select>

      <div
        v-if="selectedJerseyGroup"
        class="space-y-1"
        :data-testid="`veo-assignment-row-${selectedJerseyGroup.jerseyNumber}`"
      >
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="w-10 tabular-nums text-neutral-500"
            >#{{ selectedJerseyGroup.jerseyNumber }}</span
          >
          <span class="flex-1 text-neutral-700">
            {{ selectedJerseyGroup.playerName ?? 'Nicht zugeordnet' }}
          </span>
          <select
            v-model="selections[selectedJerseyGroup.jerseyNumber]"
            class="min-h-touch rounded border border-neutral-300 px-2 text-sm"
            :data-testid="`veo-assignment-select-${selectedJerseyGroup.jerseyNumber}`"
          >
            <option value="">Spieler wählen…</option>
            <option v-for="p in roster ?? []" :key="p.id" :value="p.id">
              {{ p.jerseyNumber !== null ? `#${p.jerseyNumber} ` : '' }}{{ p.name }}
            </option>
          </select>
          <button
            type="button"
            class="min-h-touch rounded border border-neutral-300 px-3 text-sm"
            :data-testid="`veo-assignment-submit-${selectedJerseyGroup.jerseyNumber}`"
            :disabled="
              saving[selectedJerseyGroup.jerseyNumber] ||
              (!selections[selectedJerseyGroup.jerseyNumber] && !selectedJerseyGroup.playerId)
            "
            @click="submitAssignment(selectedJerseyGroup.jerseyNumber)"
          >
            {{ selectedJerseyGroup.playerId ? 'Zuordnung ändern' : 'Spieler zuordnen' }}
          </button>
        </div>
        <label
          v-if="selections[selectedJerseyGroup.jerseyNumber]"
          class="flex items-center gap-1.5 pl-12 text-xs text-neutral-500"
        >
          <input
            v-model="applyToAllMatches[selectedJerseyGroup.jerseyNumber]"
            type="checkbox"
            :data-testid="`veo-assignment-bulk-${selectedJerseyGroup.jerseyNumber}`"
          />
          Für alle noch nicht zugeordneten Spiele dieser Trikotnummer übernehmen
        </label>
        <div
          v-if="selectedJerseyGroup.stats.length"
          class="grid grid-cols-2 gap-x-4 pl-12 text-sm text-neutral-500"
          :data-testid="`veo-assignment-stats-${selectedJerseyGroup.jerseyNumber}`"
        >
          <template v-for="stat in selectedJerseyGroup.stats" :key="stat.statType">
            <span>{{ statLabel(stat.statType) }}</span>
            <span class="text-right tabular-nums">{{
              formatStatValue(stat.statType, stat.value)
            }}</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
