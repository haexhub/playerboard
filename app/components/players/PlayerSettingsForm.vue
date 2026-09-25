<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { PlayerFormPlayer } from '~/composables/usePlayerFormFields'

const props = defineProps<{
  teamId: string
  player: PlayerFormPlayer & { id: string }
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const { update, requestLinkedEmailChange } = usePlayers()
const { issue } = useInvitations()

const {
  isLinked,
  name,
  jerseyNumber,
  jerseyNumberModel,
  position,
  consent,
  active,
  email,
  fieldErrors,
  validate,
  mapSaveError,
} = usePlayerFormFields(props.player)

const submitError = ref<string | null>(null)
const submitNotice = ref<string | null>(null)
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

const lastSaved = ref({
  name: props.player.name,
  jersey_number: props.player.jersey_number,
  position: props.player.position,
  photo_consent: props.player.photo_consent,
  active: props.player.active,
})
const lastSavedEmail = ref<string | null>(props.player.email?.trim().toLowerCase() || null)

const doAutoSave = async () => {
  submitNotice.value = null
  const validated = validate()
  if (!validated) return
  const { core, email: emailParsed } = validated

  const coreChanged = JSON.stringify(core) !== JSON.stringify(lastSaved.value)
  const emailChanged = emailParsed !== lastSavedEmail.value
  if (!coreChanged && !emailChanged) return

  submitError.value = null
  saveStatus.value = 'saving'
  try {
    let coreSaved = false
    if (isLinked.value) {
      // email is never part of this update — the linked-email guard trigger
      // would reject it, and correcting it goes through the owner-confirmed
      // request below instead.
      if (coreChanged) {
        await update(props.player.id, core)
        lastSaved.value = core
        coreSaved = true
      }
      if (emailChanged) {
        await requestLinkedEmailChange(props.player.id, props.teamId, emailParsed!)
        lastSavedEmail.value = emailParsed
        submitNotice.value =
          'E-Mail-Änderung angefragt – wartet auf Bestätigung durch den Kontoinhaber im eigenen Profil.'
      }
    } else {
      await update(props.player.id, { ...core, email: emailParsed })
      lastSaved.value = core
      lastSavedEmail.value = emailParsed
      coreSaved = true
    }
    // A pending linked-email request alone isn't a completed save — only show
    // "Gespeichert" when something was actually written to the player record.
    saveStatus.value = coreSaved ? 'saved' : 'idle'
    emit('saved')
  } catch (err) {
    saveStatus.value = 'error'
    submitError.value = mapSaveError(err)
  }
}

// doAutoSave is triggered from two independent watchers (debounced text fields,
// immediate checkboxes); serialize runs so a slower call can't resolve after and
// clobber a newer one's saveStatus/lastSaved. A queued rerun re-reads the refs live,
// so it always picks up whatever changed while the in-flight save was running.
let autoSaveInFlight = false
let autoSaveRerunQueued = false

const runAutoSave = async () => {
  if (autoSaveInFlight) {
    autoSaveRerunQueued = true
    return
  }
  autoSaveInFlight = true
  try {
    await doAutoSave()
  } finally {
    autoSaveInFlight = false
    if (autoSaveRerunQueued) {
      autoSaveRerunQueued = false
      void runAutoSave()
    }
  }
}

const debouncedAutoSave = useDebounceFn(runAutoSave, 600)

onBeforeUnmount(() => {
  debouncedAutoSave.cancel()
})

watch([name, jerseyNumber, position, email], () => {
  saveStatus.value = 'idle'
  debouncedAutoSave()
})
watch([consent, active], () => {
  void runAutoSave()
})

const flushPendingSave = async () => {
  // No submit button is rendered; this only runs on native Enter submission.
  // Route it through the same guarded path instead of a second, unguarded save.
  debouncedAutoSave.cancel()
  await runAutoSave()
}

// Ties to lastSavedEmail, not the live email ref, so the button only appears
// once the address is actually persisted — matching the invite route's check
// against the stored players.email (015-unify-player-invite-dialog FR-014).
// Also gated on fieldErrors.email: an invalid unsaved edit fails validate()
// before lastSavedEmail is touched, so without this check the button would
// stay enabled and invite the stale, no-longer-displayed saved address.
const canInvite = computed(
  () => !isLinked.value && !!lastSavedEmail.value && !fieldErrors.value.email,
)
const inviting = ref(false)

const onInvite = async () => {
  if (!canInvite.value || inviting.value) return
  submitError.value = null
  submitNotice.value = null
  inviting.value = true
  try {
    await issue({
      team_id: props.teamId,
      email: lastSavedEmail.value!,
      role: 'player',
      player_id: props.player.id,
    })
    submitNotice.value = `Einladung an ${lastSavedEmail.value} gesendet.`
  } catch (err) {
    submitError.value = errorMessage(err, 'Einladung konnte nicht verschickt werden.')
  } finally {
    inviting.value = false
  }
}
</script>

<template>
  <form
    class="space-y-3"
    novalidate
    data-testid="player-settings-form"
    @submit.prevent="flushPendingSave"
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
      <ShadcnInput v-model="email" type="email" :required="isLinked" />
      <span v-if="fieldErrors.email" class="block text-sm text-destructive">{{
        fieldErrors.email
      }}</span>
    </ShadcnLabel>
    <ShadcnButton
      v-if="!isLinked"
      type="button"
      variant="outline"
      size="sm"
      data-testid="player-settings-invite-button"
      :disabled="!canInvite || inviting"
      @click="onInvite"
    >
      {{ inviting ? 'Sendet…' : 'Einladen' }}
    </ShadcnButton>
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
    <p v-if="submitNotice" class="text-sm text-foreground" role="status">{{ submitNotice }}</p>
    <p v-if="submitError" class="text-sm text-destructive" role="alert">{{ submitError }}</p>
    <p
      v-if="saveStatus !== 'idle' && saveStatus !== 'error'"
      class="text-sm text-neutral-500"
      aria-live="polite"
      data-testid="player-form-save-status"
    >
      {{ saveStatus === 'saving' ? 'Speichert…' : 'Gespeichert' }}
    </p>
  </form>
</template>
