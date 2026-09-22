<script setup lang="ts">
import { ref, watch } from 'vue'
import { errorMessage } from '~/utils/errors'

const props = defineProps<{
  teamId: string
}>()

const emit = defineEmits<{
  (e: 'edit', category: Cat): void
}>()

const { listAll, deactivate, remove, reorder, hasEntries } = useCategories()

type Cat = Awaited<ReturnType<typeof listAll>>[number]

const categories = ref<Cat[]>([])
const deletable = ref<Record<string, boolean>>({})
const loading = ref(false)
const error = ref<string | null>(null)
let latestLoad = 0

const load = async () => {
  const loadId = ++latestLoad
  const teamId = props.teamId
  loading.value = true
  error.value = null
  categories.value = []
  deletable.value = {}
  try {
    const nextCategories = await listAll(teamId)
    const checks = await Promise.all(nextCategories.map((c) => hasEntries(c.id)))
    if (loadId !== latestLoad) return
    categories.value = nextCategories
    deletable.value = Object.fromEntries(nextCategories.map((c, i) => [c.id, !checks[i]]))
  } catch (err) {
    if (loadId === latestLoad) {
      error.value = errorMessage(err, 'Kategorien konnten nicht geladen werden.')
    }
  } finally {
    if (loadId === latestLoad) loading.value = false
  }
}

watch(() => props.teamId, load, { immediate: true })

const move = async (index: number, direction: -1 | 1) => {
  const target = index + direction
  if (target < 0 || target >= categories.value.length) return
  const a = categories.value[index]!
  const b = categories.value[target]!
  try {
    await reorder(props.teamId, [
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ])
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'Reihenfolge konnte nicht geändert werden.')
  }
}

const onDeactivate = async (id: string) => {
  try {
    await deactivate(id)
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'Kategorie konnte nicht deaktiviert werden.')
  }
}

const onDelete = async (id: string) => {
  try {
    await remove(id)
    categories.value = categories.value.filter((c) => c.id !== id)
  } catch (err) {
    error.value = errorMessage(err, 'Kategorie konnte nicht gelöscht werden.')
  }
}

defineExpose({
  reload: load,
  maxSortOrder: () => categories.value.reduce((max, category) => Math.max(max, category.sort_order), 0),
})
</script>

<template>
  <div class="space-y-3" data-testid="category-list">
    <h3 class="text-sm font-semibold text-neutral-900">Punktekategorien</h3>
    <p v-if="loading" class="text-sm text-neutral-500">Lade…</p>
    <p v-else-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>
    <p v-else-if="categories.length === 0" class="text-sm text-neutral-500">
      Keine Kategorien vorhanden.
    </p>
    <ul v-else class="divide-y border rounded bg-white">
      <li
        v-for="(cat, index) in categories"
        :key="cat.id"
        data-testid="category-row"
        class="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between p-3"
        :class="{ 'opacity-60': !cat.active }"
      >
        <div class="text-sm">
          <p class="font-medium text-neutral-900">
            {{ cat.name }}
            <span v-if="!cat.active" class="text-neutral-500 font-normal">(inaktiv)</span>
          </p>
          <p class="text-neutral-500">
            Wertebereich {{ cat.value_min }}–{{ cat.value_max }} · Reihenfolge {{ cat.sort_order }}
          </p>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="index === 0"
            aria-label="Nach oben"
            class="min-h-touch min-w-touch px-3 rounded border border-neutral-300 text-sm disabled:opacity-40"
            @click="move(index, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            :disabled="index === categories.length - 1"
            aria-label="Nach unten"
            class="min-h-touch min-w-touch px-3 rounded border border-neutral-300 text-sm disabled:opacity-40"
            @click="move(index, 1)"
          >
            ↓
          </button>
          <button
            type="button"
            data-testid="category-edit-button"
            class="min-h-touch px-3 rounded border border-neutral-300 text-sm hover:bg-neutral-50"
            @click="emit('edit', cat)"
          >
            Bearbeiten
          </button>
          <button
            v-if="cat.active"
            type="button"
            class="min-h-touch px-3 rounded border border-neutral-300 text-sm hover:bg-neutral-50"
            @click="onDeactivate(cat.id)"
          >
            Deaktivieren
          </button>
          <button
            v-if="deletable[cat.id]"
            type="button"
            class="min-h-touch px-3 rounded border border-red-300 text-red-700 text-sm hover:bg-red-50"
            @click="onDelete(cat.id)"
          >
            Löschen
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
