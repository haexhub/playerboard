<script setup lang="ts">
import { z } from 'zod'
import type { LinkCandidate } from '~/composables/usePlayers'
import { errorMessage, pgErrorCode } from '~/utils/errors'

type Mode = 'manual' | 'link' | 'invite'

const props = withDefaults(
  defineProps<{
    teamId: string
    player?: {
      id: string
      name: string
      jersey_number: number | null
      position: string | null
      photo_consent: boolean
      active: boolean
    } | null
  }>(),
  { player: null },
)

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

const { create, update, remove, linkUser, listLinkCandidates } = usePlayers()
const { issue } = useInvitations()

const name = ref(props.player?.name ?? '')
const jerseyNumber = ref<number | null>(props.player?.jersey_number ?? null)
const position = ref(props.player?.position ?? '')
const consent = ref(props.player?.photo_consent ?? false)
const active = ref(props.player?.active ?? true)
const fieldErrors = ref<{ name?: string; jersey_number?: string; email?: string }>({})
const submitError = ref<string | null>(null)
const loading = ref(false)
const candidates = ref<LinkCandidate[]>([])
const selectedCandidateId = ref('')
const mode = ref<Mode>('invite')
const inviteEmail = ref('')
const inviteEmailSchema = z.string().trim().toLowerCase().email('Bitte gültige E-Mail eingeben.')

onMounted(async () => {
  if (props.player) return
  try {
    candidates.value = await listLinkCandidates(props.teamId)
  } catch {
    candidates.value = []
  }
})

const onCandidateChange = () => {
  const candidate = candidates.value.find((c) => c.user_id === selectedCandidateId.value)
  if (candidate) name.value = candidate.display_name ?? ''
}

const jerseyNumberModel = useNullableNumberModel(jerseyNumber)

const mapSaveError = (err: unknown) =>
  pgErrorCode(err) === '23505'
    ? 'Trikotnummer ist im aktiven Kader bereits vergeben. Zuerst den bisherigen Spieler deaktivieren.'
    : errorMessage(err, 'Spieler konnte nicht gespeichert werden.')

const submit = async () => {
  fieldErrors.value = {}
  submitError.value = null
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
  let inviteEmailParsed: string | null = null
  if (!props.player && mode.value === 'invite') {
    const parsedEmail = inviteEmailSchema.safeParse(inviteEmail.value)
    if (!parsedEmail.success) {
      fieldErrors.value.email = parsedEmail.error.issues[0]?.message ?? 'Ungültige E-Mail.'
      return
    }
    inviteEmailParsed = parsedEmail.data
  }
  if (
    !props.player &&
    mode.value === 'link' &&
    !candidates.value.some((candidate) => candidate.user_id === selectedCandidateId.value)
  ) {
    submitError.value = 'Bitte zuerst ein bestehendes Konto auswählen.'
    return
  }
  loading.value = true
  let createdPlayerId: string | null = null
  try {
    if (props.player) {
      await update(props.player.id, parsed.data)
    } else {
      const created = await create(props.teamId, parsed.data)
      createdPlayerId = created.id
      if (mode.value === 'link') {
        await linkUser(created.id, selectedCandidateId.value)
      } else if (mode.value === 'invite' && inviteEmailParsed) {
        await issue({
          team_id: props.teamId,
          email: inviteEmailParsed,
          role: 'player',
          player_id: created.id,
        })
      }
    }
    emit('saved')
  } catch (err) {
    if (createdPlayerId) {
      try {
        await remove(createdPlayerId)
      } catch {
        // Keep the original operation error visible; cleanup can be retried manually.
      }
    }
    // SQLSTATE only: a 409 from issue() means a duplicate invitation, not a jersey clash.
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
    <div
      v-if="!player"
      class="flex flex-wrap gap-4 text-sm"
      role="radiogroup"
      aria-label="Konto-Zuordnung"
    >
      <label class="flex items-center gap-1">
        <input v-model="mode" type="radio" class="accent-primary" value="manual" />
        Manuell
      </label>
      <label v-if="candidates.length" class="flex items-center gap-1">
        <input v-model="mode" type="radio" class="accent-primary" value="link" />
        Bestehendes Konto verknüpfen
      </label>
      <label class="flex items-center gap-1">
        <input v-model="mode" type="radio" class="accent-primary" value="invite" />
        Per E-Mail einladen
      </label>
    </div>
    <label v-if="!player && mode === 'link'" class="block">
      <span class="text-sm font-medium text-foreground">Konto</span>
      <select
        v-model="selectedCandidateId"
        data-testid="player-form-candidate-select"
        class="mt-1 w-full min-h-touch px-3 rounded-md border border-input bg-background accent-primary"
        @change="onCandidateChange"
      >
        <option value="">— Konto wählen —</option>
        <option v-for="c in candidates" :key="c.user_id" :value="c.user_id">
          {{ c.display_name ?? c.user_id }}
        </option>
      </select>
    </label>
    <ShadcnLabel v-if="!player && mode === 'invite'" class="block space-y-1">
      <span>E-Mail</span>
      <ShadcnInput v-model="inviteEmail" type="email" data-testid="player-form-invite-email" />
      <span v-if="fieldErrors.email" class="block text-sm text-destructive">{{
        fieldErrors.email
      }}</span>
    </ShadcnLabel>
    <ShadcnLabel class="block space-y-1">
      <span>Name</span>
      <ShadcnInput v-model="name" type="text" required />
      <span v-if="fieldErrors.name" class="block text-sm text-destructive">{{
        fieldErrors.name
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
    <p v-if="submitError" class="text-sm text-destructive" role="alert">{{ submitError }}</p>
  </form>
</template>
