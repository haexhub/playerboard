<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { PlayerFormPlayer } from '~/composables/usePlayerFormFields'
import { errorMessage } from '~/utils/errors'

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

const canInvite = computed(() => !isLinked.value && email.value.trim() !== '')
const invitePending = ref(false)
const inviteNotice = ref<string | null>(null)
const inviteError = ref<string | null>(null)

const onInvite = async () => {
  if (!canInvite.value || invitePending.value) return
  invitePending.value = true
  inviteError.value = null
  inviteNotice.value = null
  try {
    if (!(await flushPendingSave())) return
    await issue({
      team_id: props.teamId,
      email: email.value.trim(),
      role: 'player',
      player_id: props.player.id,
    })
    inviteNotice.value = `Einladung an ${email.value.trim()} gesendet.`
  } catch (err) {
    inviteError.value = errorMessage(err, 'Einladung konnte nicht verschickt werden.')
  } finally {
    invitePending.value = false
  }
}

const lastSaved = ref({
  name: props.player.name,
  jersey_number: props.player.jersey_number,
  position: props.player.position,
  photo_consent: props.player.photo_consent,
  active: props.player.active,
})
const lastSavedEmail = ref<string | null>(props.player.email?.trim().toLowerCase() || null)

const doAutoSave = async (): Promise<boolean> => {
  submitNotice.value = null
  const validated = validate()
  if (!validated) return false
  const { core, email: emailParsed } = validated

  const coreChanged = JSON.stringify(core) !== JSON.stringify(lastSaved.value)
  const emailChanged = emailParsed !== lastSavedEmail.value
  if (!coreChanged && !emailChanged) return true

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
    return true
  } catch (err) {
    saveStatus.value = 'error'
    submitError.value = mapSaveError(err)
    return false
  }
}

// doAutoSave is triggered from two independent watchers (debounced text fields,
// immediate checkboxes); serialize runs so a slower call can't resolve after and
// clobber a newer one's saveStatus/lastSaved. A queued rerun re-reads the refs live,
// so it always picks up whatever changed while the in-flight save was running.
let autoSaveRerunQueued = false
let autoSavePromise: Promise<boolean> | null = null

const runAutoSave = (): Promise<boolean> => {
  if (autoSavePromise) {
    autoSaveRerunQueued = true
    return autoSavePromise
  }

  const promise = (async () => {
    let saved: boolean
    do {
      autoSaveRerunQueued = false
      saved = await doAutoSave()
    } while (autoSaveRerunQueued)
    return saved
  })()
  autoSavePromise = promise
  promise.then(
    () => {
      if (autoSavePromise === promise) autoSavePromise = null
    },
    () => {
      if (autoSavePromise === promise) autoSavePromise = null
    },
  )
  return promise
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

const flushPendingSave = async (): Promise<boolean> => {
  // No submit button is rendered; this runs on native Enter submission or
  // before issuing an invitation. Wait for current and queued autosaves.
  debouncedAutoSave.cancel()
  return runAutoSave()
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
    <div class="flex items-center gap-2">
      <ShadcnButton
        type="button"
        variant="outline"
        size="sm"
        data-testid="player-detail-invite-button"
        :disabled="!canInvite || invitePending"
        @click="onInvite"
      >
        Einladen
      </ShadcnButton>
    </div>
    <p v-if="inviteNotice" class="text-sm text-foreground" role="status">{{ inviteNotice }}</p>
    <p v-if="inviteError" class="text-sm text-destructive" role="alert">{{ inviteError }}</p>
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
