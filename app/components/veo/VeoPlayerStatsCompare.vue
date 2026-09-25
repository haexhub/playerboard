<script lang="ts">
export type VeoPlayerStatEntry = {
  key: string
  jerseyNumber: number | null
  // null → no roster player assigned yet (trainer-only visibility is the
  // caller's responsibility: only pass unassigned entries when isTrainer).
  playerName: string | null
  // The real player id for a linkable profile — null for an unassigned
  // jersey number (`key` is `jersey-<number>` there, not a player id).
  playerId: string | null
  statTotals: Record<string, number>
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CURATED_STAT_ORDER, formatStatValue, statLabel } from '~/utils/veoStatLabels'

const props = defineProps<{ entries: VeoPlayerStatEntry[]; slug?: string }>()

const playerProfileLink = (entry: VeoPlayerStatEntry) =>
  entry.playerId && props.slug ? `/t/${props.slug}/players/${entry.playerId}` : null

const MAX_COMPARE = 4
const LEADERBOARD_SIZE = 3

const entryLabel = (entry: VeoPlayerStatEntry) =>
  `${entry.jerseyNumber !== null ? `#${entry.jerseyNumber} ` : ''}${
    entry.playerName ?? 'Nicht zugeordnet'
  }`

// One dropdown slot per entry being looked at — one by default, up to
// MAX_COMPARE for a side-by-side comparison.
const selectedKeys = ref<(string | null)[]>([])

watch(
  () => props.entries,
  (entries) => {
    const stillValid = selectedKeys.value.filter(
      (key) => key !== null && entries.some((e) => e.key === key),
    )
    selectedKeys.value = stillValid.length ? stillValid : entries.length ? [entries[0]!.key] : []
  },
  { immediate: true },
)

const selectedEntries = computed(() =>
  selectedKeys.value
    .map((key) => props.entries.find((e) => e.key === key))
    .filter((e): e is VeoPlayerStatEntry => e !== undefined),
)

const visibleStatTypes = computed(() =>
  CURATED_STAT_ORDER.filter((s) =>
    selectedEntries.value.some((e) => e.statTotals[s] !== undefined),
  ),
)

// Highlight the best (highest) value per stat row — every curated stat here
// is "more is better" (distance, sprints, goals, …). Ties all highlight.
const bestValueForStat = (statType: string) => {
  const values = selectedEntries.value
    .map((e) => e.statTotals[statType])
    .filter((v): v is number => v !== undefined)
  return values.length ? Math.max(...values) : null
}

const optionsForSlot = (slotIndex: number) =>
  props.entries.filter(
    (e) => e.key === selectedKeys.value[slotIndex] || !selectedKeys.value.includes(e.key),
  )

const canAddSlot = computed(
  () => selectedKeys.value.length < MAX_COMPARE && selectedKeys.value.length < props.entries.length,
)

const addSlot = () => {
  if (!canAddSlot.value) return
  const next = props.entries.find((e) => !selectedKeys.value.includes(e.key))
  selectedKeys.value.push(next?.key ?? null)
}

const removeSlot = (index: number) => {
  selectedKeys.value.splice(index, 1)
}

const setSlot = (index: number, key: string) => {
  selectedKeys.value[index] = key
}

type LeaderboardItem = { entry: VeoPlayerStatEntry; value: number; rank: number }

const MEDAL_CLASS: Record<number, string> = {
  1: 'rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-900',
  2: 'rounded bg-slate-200 px-1.5 py-0.5 text-slate-800',
  3: 'rounded bg-orange-100 px-1.5 py-0.5 text-orange-900',
}

const medalClass = (rank: number) => MEDAL_CLASS[rank] ?? ''

// Top 3 by value, but a tie extends the list rather than dropping tied
// entries. Rank is dense competition-style ("1223", not "1224"): a rank
// only advances by exactly one per distinct value, so two 1st places are
// followed by a 2nd, not a skipped-to 3rd — no medal slot goes unused.
const leaderboardForStat = (statType: string): LeaderboardItem[] => {
  const ranked = props.entries
    .map((entry) => ({ entry, value: entry.statTotals[statType] }))
    .filter((e): e is { entry: VeoPlayerStatEntry; value: number } => e.value !== undefined)
    .sort((a, b) => b.value - a.value)

  const result: LeaderboardItem[] = []
  let rank = 0
  let previousValue: number | null = null
  for (const item of ranked) {
    if (item.value !== previousValue) {
      rank += 1
      previousValue = item.value
    }
    if (rank > LEADERBOARD_SIZE) break
    result.push({ ...item, rank })
  }
  return result
}

const leaderboardStatTypes = computed(() =>
  CURATED_STAT_ORDER.filter((s) => props.entries.some((e) => e.statTotals[s] !== undefined)),
)
</script>

<template>
  <div class="space-y-4" data-testid="veo-player-stats-compare">
    <div v-if="leaderboardStatTypes.length" class="space-y-3">
      <h3 class="text-xs font-medium uppercase tracking-wide text-neutral-400">
        Bestenliste je Metrik
      </h3>
      <div
        v-for="statType in leaderboardStatTypes"
        :key="statType"
        class="space-y-0.5"
        :data-testid="`veo-leaderboard-${statType}`"
      >
        <p class="text-sm font-medium text-neutral-700">{{ statLabel(statType) }}</p>
        <ol class="space-y-0.5 text-sm">
          <li
            v-for="item in leaderboardForStat(statType)"
            :key="item.entry.key"
            class="flex justify-between gap-2"
            :class="medalClass(item.rank)"
            :data-testid="`veo-leaderboard-entry-${statType}-${item.entry.key}`"
            :data-rank="item.rank"
          >
            <span>
              {{ item.rank }}.
              <NuxtLink
                v-if="playerProfileLink(item.entry)"
                :to="playerProfileLink(item.entry)!"
                class="hover:underline"
              >
                {{ entryLabel(item.entry) }}
              </NuxtLink>
              <template v-else>{{ entryLabel(item.entry) }}</template>
            </span>
            <span class="tabular-nums font-medium">{{
              formatStatValue(statType, item.value)
            }}</span>
          </li>
        </ol>
      </div>
    </div>

    <div
      class="flex items-center justify-between gap-2"
      :class="{ 'border-t border-neutral-100 pt-4': leaderboardStatTypes.length }"
    >
      <h3 class="text-xs font-medium uppercase tracking-wide text-neutral-400">
        Im Detail vergleichen
      </h3>
      <button
        v-if="canAddSlot"
        type="button"
        class="text-sm text-primary underline"
        data-testid="veo-player-compare-add"
        @click="addSlot"
      >
        + hinzufügen
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <div v-for="(key, index) in selectedKeys" :key="index" class="flex items-center gap-1">
        <select
          :value="key"
          class="min-h-touch rounded border border-neutral-300 px-2 text-sm"
          :data-testid="`veo-player-select-${index}`"
          @change="setSlot(index, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="e in optionsForSlot(index)" :key="e.key" :value="e.key">
            {{ entryLabel(e) }}
          </option>
        </select>
        <button
          v-if="selectedKeys.length > 1"
          type="button"
          class="text-neutral-400 hover:text-neutral-700"
          :data-testid="`veo-player-select-remove-${index}`"
          @click="removeSlot(index)"
        >
          ×
        </button>
      </div>
    </div>

    <div v-if="selectedEntries.length" class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr>
            <th class="text-left font-medium text-neutral-500"></th>
            <th
              v-for="entry in selectedEntries"
              :key="entry.key"
              class="px-2 text-right font-semibold text-neutral-900"
            >
              <NuxtLink
                v-if="playerProfileLink(entry)"
                :to="playerProfileLink(entry)!"
                class="hover:underline"
              >
                {{ entryLabel(entry) }}
              </NuxtLink>
              <template v-else>{{ entryLabel(entry) }}</template>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="statType in visibleStatTypes"
            :key="statType"
            data-testid="veo-player-compare-row"
          >
            <td class="py-1 text-neutral-700">{{ statLabel(statType) }}</td>
            <td
              v-for="entry in selectedEntries"
              :key="entry.key"
              class="px-2 py-1 text-right tabular-nums"
              :class="{
                'rounded bg-green-100 font-semibold text-green-800':
                  selectedEntries.length > 1 &&
                  entry.statTotals[statType] !== undefined &&
                  entry.statTotals[statType] === bestValueForStat(statType),
              }"
              :data-testid="`veo-player-stat-${entry.key}-${statType}`"
            >
              {{
                entry.statTotals[statType] !== undefined
                  ? formatStatValue(statType, entry.statTotals[statType]!)
                  : '–'
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
