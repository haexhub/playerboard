<script setup lang="ts">
import { ref } from 'vue'
import { z } from 'zod'
import { errorMessage, pgErrorCode } from '~/utils/errors'

const props = defineProps<{
  teamId: string
  defaultRole?: 'trainer' | 'player'
}>()

const emit = defineEmits<{
  (e: 'issued', payload: { id: string }): void
}>()

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Bitte gültige E-Mail eingeben.'),
  role: z.enum(['trainer', 'player']),
})

const { issue } = useInvitations()
const { create, remove } = usePlayers()

const email = ref('')
const role = ref<'trainer' | 'player'>(props.defaultRole ?? 'player')
const playerName = ref('')
const jerseyNumber = ref<number | null>(null)
const position = ref('')
const fieldErrors = ref<{ email?: string; jersey_number?: string }>({})
const submitError = ref<string | null>(null)
const loading = ref(false)

const jerseyNumberModel = useNullableNumberModel(jerseyNumber)

const submit = async () => {
  fieldErrors.value = {}
  submitError.value = null
  const parsed = schema.safeParse({ email: email.value, role: role.value })
  if (!parsed.success) {
    for (const issue_ of parsed.error.issues) {
      if (issue_.path[0] === 'email') fieldErrors.value.email = issue_.message
    }
    return
  }

  // Player-detail fields are optional — filling in a name alongside role
  // "player" creates the roster entry now and auto-links it once accepted.
  // Leaving them blank keeps the old plain-invite behaviour unchanged.
  const wantsPlayerRow = parsed.data.role === 'player' && playerName.value.trim() !== ''
  if (wantsPlayerRow && jerseyNumber.value !== null) {
    if (!Number.isInteger(jerseyNumber.value) || jerseyNumber.value < 0) {
      fieldErrors.value.jersey_number = 'Trikotnummer muss eine nicht-negative Ganzzahl sein.'
      return
    }
  }

  loading.value = true
  let createdPlayerId: string | null = null
  try {
    let player_id: string | undefined
    if (wantsPlayerRow) {
      const created = await create(props.teamId, {
        name: playerName.value.trim(),
        jersey_number: jerseyNumber.value,
        position: position.value.trim() || null,
        photo_consent: false,
        active: true,
      })
      player_id = created.id
      createdPlayerId = created.id
    }
    const res = await issue({
      team_id: props.teamId,
      email: parsed.data.email,
      role: parsed.data.role,
      player_id,
    })
    emit('issued', res)
    email.value = ''
    playerName.value = ''
    jerseyNumber.value = null
    position.value = ''
  } catch (err) {
    if (createdPlayerId) {
      try {
        await remove(createdPlayerId)
      } catch {
        // Keep the original invitation error visible; cleanup can be retried manually.
      }
    }
    // SQLSTATE only: a 409 from issue() means a duplicate invitation, not a jersey clash.
    if (pgErrorCode(err) === '23505') {
      submitError.value =
        'Trikotnummer ist im aktiven Kader bereits vergeben. Zuerst den bisherigen Spieler deaktivieren.'
    } else {
      submitError.value = errorMessage(err, 'Einladung konnte nicht erstellt werden.')
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="space-y-4" novalidate @submit.prevent="submit">
    <div class="flex flex-col sm:flex-row gap-3">
      <ShadcnLabel class="flex-1 block space-y-1">
        <span>E-Mail</span>
        <ShadcnInput v-model="email" type="email" required />
        <span v-if="fieldErrors.email" class="block text-sm text-destructive">{{
          fieldErrors.email
        }}</span>
      </ShadcnLabel>
      <label class="block">
        <span class="text-sm font-medium text-foreground">Rolle</span>
        <select
          v-model="role"
          class="mt-1 w-full min-h-touch px-3 rounded-md border border-input bg-background accent-primary"
        >
          <option value="player">Spieler</option>
          <option value="trainer">Trainer</option>
        </select>
      </label>
    </div>
    <div v-if="role === 'player'" class="space-y-3">
      <ShadcnLabel class="block space-y-1">
        <span>Name (optional)</span>
        <ShadcnInput v-model="playerName" type="text" />
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
    </div>
    <div class="flex items-center justify-end gap-3 border-t pt-4">
      <p v-if="submitError" class="text-sm text-destructive mr-auto" role="alert">
        {{ submitError }}
      </p>
      <ShadcnButton type="submit" :disabled="loading">
        {{ loading ? 'Sende…' : 'Einladen' }}
      </ShadcnButton>
    </div>
  </form>
</template>
