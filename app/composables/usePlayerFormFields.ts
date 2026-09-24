import { computed, ref } from 'vue'
import { z } from 'zod'
import { useNullableNumberModel } from '~/composables/useNumberModel'
import { errorMessage, isUniqueViolation } from '~/utils/errors'

export type PlayerFormPlayer = {
  name: string
  jersey_number: number | null
  position: string | null
  photo_consent: boolean
  active: boolean
  email: string | null
  linked_user_id: string | null
}

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

export type PlayerCoreFields = z.infer<typeof schema>

const emailSchema = z.string().trim().toLowerCase().email('Bitte gültige E-Mail eingeben.')

// Shared by PlayerForm.vue (dialog, explicit submit, supports create) and
// PlayerSettingsForm.vue (detail page, autosave, edit-only): both editors work
// on the same fields and must apply the exact same validation and per-team
// uniqueness rules, so those rules live here once instead of drifting between
// the two call sites' independent save triggers.
export const usePlayerFormFields = (player: PlayerFormPlayer | null) => {
  const isLinked = computed(() => !!player?.linked_user_id)

  const name = ref(player?.name ?? '')
  const jerseyNumber = ref<number | null>(player?.jersey_number ?? null)
  const jerseyNumberModel = useNullableNumberModel(jerseyNumber)
  const position = ref(player?.position ?? '')
  const consent = ref(player?.photo_consent ?? false)
  const active = ref(player?.active ?? true)
  const email = ref(player?.email ?? '')
  const fieldErrors = ref<{ name?: string; jersey_number?: string; email?: string }>({})

  const validate = (): { core: PlayerCoreFields; email: string | null } | null => {
    fieldErrors.value = {}
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
      return null
    }

    const trimmedEmail = email.value.trim()
    if (isLinked.value && trimmedEmail === '') {
      fieldErrors.value.email = 'E-Mail ist erforderlich, da dieser Spieler bereits verknüpft ist.'
      return null
    }
    let emailParsed: string | null = null
    if (trimmedEmail !== '') {
      const parsedEmail = emailSchema.safeParse(trimmedEmail)
      if (!parsedEmail.success) {
        fieldErrors.value.email = parsedEmail.error.issues[0]?.message ?? 'Ungültige E-Mail.'
        return null
      }
      emailParsed = parsedEmail.data
    }

    return { core: parsed.data, email: emailParsed }
  }

  // The player PUT route and the direct create() insert both surface a plain
  // 23505 with no field-level detail beyond the constraint name embedded in
  // the message, so both conflict cases (jersey vs. email) are distinguished
  // the same way regardless of which call raised it.
  const mapSaveError = (err: unknown): string => {
    if (!isUniqueViolation(err))
      return errorMessage(err, 'Spieler konnte nicht gespeichert werden.')
    const message = errorMessage(err, '')
    return message.includes('players_email_per_team_uniq')
      ? 'Diese E-Mail ist im Team bereits einem anderen Spieler zugeordnet.'
      : 'Trikotnummer ist im aktiven Kader bereits vergeben. Zuerst den bisherigen Spieler deaktivieren.'
  }

  return {
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
  }
}
