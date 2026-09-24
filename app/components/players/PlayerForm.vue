<script setup lang="ts">
import { computed, ref } from 'vue'
import { errorMessage } from '~/utils/errors'
import type { PlayerFormPlayer } from '~/composables/usePlayerFormFields'

const props = withDefaults(
  defineProps<{
    teamId: string
    player?: (PlayerFormPlayer & { id: string }) | null
  }>(),
  { player: null },
)

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { create, update, requestLinkedEmailChange } = usePlayers()
const { issue } = useInvitations()

const {
  isLinked,
  name,
  jerseyNumberModel,
  position,
  consent,
  active,
  email,
  fieldErrors,
  validate,
  mapSaveError,
} = usePlayerFormFields(props.player ?? null)

const sendInvite = ref(false)
const submitError = ref<string | null>(null)
const submitNotice = ref<string | null>(null)
const loading = ref(false)

const canInvite = computed(() => !isLinked.value && email.value.trim() !== '')

const submit = async () => {
  submitError.value = null
  submitNotice.value = null

  const validated = validate()
  if (!validated) return
  const { core, email: emailParsed } = validated

  loading.value = true
  try {
    if (isLinked.value) {
      // email is never part of this update — the linked-email guard trigger
      // would reject it, and correcting it goes through the owner-confirmed
      // request below instead.
      await update(props.player!.id, core)

      const currentEmail = (props.player!.email ?? '').toLowerCase()
      if (emailParsed !== currentEmail) {
        try {
          await requestLinkedEmailChange(props.player!.id, props.teamId, emailParsed!)
          submitNotice.value =
            'E-Mail-Änderung angefragt – wartet auf Bestätigung durch den Kontoinhaber im eigenen Profil.'
          return
        } catch (err) {
          submitError.value = errorMessage(err, 'E-Mail-Änderung konnte nicht angefragt werden.')
          return
        }
      }
      emit('saved')
      return
    }

    let playerId: string
    if (props.player) {
      playerId = props.player.id
      await update(playerId, { ...core, email: emailParsed })
    } else {
      const created = await create(props.teamId, { ...core, email: emailParsed })
      playerId = created.id
    }

    if (sendInvite.value && emailParsed) {
      try {
        await issue({
          team_id: props.teamId,
          email: emailParsed,
          role: 'player',
          player_id: playerId,
        })
      } catch (err) {
        submitError.value = errorMessage(err, 'Einladung konnte nicht verschickt werden.')
        return
      }
    }

    emit('saved')
  } catch (err) {
    submitError.value = mapSaveError(err)
  } finally {
    loading.value = false
  }
}

defineExpose({ loading })
</script>

<template>
  <form
    id="player-form"
    class="space-y-3"
    novalidate
    data-testid="player-form"
    @submit.prevent="submit"
  >
    <ShadcnLabel class="block space-y-1">
      <span>Name</span>
      <ShadcnInput v-model="name" type="text" required />
      <span v-if="fieldErrors.name" class="block text-sm text-destructive">{{
        fieldErrors.name
      }}</span>
    </ShadcnLabel>
    <ShadcnLabel class="block space-y-1">
      <span>E-Mail{{ isLinked ? '' : ' (optional)' }}</span>
      <ShadcnInput
        v-model="email"
        type="email"
        data-testid="player-form-email"
        :required="isLinked"
      />
      <span v-if="fieldErrors.email" class="block text-sm text-destructive">{{
        fieldErrors.email
      }}</span>
    </ShadcnLabel>
    <div class="flex gap-3">
      <ShadcnLabel class="flex-1 block space-y-1">
        <span>Trikotnummer (optional)</span>
        <ShadcnInput v-model="jerseyNumberModel" type="number" min="0" />
        <span v-if="fieldErrors.jersey_number" class="block text-sm text-destructive">{{
          fieldErrors.jersey_number
        }}</span>
      </ShadcnLabel>
      <ShadcnLabel class="flex-1 block space-y-1">
        <span>Position (optional)</span>
        <ShadcnInput v-model="position" type="text" />
      </ShadcnLabel>
    </div>
    <label class="flex items-center gap-2">
      <ShadcnCheckbox v-model="consent" class="min-w-touch" />
      <span class="text-sm font-medium text-foreground">Foto-Einwilligung</span>
    </label>
    <label class="flex items-center gap-2">
      <ShadcnCheckbox v-model="active" class="min-w-touch" />
      <span class="text-sm font-medium text-foreground">Aktiv im Kader</span>
    </label>
    <label v-if="!isLinked" class="flex items-center gap-2">
      <ShadcnCheckbox
        v-model="sendInvite"
        class="min-w-touch"
        :disabled="!canInvite"
        data-testid="player-form-send-invite"
      />
      <span class="text-sm font-medium text-foreground">Direkt einladen</span>
    </label>
    <p v-if="submitNotice" class="text-sm text-foreground" role="status">{{ submitNotice }}</p>
    <p v-if="submitError" class="text-sm text-destructive" role="alert">{{ submitError }}</p>
  </form>
</template>
