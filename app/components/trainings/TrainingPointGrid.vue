<script setup lang="ts">
import { AlertCircle } from '@lucide/vue'
import { computed, reactive, ref, watch } from 'vue'
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

const consentWarning = (name: string) =>
  `Keine Foto-Einwilligung: Fotos mit ${name} werden für andere ausgeblendet.`
// The warning icon's tooltip only surfaces on hover, which touch devices have no
// equivalent for; make it a focusable button that toggles a visible panel instead,
// closing on blur so tapping elsewhere (or the icon again) dismisses it.
const openConsentInfo = ref<string | null>(null)
const toggleConsentInfo = (playerId: string) => {
  openConsentInfo.value = openConsentInfo.value === playerId ? null : playerId
}
const closeConsentInfo = (playerId: string) => {
  if (openConsentInfo.value === playerId) openConsentInfo.value = null
}

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const stepValue = (player: ActivePlayer, category: ActiveCategory, delta: number) => {
  const k = key(player.id, category.id)
  const cell = cells[k]
  if (!cell) return
  const next =
    cell.value === null
      ? category.value_min
      : clamp(cell.value + delta, category.value_min, category.value_max)
  cellRevisions.set(k, (cellRevisions.get(k) ?? 0) + 1)
  cell.status = 'idle'
  cell.value = next
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
          <th scope="col" class="border-b border-neutral-200 px-2 py-2 text-left font-semibold">
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
            <span v-if="!p.photo_consent" class="relative inline-block align-text-bottom">
              <button
                type="button"
                class="ml-1 inline-flex size-4 items-center justify-center text-red-600"
                :aria-expanded="openConsentInfo === p.id"
                :aria-label="consentWarning(p.name)"
                :title="consentWarning(p.name)"
                data-testid="consent-missing-icon"
                @click="toggleConsentInfo(p.id)"
                @blur="closeConsentInfo(p.id)"
              >
                <AlertCircle class="size-4" aria-hidden="true" />
              </button>
              <span
                v-if="openConsentInfo === p.id"
                role="tooltip"
                class="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-normal text-neutral-700 shadow-md"
              >
                {{ consentWarning(p.name) }}
              </span>
            </span>
          </th>
          <td
            v-for="c in categories"
            :key="c.id"
            class="border-b border-neutral-200 px-1 py-1 align-middle"
            :data-testid="`cell-${p.id}-${c.id}`"
          >
            <div class="flex flex-col gap-1.5 w-72">
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  inputmode="numeric"
                  :min="c.value_min"
                  :max="c.value_max"
                  :value="cells[key(p.id, c.id)]?.value ?? ''"
                  :aria-label="`${p.name} — ${c.name}`"
                  class="min-h-touch w-16 shrink-0 rounded border border-neutral-300 px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  :class="{
                    'border-red-500': cells[key(p.id, c.id)]?.status === 'error',
                    'border-green-500': cells[key(p.id, c.id)]?.status === 'saved',
                  }"
                  @input="onInput(p.id, c.id, $event)"
                  @blur="onBlur(p, c)"
                />
                <button
                  type="button"
                  :disabled="cells[key(p.id, c.id)]?.value === c.value_min"
                  :aria-label="`${p.name} — ${c.name} verringern`"
                  title="Verringern"
                  class="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-neutral-300 bg-white text-xl font-semibold text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-40 disabled:pointer-events-none"
                  @click="stepValue(p, c, -1)"
                >
                  −
                </button>
                <ShadcnSlider
                  :model-value="sliderValue(p.id, c.id, c)"
                  :min="c.value_min"
                  :max="c.value_max"
                  :step="1"
                  :aria-label="`${p.name} — ${c.name} (Slider)`"
                  class="flex-1 **:data-[slot=slider-track]:h-3 **:data-[slot=slider-thumb]:size-11"
                  :class="{ 'opacity-40': cells[key(p.id, c.id)]?.value === null }"
                  @update:model-value="onSliderInput(p.id, c.id, $event)"
                  @value-commit="onSliderCommit(p, c)"
                />
                <button
                  type="button"
                  :disabled="cells[key(p.id, c.id)]?.value === c.value_max"
                  :aria-label="`${p.name} — ${c.name} erhöhen`"
                  title="Erhöhen"
                  class="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-neutral-300 bg-white text-xl font-semibold text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-40 disabled:pointer-events-none"
                  @click="stepValue(p, c, 1)"
                >
                  +
                </button>
              </div>
              <div
                v-if="cells[key(p.id, c.id)]?.status === 'error'"
                class="flex items-center gap-1 pl-1"
              >
                <span class="text-xs text-red-700" :title="cells[key(p.id, c.id)]?.error"> ! </span>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
