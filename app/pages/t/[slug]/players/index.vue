<script setup lang="ts">
import { computed, ref } from 'vue'
import PlayerForm from '~/components/players/PlayerForm.vue'
import PlayerList from '~/components/players/PlayerList.vue'

definePageMeta({
  middleware: ['trainer-only'],
})

const { currentTeam } = useTeamContext()
const teamId = computed(() => currentTeam.value?.id ?? '')

type PlayerRow = {
  id: string
  name: string
  jersey_number: number | null
  position: string | null
  photo_consent: boolean
  active: boolean
  email: string | null
  linked_user_id: string | null
}

const playerList = ref<InstanceType<typeof PlayerList> | null>(null)
const playerFormRef = ref<InstanceType<typeof PlayerForm> | null>(null)
const isPlayerDialogOpen = ref(false)
const editingPlayer = ref<PlayerRow | null>(null)
const dialogSeq = ref(0)

const openCreateDialog = () => {
  editingPlayer.value = null
  dialogSeq.value += 1
  isPlayerDialogOpen.value = true
}

const openEditDialog = (player: PlayerRow) => {
  editingPlayer.value = player
  dialogSeq.value += 1
  isPlayerDialogOpen.value = true
}

const onPlayerSaved = () => {
  isPlayerDialogOpen.value = false
  playerList.value?.reload?.()
}
</script>

<template>
  <section class="space-y-8" data-testid="players-page">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-foreground">Spielerstamm</h1>
      <p class="text-muted-foreground">Kader für {{ currentTeam?.name ?? 'Team' }} verwalten.</p>
    </header>

    <ShadcnButton type="button" data-testid="player-new-button" @click="openCreateDialog">
      Neuer Spieler
    </ShadcnButton>

    <PlayerList v-if="teamId" ref="playerList" :team-id="teamId" @edit="openEditDialog" />

    <ShadcnDialog v-model:open="isPlayerDialogOpen">
      <ShadcnDialogContent>
        <div data-testid="player-dialog" class="space-y-4">
          <ShadcnDialogHeader>
            <ShadcnDialogTitle>
              {{ editingPlayer ? 'Spieler bearbeiten' : 'Neuer Spieler' }}
            </ShadcnDialogTitle>
          </ShadcnDialogHeader>
          <PlayerForm
            v-if="teamId"
            ref="playerFormRef"
            :key="`${dialogSeq}-${editingPlayer?.id ?? 'new'}`"
            :team-id="teamId"
            :player="editingPlayer"
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
  </section>
</template>
