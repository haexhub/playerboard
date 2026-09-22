<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import CategoryForm from '~/components/categories/CategoryForm.vue'
import PlayerForm from '~/components/players/PlayerForm.vue'
import ConsentWarningBanner from '~/components/trainings/ConsentWarningBanner.vue'
import TrainingPhotoUpload from '~/components/trainings/TrainingPhotoUpload.vue'
import TrainingPointGrid from '~/components/trainings/TrainingPointGrid.vue'
import { useCategories, type ActiveCategory } from '~/composables/useCategories'
import { usePlayers, type ActivePlayer } from '~/composables/usePlayers'
import { useTrainings, type TrainingRow } from '~/composables/useTrainings'
import { useTrainingPhotos, type TrainingPhotoView } from '~/composables/useTrainingPhotos'
import { isoDate } from '~/utils/dates'
import { trainingDateSchema } from '~/utils/validators'

definePageMeta({
  middleware: ['team-context', 'trainer-only'],
})

const { currentTeam } = useTeamContext()
const teamId = computed(() => currentTeam.value?.id ?? '')
const slug = computed(() => currentTeam.value?.slug ?? '')

const { listActive: listPlayers } = usePlayers()
const { listActive: listCategories } = useCategories()
const { createDraft, save } = useTrainings()
const { list: listPhotos } = useTrainingPhotos()

const isoToday = isoDate(new Date())

const training = ref<TrainingRow | null>(null)
const players = ref<ActivePlayer[]>([])
const categories = ref<ActiveCategory[]>([])
const saveError = ref<string | null>(null)
const draftError = ref<string | null>(null)
const isSaving = ref(false)
const isCreatingDraft = ref(false)
const title = ref('')
const date = ref(isoToday)

const canSave = computed(() => !!training.value && !isSaving.value)

const isCategoryDialogOpen = ref(false)
const categoryDialogSeq = ref(0)
const nextCategorySortOrder = ref(1)
const categoriesError = ref<string | null>(null)

const openCategoryDialog = () => {
  nextCategorySortOrder.value =
    categories.value.reduce((max, c) => Math.max(max, c.sort_order), 0) + 1
  categoryDialogSeq.value += 1
  isCategoryDialogOpen.value = true
}

const onCategorySaved = async () => {
  isCategoryDialogOpen.value = false
  categoriesError.value = null
  try {
    categories.value = await listCategories(teamId.value)
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
    players.value = await listPlayers(teamId.value)
  } catch (err) {
    playersError.value = err instanceof Error ? err.message : 'Spieler konnten nicht aktualisiert werden'
  }
}

const photos = ref<TrainingPhotoView[]>([])
const photosError = ref<string | null>(null)

const loadPhotos = async () => {
  if (!training.value) return
  photosError.value = null
  try {
    photos.value = await listPhotos(training.value.id)
  } catch (err) {
    photosError.value = err instanceof Error ? err.message : 'Fotos konnten nicht geladen werden'
  }
}

const {
  data: initialData,
  pending: isInitializing,
  error: initError,
} = await useAsyncData(
  'new-training-page-data',
  async () => {
    if (!teamId.value) return { players: [], categories: [] }
    const [ps, cs] = await Promise.all([listPlayers(teamId.value), listCategories(teamId.value)])
    return { players: ps, categories: cs }
  },
  { watch: [teamId], server: false },
)

watch(
  initialData,
  (data) => {
    players.value = data?.players ?? []
    categories.value = data?.categories ?? []
  },
  { immediate: true },
)

const createClientDraft = async () => {
  if (!teamId.value || training.value || isCreatingDraft.value) return
  isCreatingDraft.value = true
  draftError.value = null
  try {
    training.value = await createDraft({
      team_id: teamId.value,
      date: date.value,
      title: title.value || null,
    })
  } catch (err) {
    draftError.value = err instanceof Error ? err.message : 'Training konnte nicht angelegt werden'
  } finally {
    isCreatingDraft.value = false
  }
}

onMounted(() => {
  void createClientDraft()
})

watch(
  teamId,
  () => {
    if (import.meta.client) void createClientDraft()
  },
  { flush: 'post' },
)

const onSave = async () => {
  if (!training.value) return
  saveError.value = null
  const parsedDate = trainingDateSchema.safeParse(date.value)
  if (!parsedDate.success) {
    saveError.value = parsedDate.error.issues[0]?.message ?? 'Ungültiges Datum'
    return
  }
  isSaving.value = true
  try {
    await save(training.value.id, {
      date: date.value,
      title: title.value.trim() || null,
    })
    await navigateTo(`/t/${slug.value}/trainings/${training.value.id}`)
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Speichern fehlgeschlagen'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <section class="space-y-6" data-testid="trainings-new-page">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-foreground">Neues Training</h1>
      <p class="text-muted-foreground">Punkte je Spieler:in und Kategorie erfassen.</p>
    </header>

    <p v-if="isInitializing || isCreatingDraft" class="text-sm text-muted-foreground">
      Training wird vorbereitet…
    </p>
    <p v-if="initError || draftError" class="text-sm text-destructive" role="alert">
      {{ initError?.message ?? draftError }}
    </p>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <ShadcnLabel class="block space-y-1 text-sm">
        <span>Datum</span>
        <ShadcnInput v-model="date" type="date" :max="isoToday" data-testid="training-date-input" />
      </ShadcnLabel>
      <ShadcnLabel class="block space-y-1 text-sm sm:col-span-2">
        <span>Titel (optional)</span>
        <ShadcnInput v-model="title" type="text" placeholder="z. B. Krafttraining" />
      </ShadcnLabel>
    </div>

    <ConsentWarningBanner :players="players" />

    <p v-if="categoriesError" class="text-sm text-destructive" role="alert">{{ categoriesError }}</p>
    <p v-if="playersError" class="text-sm text-destructive" role="alert">{{ playersError }}</p>

    <TrainingPointGrid
      v-if="training"
      :training-id="training.id"
      :slug="slug"
      :players="players"
      :categories="categories"
      @add-player="openPlayerDialog"
      @add-category="openCategoryDialog"
    />

    <ShadcnDialog v-model:open="isCategoryDialogOpen">
      <ShadcnDialogContent>
        <div data-testid="training-category-dialog">
          <ShadcnDialogHeader>
            <ShadcnDialogTitle>Neue Kategorie</ShadcnDialogTitle>
          </ShadcnDialogHeader>
          <CategoryForm
            v-if="teamId"
            :key="categoryDialogSeq"
            :team-id="teamId"
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
            v-if="teamId"
            ref="playerFormRef"
            :key="playerDialogSeq"
            :team-id="teamId"
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
      v-if="training && teamId"
      :training-id="training.id"
      :team-id="teamId"
      :photos="photos"
      @uploaded="loadPhotos"
    />
    <p v-if="photosError" class="text-sm text-destructive" role="alert">{{ photosError }}</p>

    <ShadcnButton :disabled="!canSave" data-testid="training-save-button" @click="onSave">
      {{ isSaving ? 'Speichere…' : 'Speichern' }}
    </ShadcnButton>

    <p v-if="saveError" class="text-sm text-destructive" role="alert">{{ saveError }}</p>
  </section>
</template>
