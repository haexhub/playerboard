<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CategoryForm from '~/components/categories/CategoryForm.vue'
import PlayerForm from '~/components/players/PlayerForm.vue'
import TrainingPhotoGallery from '~/components/trainings/TrainingPhotoGallery.vue'
import TrainingPhotoUpload from '~/components/trainings/TrainingPhotoUpload.vue'
import TrainingPointGrid from '~/components/trainings/TrainingPointGrid.vue'
import { useCategories, type ActiveCategory } from '~/composables/useCategories'
import { usePlayers, type ActivePlayer } from '~/composables/usePlayers'
import { useTrainings, type PointEntryRow, type TrainingRow } from '~/composables/useTrainings'
import {
  useTrainingPhotos,
  type ConsentStatus,
  type TrainingPhotoView,
} from '~/composables/useTrainingPhotos'
import { formatDate, isoDate } from '~/utils/dates'
import { trainingDateSchema } from '~/utils/validators'

definePageMeta({
  middleware: ['team-context'],
})

const route = useRoute()
const trainingId = String(route.params.id)
const { currentTeam, isTrainer } = useTeamContext()
const teamId = computed(() => currentTeam.value?.id ?? '')
const slug = computed(() => currentTeam.value?.slug ?? '')

const { get, listEntries, save, deleteTraining } = useTrainings()
const { listActive: listPlayers } = usePlayers()
const { listActive: listCategories } = useCategories()
const { list: listPhotos, deriveConsentStatus } = useTrainingPhotos()

const training = ref<TrainingRow | null>(null)
const players = ref<ActivePlayer[]>([])
const categories = ref<ActiveCategory[]>([])
const entries = ref<PointEntryRow[]>([])
const photos = ref<TrainingPhotoView[]>([])
const consentStatus = ref<ConsentStatus>('clean')
const isSaving = ref(false)
const saveError = ref<string | null>(null)
const photosError = ref<string | null>(null)

const isoToday = isoDate(new Date())
const dateInput = ref('')
const isSavingDate = ref(false)
const dateError = ref<string | null>(null)

const isDeleteDialogOpen = ref(false)
const isDeleting = ref(false)
const deleteError = ref<string | null>(null)

const trainingTeamId = computed(() => training.value?.team_id ?? '')

const isCategoryDialogOpen = ref(false)
const categoryDialogSeq = ref(0)
const categoriesError = ref<string | null>(null)
const nextCategorySortOrder = computed(
  () => categories.value.reduce((max, c) => Math.max(max, c.sort_order), 0) + 1,
)

const openCategoryDialog = () => {
  categoryDialogSeq.value += 1
  isCategoryDialogOpen.value = true
}

const onCategorySaved = async () => {
  isCategoryDialogOpen.value = false
  categoriesError.value = null
  try {
    categories.value = await listCategories(trainingTeamId.value)
  } catch (err) {
    categoriesError.value =
      err instanceof Error ? err.message : 'Kategorien konnten nicht aktualisiert werden'
  }
}

const isPlayerDialogOpen = ref(false)
const playerDialogSeq = ref(0)
const playersError = ref<string | null>(null)
const playerFormRef = ref<InstanceType<typeof PlayerForm> | null>(null)

const openPlayerDialog = () => {
  playerDialogSeq.value += 1
  isPlayerDialogOpen.value = true
}

const onPlayerSaved = async () => {
  isPlayerDialogOpen.value = false
  playersError.value = null
  try {
    players.value = await listPlayers(trainingTeamId.value)
  } catch (err) {
    playersError.value =
      err instanceof Error ? err.message : 'Spieler konnten nicht aktualisiert werden'
  }
}

type TrainingDetailData = {
  training: TrainingRow | null
  players: ActivePlayer[]
  categories: ActiveCategory[]
  entries: PointEntryRow[]
  photos: TrainingPhotoView[]
  consentStatus: ConsentStatus
}

const canSave = computed(() => training.value?.status === 'draft' && !isSaving.value)

const load = async (): Promise<TrainingDetailData> => {
  // Fetch the training first and derive its team_id from the row itself,
  // rather than from useTeamContext()'s async membership lookup — that lookup
  // can still be in flight on a first-ever SSR visit (e.g. a player opening a
  // shared training link directly, with no prior page view to have warmed
  // it). Depending on it here previously meant this page could permanently
  // render "Training nicht gefunden": load() would run once with an empty
  // team id, and because that id resolves to its final value with no
  // observable *change* during hydration, a `watch`-based refetch never
  // fires to correct it. RLS already scopes `get(trainingId)` correctly, so
  // no team_id is needed to fetch the training itself in the first place.
  const [t, es] = await Promise.all([get(trainingId), listEntries(trainingId)])
  if (!t) {
    return {
      training: null,
      players: [],
      categories: [],
      entries: es,
      photos: [],
      consentStatus: 'blocked',
    }
  }
  const [ps, cs, cStatus] = await Promise.all([
    listPlayers(t.team_id),
    listCategories(t.team_id),
    deriveConsentStatus(t.team_id),
  ])
  const maySeePhotos = isTrainer.value || cStatus === 'clean'
  const photoRows = maySeePhotos ? await listPhotos(trainingId) : []
  return {
    training: t,
    players: ps,
    categories: cs,
    entries: es,
    photos: photoRows,
    consentStatus: cStatus,
  }
}

const {
  data: loaded,
  pending: isLoading,
  error: loadError,
} = await useAsyncData(`training-detail-${trainingId}`, load)

watch(
  loaded,
  (data) => {
    if (!data) return
    training.value = data.training
    players.value = data.players
    categories.value = data.categories
    entries.value = data.entries
    photos.value = data.photos
    consentStatus.value = data.consentStatus
    dateInput.value = data.training?.date ?? ''
  },
  { immediate: true },
)

const loadPhotos = async () => {
  photosError.value = null
  try {
    photos.value = await listPhotos(trainingId)
  } catch (err) {
    photosError.value = err instanceof Error ? err.message : 'Fotos konnten nicht geladen werden'
  }
}

const initialEntries = computed(() =>
  entries.value.map((e) => ({
    player_id: e.player_id,
    category_id: e.category_id,
    value: e.value,
  })),
)

const entryByCell = computed(() => {
  const m = new Map<string, PointEntryRow>()
  for (const e of entries.value) m.set(`${e.player_id}:${e.category_id}`, e)
  return m
})

const cellValue = (playerId: string, categoryId: string) =>
  entryByCell.value.get(`${playerId}:${categoryId}`)?.value ?? null

const onSave = async () => {
  if (!training.value) return
  saveError.value = null
  isSaving.value = true
  try {
    training.value = await save(training.value.id)
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Speichern fehlgeschlagen'
  } finally {
    isSaving.value = false
  }
}

const statusLabel = computed(() => (training.value?.status === 'saved' ? 'Gespeichert' : 'Entwurf'))

const isDateChanged = computed(() => !!training.value && dateInput.value !== training.value.date)

const onSaveDate = async () => {
  if (!training.value) return
  dateError.value = null
  const parsed = trainingDateSchema.safeParse(dateInput.value)
  if (!parsed.success) {
    dateError.value = parsed.error.issues[0]?.message ?? 'Ungültiges Datum'
    return
  }
  isSavingDate.value = true
  try {
    training.value = await save(training.value.id, { date: parsed.data })
  } catch (err) {
    dateError.value = err instanceof Error ? err.message : 'Datum konnte nicht gespeichert werden'
  } finally {
    isSavingDate.value = false
  }
}

const onDeleteTraining = async () => {
  if (!training.value) return
  deleteError.value = null
  isDeleting.value = true
  try {
    await deleteTraining(training.value.id)
    isDeleteDialogOpen.value = false
    await navigateTo(`/t/${slug.value}/trainings`)
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : 'Training konnte nicht gelöscht werden'
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <p v-if="isLoading" class="text-neutral-500">Training wird geladen…</p>
  <p v-else-if="loadError" class="text-sm text-red-700" role="alert">
    Training konnte nicht geladen werden: {{ loadError.message }}
  </p>
  <section v-else-if="training" class="space-y-6" data-testid="training-detail-page">
    <header class="space-y-1">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-semibold text-neutral-900">
          {{ training.title || `Training ${formatDate(training.date)}` }}
        </h1>
        <span
          class="text-xs px-2 py-0.5 rounded-full border"
          :class="
            training.status === 'saved'
              ? 'border-green-300 bg-green-50 text-green-800'
              : 'border-neutral-300 bg-neutral-100 text-neutral-700'
          "
          data-testid="training-status-badge"
        >
          {{ statusLabel }}
        </span>
      </div>
      <div v-if="isTrainer && training.status === 'saved'" class="flex items-center gap-2">
        <ShadcnLabel class="flex items-center gap-2 text-sm text-neutral-600">
          <span>Datum</span>
          <ShadcnInput
            v-model="dateInput"
            type="date"
            :max="isoToday"
            data-testid="training-date-input"
          />
        </ShadcnLabel>
        <ShadcnButton
          type="button"
          size="sm"
          variant="outline"
          data-testid="training-date-save-button"
          :disabled="!isDateChanged || isSavingDate"
          @click="onSaveDate"
        >
          {{ isSavingDate ? 'Speichere…' : 'Datum speichern' }}
        </ShadcnButton>
      </div>
      <p v-else class="text-sm text-neutral-600">Datum {{ formatDate(training.date) }}</p>
      <p v-if="dateError" class="text-sm text-red-700" role="alert">{{ dateError }}</p>
      <p class="text-sm text-neutral-600">
        Zuletzt aktualisiert {{ new Date(training.last_updated_at).toLocaleString('de-DE') }}
      </p>
    </header>

    <template v-if="isTrainer">
      <TrainingPointGrid
        :training-id="training.id"
        :slug="slug"
        :players="players"
        :categories="categories"
        :initial-entries="initialEntries"
        @add-player="openPlayerDialog"
        @add-category="openCategoryDialog"
      />
      <p v-if="categoriesError" class="text-sm text-red-700" role="alert">{{ categoriesError }}</p>
      <p v-if="playersError" class="text-sm text-red-700" role="alert">{{ playersError }}</p>

      <ShadcnDialog v-model:open="isCategoryDialogOpen">
        <ShadcnDialogContent>
          <div data-testid="training-category-dialog">
            <ShadcnDialogHeader>
              <ShadcnDialogTitle>Neue Kategorie</ShadcnDialogTitle>
            </ShadcnDialogHeader>
            <CategoryForm
              v-if="trainingTeamId"
              :key="categoryDialogSeq"
              :team-id="trainingTeamId"
              :next-sort-order="nextCategorySortOrder"
              :category="null"
              @saved="onCategorySaved"
            />
          </div>
        </ShadcnDialogContent>
      </ShadcnDialog>

      <ShadcnDialog v-model:open="isPlayerDialogOpen">
        <ShadcnDialogContent>
          <div data-testid="training-player-dialog" class="space-y-4">
            <ShadcnDialogHeader>
              <ShadcnDialogTitle>Neuer Spieler</ShadcnDialogTitle>
            </ShadcnDialogHeader>
            <PlayerForm
              v-if="trainingTeamId"
              ref="playerFormRef"
              :key="playerDialogSeq"
              :team-id="trainingTeamId"
              :player="null"
              @saved="onPlayerSaved"
            />
            <ShadcnDialogFooter>
              <ShadcnDialogClose as-child>
                <ShadcnButton type="button" variant="outline">Schließen</ShadcnButton>
              </ShadcnDialogClose>
              <ShadcnButton
                type="submit"
                form="player-form"
                :disabled="playerFormRef?.loading"
                data-testid="player-form-submit"
              >
                {{ playerFormRef?.loading ? 'Speichere…' : 'Speichern' }}
              </ShadcnButton>
            </ShadcnDialogFooter>
          </div>
        </ShadcnDialogContent>
      </ShadcnDialog>

      <TrainingPhotoUpload
        v-if="teamId"
        :training-id="training.id"
        :team-id="teamId"
        :photos="photos"
        @uploaded="loadPhotos"
      />
      <p v-if="photosError" class="text-sm text-red-700" role="alert">{{ photosError }}</p>

      <button
        v-if="training.status === 'draft'"
        type="button"
        class="min-h-touch px-4 rounded bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40"
        :disabled="!canSave"
        data-testid="training-save-button"
        @click="onSave"
      >
        {{ isSaving ? 'Speichere…' : 'Speichern' }}
      </button>
      <p v-if="saveError" class="text-sm text-red-700" role="alert">{{ saveError }}</p>

      <ShadcnButton
        type="button"
        variant="destructive"
        data-testid="training-delete-button"
        @click="isDeleteDialogOpen = true"
      >
        Training löschen
      </ShadcnButton>

      <ShadcnDialog v-model:open="isDeleteDialogOpen">
        <ShadcnDialogContent>
          <div data-testid="training-delete-dialog" class="space-y-4">
            <ShadcnDialogHeader>
              <ShadcnDialogTitle>Training löschen?</ShadcnDialogTitle>
            </ShadcnDialogHeader>
            <p class="text-sm text-neutral-600">
              Das Training {{ training.title || formatDate(training.date) }} sowie alle zugehörigen
              Punkte und Fotos werden unwiderruflich gelöscht.
            </p>
            <p v-if="deleteError" class="text-sm text-red-700" role="alert">{{ deleteError }}</p>
            <ShadcnDialogFooter>
              <ShadcnDialogClose as-child>
                <ShadcnButton type="button" variant="outline">Abbrechen</ShadcnButton>
              </ShadcnDialogClose>
              <ShadcnButton
                type="button"
                variant="destructive"
                :disabled="isDeleting"
                data-testid="training-delete-confirm-button"
                @click="onDeleteTraining"
              >
                {{ isDeleting ? 'Lösche…' : 'Endgültig löschen' }}
              </ShadcnButton>
            </ShadcnDialogFooter>
          </div>
        </ShadcnDialogContent>
      </ShadcnDialog>
    </template>

    <template v-else>
      <div class="overflow-x-auto rounded border border-neutral-200 bg-white">
        <table class="w-full text-sm border-collapse" data-testid="training-readonly-grid">
          <thead class="bg-neutral-100">
            <tr>
              <th class="border-b border-r border-neutral-200 px-3 py-2 text-left">Spieler:in</th>
              <th
                v-for="c in categories"
                :key="c.id"
                class="border-b border-neutral-200 px-3 py-2 text-left"
              >
                {{ c.name }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in players" :key="p.id">
              <th class="border-b border-r border-neutral-200 px-3 py-2 text-left font-medium">
                {{ p.jersey_number !== null ? `#${p.jersey_number} ` : '' }}{{ p.name }}
              </th>
              <td
                v-for="c in categories"
                :key="c.id"
                class="border-b border-neutral-200 px-3 py-2 text-right"
              >
                {{ cellValue(p.id, c.id) ?? '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <TrainingPhotoGallery :photos="photos" :consent-status="consentStatus" :is-trainer="false" />
    </template>

    <NuxtLink :to="`/t/${slug}/trainings`" class="inline-block text-sm text-neutral-600 underline">
      ← Zur Trainings-Liste
    </NuxtLink>
  </section>
  <p v-else class="text-neutral-500">Training nicht gefunden.</p>
</template>
