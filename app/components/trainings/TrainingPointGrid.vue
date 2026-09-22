<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { ActiveCategory } from '~/composables/useCategories'
import type { ActivePlayer } from '~/composables/usePlayers'
import { useTrainings } from '~/composables/useTrainings'
import { pointValueSchema } from '~/utils/validators'

const props = defineProps<{
  trainingId: string
  slug: string
  players: ActivePlayer[]
  categories: ActiveCategory[]
  initialEntries?: Array<{ player_id: string; category_id: string; value: number }>
}>()

defineEmits<{
  (e: 'add-player'): void
  (e: 'add-category'): void
}>()

type CellKey = `${string}:${string}`
type CellStatus = 'idle' | 'saving' | 'saved' | 'error'
type CellState = {
  value: number | null
  status: CellStatus
  error?: string
}

const { updateEntry, deleteEntry } = useTrainings()

const key = (playerId: string, categoryId: string): CellKey => `${playerId}:${categoryId}`

const cells = reactive<Record<CellKey, CellState>>({})

const initialMap = computed(() => {
  const m = new Map<CellKey, number>()
  for (const e of props.initialEntries ?? []) m.set(key(e.player_id, e.category_id), e.value)
  return m
})

// Seeds only the cells that do not exist yet, so rows/columns added later by
// the parent (new player/category) become editable without resetting the rest.
const ensureCells = () => {
  for (const p of props.players) {
    for (const c of props.categories) {
      const k = key(p.id, c.id)
      if (!cells[k]) cells[k] = { value: initialMap.value.get(k) ?? null, status: 'idle' }
    }
  }
}

watch(() => [props.players, props.categories], ensureCells, { immediate: true })

const jerseyLabel = (p: ActivePlayer) => (p.jersey_number !== null ? `#${p.jersey_number}` : '')

const cellRevisions = new Map<CellKey, number>()
const cellQueues = new Map<CellKey, Promise<void>>()

const commitCell = (playerId: string, categoryId: string, category: ActiveCategory) => {
  const k = key(playerId, categoryId)
  const state = cells[k]
  if (!state) return
  const revision = cellRevisions.get(k) ?? 0
  const value = state.value

  if (value !== null && !Number.isNaN(value)) {
    const parsed = pointValueSchema(category.value_min, category.value_max).safeParse(value)
    if (!parsed.success) {
      state.status = 'error'
      state.error = parsed.error.issues[0]?.message ?? 'Ungültig'
      return
    }
  }

  state.status = 'saving'
  state.error = undefined

  const previous = cellQueues.get(k) ?? Promise.resolve()
  const current = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        if (value === null || Number.isNaN(value)) {
          await deleteEntry({
            training_id: props.trainingId,
            player_id: playerId,
            category_id: categoryId,
          })
        } else {
          const parsed = pointValueSchema(category.value_min, category.value_max).parse(value)
          await updateEntry({
            training_id: props.trainingId,
            player_id: playerId,
            category_id: categoryId,
            value: parsed,
          })
        }
        if (cellRevisions.get(k) === revision) state.status = 'saved'
      } catch (err) {
        if (cellRevisions.get(k) === revision) {
          state.status = 'error'
          state.error = err instanceof Error ? err.message : 'Speichern fehlgeschlagen'
        }
      }
    })

  cellQueues.set(k, current)
  void current.then(
    () => {
      if (cellQueues.get(k) === current) cellQueues.delete(k)
    },
    () => {
      if (cellQueues.get(k) === current) cellQueues.delete(k)
    },
  )
}

const onInput = (playerId: string, categoryId: string, evt: Event) => {
  const target = evt.target as HTMLInputElement
  const k = key(playerId, categoryId)
  const cell = cells[k]
  if (!cell) return
  cellRevisions.set(k, (cellRevisions.get(k) ?? 0) + 1)
  cell.status = 'idle'
  if (target.value === '') {
    cell.value = null
  } else {
    const n = Number(target.value)
    cell.value = Number.isNaN(n) ? null : n
  }
}

const onBlur = (player: ActivePlayer, category: ActiveCategory) => {
  void commitCell(player.id, category.id, category)
}

const sliderValue = (playerId: string, categoryId: string, category: ActiveCategory) => {
  const v = cells[key(playerId, categoryId)]?.value
  return [v ?? category.value_min]
}

const onSliderInput = (playerId: string, categoryId: string, values: number[] | undefined) => {
  const k = key(playerId, categoryId)
  const cell = cells[k]
  if (!cell) return
  cellRevisions.set(k, (cellRevisions.get(k) ?? 0) + 1)
  cell.status = 'idle'
  cell.value = values?.[0] ?? null
}

const onSliderCommit = (player: ActivePlayer, category: ActiveCategory) => {
  void commitCell(player.id, category.id, category)
}

const resetCell = (player: ActivePlayer, category: ActiveCategory) => {
  const k = key(player.id, category.id)
  const cell = cells[k]
  if (!cell) return
  cellRevisions.set(k, (cellRevisions.get(k) ?? 0) + 1)
  cell.status = 'idle'
  cell.value = null
  void commitCell(player.id, category.id, category)
}
</script>

<template>
  <div class="relative overflow-x-auto rounded border border-neutral-200 bg-white">
    <table class="w-full text-sm border-collapse" data-testid="training-point-grid">
      <thead class="sticky top-0 z-10 bg-neutral-100">
        <tr>
          <th
            scope="col"
            class="sticky left-0 z-20 bg-neutral-100 border-b border-r border-neutral-200 px-3 py-2 text-left font-semibold min-w-[10rem]"
          >
            <div class="flex items-center gap-1">
              Spieler:in
              <button
                type="button"
                aria-label="Spieler:in hinzufügen"
                title="Spieler:in hinzufügen"
                data-testid="training-grid-add-player-button"
                class="min-h-touch min-w-touch inline-flex items-center justify-center rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                @click="$emit('add-player')"
              >
                +
              </button>
            </div>
          </th>
          <th
            v-for="c in categories"
            :key="c.id"
            scope="col"
            class="border-b border-neutral-200 px-2 py-2 text-left font-semibold whitespace-nowrap"
          >
            {{ c.name }}
            <span class="block text-[10px] font-normal text-neutral-500">
              {{ c.value_min }}–{{ c.value_max }}
            </span>
          </th>
          <th
            scope="col"
            class="border-b border-neutral-200 px-2 py-2 text-left font-semibold"
          >
            <button
              type="button"
              aria-label="Kategorie hinzufügen"
              title="Kategorie hinzufügen"
              data-testid="training-grid-add-category-button"
              class="min-h-touch min-w-touch inline-flex items-center justify-center rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
              @click="$emit('add-category')"
            >
              +
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!players.length">
          <td
            :colspan="categories.length + 2"
            class="px-3 py-3 text-sm text-neutral-500"
            data-testid="training-grid-empty-players"
          >
            Noch keine Spieler:innen.
          </td>
        </tr>
        <tr v-for="p in players" :key="p.id" class="min-h-touch">
          <th
            scope="row"
            class="sticky left-0 bg-white border-b border-r border-neutral-200 px-3 py-2 text-left font-medium align-middle min-h-touch"
          >
            <span class="text-neutral-500 mr-1">{{ jerseyLabel(p) }}</span>
            <NuxtLink :to="`/t/${slug}/players/${p.id}`" class="underline">{{ p.name }}</NuxtLink>
          </th>
          <td
            v-for="c in categories"
            :key="c.id"
            class="border-b border-neutral-200 px-1 py-1 align-middle"
            :data-testid="`cell-${p.id}-${c.id}`"
          >
            <div class="flex flex-col gap-1 w-32">
              <div class="flex items-center gap-1">
                <input
                  type="number"
                  inputmode="numeric"
                  :min="c.value_min"
                  :max="c.value_max"
                  :value="cells[key(p.id, c.id)]?.value ?? ''"
                  :aria-label="`${p.name} — ${c.name}`"
                  class="min-h-touch w-14 rounded border border-neutral-300 px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  :class="{
                    'border-red-500': cells[key(p.id, c.id)]?.status === 'error',
                    'border-green-500': cells[key(p.id, c.id)]?.status === 'saved',
                  }"
                  @input="onInput(p.id, c.id, $event)"
                  @blur="onBlur(p, c)"
                />
                <button
                  v-if="cells[key(p.id, c.id)]?.value !== null"
                  type="button"
                  aria-label="Wert zurücksetzen"
                  title="Wert zurücksetzen"
                  class="min-h-touch min-w-touch inline-flex items-center justify-center text-neutral-400 hover:text-neutral-700"
                  @click="resetCell(p, c)"
                >
                  ×
                </button>
                <span
                  v-if="cells[key(p.id, c.id)]?.status === 'saving'"
                  class="text-xs text-neutral-500"
                >
                  …
                </span>
                <span
                  v-else-if="cells[key(p.id, c.id)]?.status === 'saved'"
                  class="text-xs text-green-700"
                  aria-label="gespeichert"
                >
                  ✓
                </span>
                <span
                  v-else-if="cells[key(p.id, c.id)]?.status === 'error'"
                  class="text-xs text-red-700"
                  :title="cells[key(p.id, c.id)]?.error"
                >
                  !
                </span>
              </div>
              <ShadcnSlider
                :model-value="sliderValue(p.id, c.id, c)"
                :min="c.value_min"
                :max="c.value_max"
                :step="1"
                :aria-label="`${p.name} — ${c.name} (Slider)`"
                :class="{ 'opacity-40': cells[key(p.id, c.id)]?.value === null }"
                @update:model-value="onSliderInput(p.id, c.id, $event)"
                @value-commit="onSliderCommit(p, c)"
              />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
