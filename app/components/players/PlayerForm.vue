<script setup lang="ts">
import { computed, ref } from 'vue'
import { z } from 'zod'
import { errorMessage, isUniqueViolation } from '~/utils/errors'

const props = defineProps<{
  teamId: string
  player?: {
    id: string
    name: string
    jersey_number: number | null
    position: string | null
    photo_consent: boolean
    active: boolean
    email: string | null
    linked_user_id: string | null
  } | null
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const schema = z.object({
  name: z.string().trim().min(1, 'Name ist erforderlich.'),
  jersey_number: z
    .number()
    .int('Ganzzahl erforderlich.')
    .min(0, 'Trikotnummer darf nicht negativ sein.')
    .nullable(),
  position: z.string().trim().min(1).nullable(),
  photo_consent: z.boolean(),
  active: z.boolean(),
})

const emailSchema = z.string().trim().toLowerCase().email('Bitte gültige E-Mail eingeben.')

const { create, update, requestLinkedEmailChange } = usePlayers()
const { issue } = useInvitations()

const isLinked = computed(() => !!props.player?.linked_user_id)

const name = ref(props.player?.name ?? '')
const jerseyNumber = ref<number | null>(props.player?.jersey_number ?? null)
const position = ref(props.player?.position ?? '')
const consent = ref(props.player?.photo_consent ?? false)
const active = ref(props.player?.active ?? true)
const email = ref(props.player?.email ?? '')
const sendInvite = ref(false)
const fieldErrors = ref<{ name?: string; jersey_number?: string; email?: string }>({})
const submitError = ref<string | null>(null)
const submitNotice = ref<string | null>(null)
const loading = ref(false)

const jerseyNumberModel = useNullableNumberModel(jerseyNumber)

const canInvite = computed(() => !isLinked.value && email.value.trim() !== '')

const submit = async () => {
  fieldErrors.value = {}
  submitError.value = null
  submitNotice.value = null

  const parsed = schema.safeParse({
    name: name.value,
    jersey_number: jerseyNumber.value,
    position: position.value.trim() === '' ? null : position.value.trim(),
    photo_consent: consent.value,
    active: active.value,
  })
  if (!parsed.success) {
    for (const issue_ of parsed.error.issues) {
      const key = issue_.path[0]
      if (key === 'name') fieldErrors.value.name = issue_.message
      if (key === 'jersey_number') fieldErrors.value.jersey_number = issue_.message
    }
    return
  }

  const trimmedEmail = email.value.trim()
  if (isLinked.value && trimmedEmail === '') {
    fieldErrors.value.email = 'E-Mail ist erforderlich, da dieser Spieler bereits verknüpft ist.'
    return
  }
  let emailParsed: string | null = null
  if (trimmedEmail !== '') {
    const parsedEmail = emailSchema.safeParse(trimmedEmail)
    if (!parsedEmail.success) {
      fieldErrors.value.email = parsedEmail.error.issues[0]?.message ?? 'Ungültige E-Mail.'
      return
    }
    emailParsed = parsedEmail.data
  }

  loading.value = true
  try {
    if (isLinked.value) {
      // email is never part of this update — the linked-email guard trigger
      // would reject it, and correcting it goes through the owner-confirmed
      // request below instead.
      await update(props.player!.id, parsed.data)

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
      await update(playerId, { ...parsed.data, email: emailParsed })
    } else {
      const created = await create(props.teamId, { ...parsed.data, email: emailParsed })
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
    if (isUniqueViolation(err)) {
      const message = errorMessage(err, '')
      submitError.value = message.includes('players_email_per_team_uniq')
        ? 'Diese E-Mail ist im Team bereits einem anderen Spieler zugeordnet.'
        : 'Trikotnummer ist im aktiven Kader bereits vergeben. Zuerst den bisherigen Spieler deaktivieren.'
    } else {
      submitError.value = errorMessage(err, 'Spieler konnte nicht gespeichert werden.')
    }
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
