<script setup lang="ts">
import { computed, ref } from 'vue'
import { useProfile, type SoleTrainerTeam } from '~/composables/useProfile'
import { errorMessage } from '~/utils/errors'

const { soleTrainerTeams, deleteAccount } = useProfile()
const client = useSupabaseClient()

const isOpen = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const teams = ref<SoleTrainerTeam[]>([])
// team_id -> user_id of the member taking over. Never empty for a team that
// has candidates: the first one is preselected when the dialog opens.
const successors = ref<Record<string, string>>({})

const teamsWithoutCandidates = computed(() => teams.value.filter((t) => t.candidates.length === 0))

const open = async () => {
  error.value = null
  loading.value = true
  try {
    teams.value = await soleTrainerTeams()
    successors.value = Object.fromEntries(
      teams.value
        .filter((team) => team.candidates[0])
        .map((team) => [team.team_id, team.candidates[0]!.user_id]),
    )
    isOpen.value = true
  } catch (err) {
    error.value = errorMessage(err, 'Teams konnten nicht geprüft werden.')
  } finally {
    loading.value = false
  }
}

const confirm = async () => {
  error.value = null
  loading.value = true
  try {
    await deleteAccount({
      handovers: teams.value
        .filter((team) => team.candidates.length > 0)
        .map((team) => ({
          team_id: team.team_id,
          new_trainer_user_id: successors.value[team.team_id]!,
        })),
      delete_team_ids: teamsWithoutCandidates.value.map((team) => team.team_id),
    })
    await client.auth.signOut()
    await navigateTo('/login')
  } catch (err) {
    error.value = errorMessage(err, 'Konto konnte nicht gelöscht werden.')
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-3 rounded-lg border border-destructive/30 p-4" data-testid="account-delete">
    <div class="space-y-1">
      <h2 class="font-semibold text-neutral-900">Konto löschen</h2>
      <p class="text-sm text-muted-foreground">
        Dein Konto wird dauerhaft entfernt. Trainings, Spieler und Punkte deiner Teams bleiben
        erhalten, nur dein Name daran verschwindet.
      </p>
    </div>
    <p v-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>
    <ShadcnButton
      type="button"
      variant="destructive"
      :disabled="loading"
      data-testid="account-delete-open"
      @click="open"
    >
      Konto löschen
    </ShadcnButton>

    <ShadcnDialog v-model:open="isOpen">
      <ShadcnDialogContent>
        <div data-testid="account-delete-dialog" class="space-y-4">
          <ShadcnDialogHeader>
            <ShadcnDialogTitle>Konto wirklich löschen?</ShadcnDialogTitle>
          </ShadcnDialogHeader>

          <p v-if="teams.length === 0" class="text-sm text-neutral-700">
            Das lässt sich nicht rückgängig machen.
          </p>

          <template v-else>
            <p class="text-sm text-neutral-700">
              Du bist alleiniger Trainer. Damit dein Team nicht ohne Trainer zurückbleibt, wird die
              Rolle beim Löschen übergeben.
            </p>
            <div v-for="team in teams" :key="team.team_id" class="space-y-1">
              <template v-if="team.candidates.length > 0">
                <label class="block text-sm font-medium" :for="`successor-${team.team_id}`">
                  Neuer Trainer für {{ team.team_name }}
                </label>
                <select
                  :id="`successor-${team.team_id}`"
                  v-model="successors[team.team_id]"
                  class="min-h-touch w-full rounded-md border border-input bg-background px-2 text-sm"
                  :data-testid="`successor-select-${team.team_id}`"
                >
                  <option v-for="c in team.candidates" :key="c.user_id" :value="c.user_id">
                    {{ c.display_name }}
                  </option>
                </select>
              </template>
              <p v-else class="text-sm text-destructive">
                <strong>{{ team.team_name }}</strong> hat keine weiteren Mitglieder und wird
                zusammen mit deinem Konto gelöscht — samt Spielern, Trainings, Punkten und Fotos.
              </p>
            </div>
          </template>

          <p v-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>

          <ShadcnDialogFooter>
            <ShadcnDialogClose as-child>
              <ShadcnButton type="button" variant="outline" :disabled="loading">
                Abbrechen
              </ShadcnButton>
            </ShadcnDialogClose>
            <ShadcnButton
              type="button"
              variant="destructive"
              :disabled="loading"
              data-testid="account-delete-confirm"
              @click="confirm"
            >
              {{ loading ? 'Lösche…' : 'Endgültig löschen' }}
            </ShadcnButton>
          </ShadcnDialogFooter>
        </div>
      </ShadcnDialogContent>
    </ShadcnDialog>
  </div>
</template>
