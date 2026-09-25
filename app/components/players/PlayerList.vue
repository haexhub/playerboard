<script setup lang="ts">
import { ref, watch } from 'vue'
import type { LinkCandidate } from '~/composables/usePlayers'
import { errorMessage, isForeignKeyViolation } from '~/utils/errors'

const props = defineProps<{
  teamId: string
  slug: string
}>()

const { list, setActive, setConsent, linkUser, listLinkCandidates, remove } = usePlayers()
const { issue } = useInvitations()

type PlayerRow = Awaited<ReturnType<typeof list>>[number]

const players = ref<PlayerRow[]>([])
const candidates = ref<LinkCandidate[]>([])
const linkSelection = ref<Record<string, string>>({})
const loading = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const pendingActiveUpdates = ref<Record<string, boolean>>({})
let latestLoad = 0

const load = async () => {
  const loadId = ++latestLoad
  const teamId = props.teamId
  loading.value = true
  error.value = null
  players.value = []
  candidates.value = []
  linkSelection.value = {}
  try {
    const rows = await list(teamId)
    if (loadId !== latestLoad || props.teamId !== teamId) return
    players.value = rows
    const nextCandidates = await listLinkCandidates(teamId)
    if (loadId !== latestLoad || props.teamId !== teamId) return
    candidates.value = nextCandidates
  } catch (err) {
    if (loadId === latestLoad) {
      error.value = errorMessage(err, 'Spieler:innen konnten nicht geladen werden.')
    }
  } finally {
    if (loadId === latestLoad) loading.value = false
  }
}

watch(() => props.teamId, load, { immediate: true })

const onToggleConsent = async (row: PlayerRow) => {
  const next = !row.photo_consent
  try {
    await setConsent(row.id, next)
    row.photo_consent = next
  } catch (err) {
    error.value = errorMessage(err, 'Foto-Einwilligung konnte nicht geändert werden.')
  }
}

const onToggleActive = async (row: PlayerRow) => {
  if (pendingActiveUpdates.value[row.id]) return
  const next = !row.active
  pendingActiveUpdates.value[row.id] = true
  try {
    await setActive(row.id, next)
    row.active = next
  } catch (err) {
    error.value = errorMessage(err, 'Status konnte nicht geändert werden.')
  } finally {
    delete pendingActiveUpdates.value[row.id]
  }
}

const onInvite = async (row: PlayerRow) => {
  if (!row.email || row.linked_user_id) return
  error.value = null
  notice.value = null
  try {
    await issue({ team_id: props.teamId, email: row.email, role: 'player', player_id: row.id })
    notice.value = `Einladung an ${row.email} gesendet.`
  } catch (err) {
    error.value = errorMessage(err, 'Einladung konnte nicht verschickt werden.')
  }
}

const onLink = async (row: PlayerRow) => {
  const userId = linkSelection.value[row.id]
  if (!userId) return
  try {
    await linkUser(row.id, userId)
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'Konto konnte nicht verknüpft werden.')
  }
}

const isDeleteDialogOpen = ref(false)
const pendingDelete = ref<PlayerRow | null>(null)
const isDeleting = ref(false)
const deleteError = ref<string | null>(null)

const openDeleteDialog = (row: PlayerRow) => {
  if (isDeleting.value) return
  pendingDelete.value = row
  deleteError.value = null
  isDeleteDialogOpen.value = true
}

const onDelete = async () => {
  if (!pendingDelete.value || isDeleting.value) return
  const playerId = pendingDelete.value.id
  deleteError.value = null
  isDeleting.value = true
  try {
    await remove(playerId)
    players.value = players.value.filter((p) => p.id !== playerId)
    isDeleteDialogOpen.value = false
  } catch (err) {
    deleteError.value = isForeignKeyViolation(err)
      ? 'Spieler:in hat bereits erfasste Punkte und kann nicht gelöscht werden. Bitte stattdessen deaktivieren.'
      : errorMessage(err, 'Spieler:in konnte nicht gelöscht werden.')
  } finally {
    isDeleting.value = false
  }
}

defineExpose({ reload: load })
</script>

<template>
  <div class="space-y-3" data-testid="player-list">
    <h3 class="text-sm font-semibold text-foreground">Spieler:innen</h3>
    <p v-if="notice" class="text-sm text-foreground" role="status">{{ notice }}</p>
    <p v-if="loading" class="text-sm text-muted-foreground">Lade…</p>
    <p v-else-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>
    <p v-else-if="players.length === 0" class="text-sm text-muted-foreground">
      Keine Spieler:innen vorhanden.
    </p>
    <ShadcnTable v-else class="rounded-lg border" data-testid="player-table">
      <ShadcnTableHeader>
        <ShadcnTableRow class="hover:bg-transparent">
          <ShadcnTableHead scope="col">#</ShadcnTableHead>
          <ShadcnTableHead scope="col">Name</ShadcnTableHead>
          <ShadcnTableHead scope="col">Position</ShadcnTableHead>
          <ShadcnTableHead scope="col">Foto-OK</ShadcnTableHead>
          <ShadcnTableHead scope="col">Status</ShadcnTableHead>
          <ShadcnTableHead scope="col">Konto</ShadcnTableHead>
          <ShadcnTableHead scope="col">Aktionen</ShadcnTableHead>
        </ShadcnTableRow>
      </ShadcnTableHeader>
      <ShadcnTableBody>
        <ShadcnTableRow
          v-for="row in players"
          :key="row.id"
          data-testid="player-row"
          :class="{ 'opacity-60': !row.active }"
        >
          <ShadcnTableCell>{{ row.jersey_number ?? '—' }}</ShadcnTableCell>
          <ShadcnTableCell class="font-medium text-foreground">
            <NuxtLink :to="`/t/${slug}/players/${row.id}`" class="underline">
              {{ row.name }}
            </NuxtLink>
          </ShadcnTableCell>
          <ShadcnTableCell class="text-muted-foreground">
            {{ row.position ?? '—' }}
          </ShadcnTableCell>
          <ShadcnTableCell>
            <label class="inline-flex min-h-touch min-w-touch items-center justify-center">
              <input
                type="checkbox"
                :checked="row.photo_consent"
                :aria-label="`Foto-Einwilligung ${row.name}`"
                class="h-5 w-5"
                @change="onToggleConsent(row)"
              />
            </label>
          </ShadcnTableCell>
          <ShadcnTableCell>
            <label class="inline-flex min-h-touch items-center gap-2">
              <input
                type="checkbox"
                :checked="row.active"
                :aria-label="`Status ${row.name}`"
                class="h-5 w-5"
                :disabled="pendingActiveUpdates[row.id]"
                @change="onToggleActive(row)"
              />
              <ShadcnBadge :variant="row.active ? 'default' : 'secondary'">
                {{ row.active ? 'Aktiv' : 'Inaktiv' }}
              </ShadcnBadge>
            </label>
          </ShadcnTableCell>
          <ShadcnTableCell>
            <ShadcnBadge v-if="row.linked_user_id" variant="secondary" data-testid="player-linked">
              Verknüpft
            </ShadcnBadge>
            <div v-else-if="candidates.length" class="flex items-center gap-1">
              <select
                v-model="linkSelection[row.id]"
                :aria-label="`Konto für ${row.name} wählen`"
                class="min-h-touch px-2 rounded-md border border-input bg-background text-xs"
              >
                <option value="">Konto wählen…</option>
                <option v-for="c in candidates" :key="c.user_id" :value="c.user_id">
                  {{ c.display_name ?? c.user_id }}
                </option>
              </select>
              <ShadcnButton
                type="button"
                data-testid="player-link-button"
                variant="outline"
                size="sm"
                @click="onLink(row)"
              >
                Verknüpfen
              </ShadcnButton>
            </div>
            <span v-else class="text-muted-foreground">—</span>
          </ShadcnTableCell>
          <ShadcnTableCell>
            <div class="flex flex-wrap gap-2">
              <ShadcnButton
                type="button"
                data-testid="player-invite-button"
                variant="outline"
                size="sm"
                :disabled="!row.email || !!row.linked_user_id"
                @click="onInvite(row)"
              >
                Einladen
              </ShadcnButton>
              <ShadcnButton
                type="button"
                data-testid="player-delete-button"
                variant="destructive"
                size="sm"
                @click="openDeleteDialog(row)"
              >
                Löschen
              </ShadcnButton>
            </div>
          </ShadcnTableCell>
        </ShadcnTableRow>
      </ShadcnTableBody>
    </ShadcnTable>

    <ShadcnDialog v-model:open="isDeleteDialogOpen">
      <ShadcnDialogContent>
        <div data-testid="player-delete-dialog" class="space-y-4">
          <ShadcnDialogHeader>
            <ShadcnDialogTitle>{{ pendingDelete?.name }} löschen?</ShadcnDialogTitle>
          </ShadcnDialogHeader>
          <p class="text-sm text-muted-foreground">
            {{ pendingDelete?.name }} wird unwiderruflich aus dem Kader entfernt. Das ist nur
            möglich, solange für diese:n Spieler:in noch keine Punkte erfasst wurden.
          </p>
          <p v-if="deleteError" class="text-sm text-destructive" role="alert">{{ deleteError }}</p>
          <ShadcnDialogFooter>
            <ShadcnDialogClose as-child>
              <ShadcnButton type="button" variant="outline" :disabled="isDeleting">
                Abbrechen
              </ShadcnButton>
            </ShadcnDialogClose>
            <ShadcnButton
              type="button"
              variant="destructive"
              :disabled="isDeleting"
              data-testid="player-delete-confirm-button"
              @click="onDelete"
            >
              {{ isDeleting ? 'Lösche…' : 'Endgültig löschen' }}
            </ShadcnButton>
          </ShadcnDialogFooter>
        </div>
      </ShadcnDialogContent>
    </ShadcnDialog>
  </div>
</template>
