<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { z } from 'zod'
import { errorMessage } from '~/utils/errors'
import { useVeoLink, type VeoClubOption } from '~/composables/useVeoLink'

const props = defineProps<{ teamId: string }>()

const emit = defineEmits<{
  (e: 'linked'): void
}>()

const credentialsSchema = z.object({
  email: z.string().trim().email('Bitte gültige E-Mail-Adresse eingeben.'),
  password: z.string().min(1, 'Bitte Passwort eingeben.'),
})

const { getCurrentMapping, login, link } = useVeoLink()

type Step = 'credentials' | 'select' | 'done'
const step = ref<Step>('credentials')

const currentMapping = ref<{ veo_club_slug: string; veo_team_slug: string; enabled: boolean } | null>(null)
onMounted(async () => {
  currentMapping.value = await getCurrentMapping(props.teamId)
})

const email = ref('')
const password = ref('')
const fieldErrors = ref<{ email?: string; password?: string }>({})
const loginError = ref<string | null>(null)
const loginLoading = ref(false)

const clubs = ref<VeoClubOption[]>([])
const linkToken = ref('')
const selectedOption = ref<string>()
const linkError = ref<string | null>(null)
const linkLoading = ref(false)

const teamOptions = computed(() =>
  clubs.value.flatMap((club) =>
    club.teams.map((team) => ({
      value: `${club.club_slug}::${team.team_slug}`,
      clubName: club.club_name,
      teamName: team.team_name,
    })),
  ),
)

const submitCredentials = async () => {
  fieldErrors.value = {}
  loginError.value = null
  const parsed = credentialsSchema.safeParse({ email: email.value, password: password.value })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (key === 'email' || key === 'password') fieldErrors.value[key] = issue.message
    }
    return
  }
  loginLoading.value = true
  try {
    const result = await login({ team_id: props.teamId, ...parsed.data })
    clubs.value = result.clubs
    linkToken.value = result.link_token
    password.value = ''
    step.value = 'select'
  } catch (err) {
    loginError.value = errorMessage(err, 'Login bei Veo fehlgeschlagen.')
  } finally {
    loginLoading.value = false
  }
}

const confirmSelection = async () => {
  linkError.value = null
  if (!selectedOption.value) return
  const [veo_club_slug, veo_team_slug] = selectedOption.value.split('::')
  if (!veo_club_slug || !veo_team_slug) return
  linkLoading.value = true
  try {
    await link({ team_id: props.teamId, veo_club_slug, veo_team_slug, link_token: linkToken.value })
    currentMapping.value = { veo_club_slug, veo_team_slug, enabled: true }
    step.value = 'done'
    emit('linked')
  } catch (err) {
    linkError.value = errorMessage(err, 'Verknüpfung konnte nicht gespeichert werden.')
  } finally {
    linkLoading.value = false
  }
}

const startOver = () => {
  step.value = 'credentials'
  email.value = ''
  clubs.value = []
  linkToken.value = ''
  selectedOption.value = undefined
}
</script>

<template>
  <div class="space-y-6" data-testid="veo-link-form">
    <p v-if="currentMapping" class="text-sm text-neutral-600" data-testid="veo-link-current-status">
      Aktuell verknüpft mit Veo-Team <strong>{{ currentMapping.veo_team_slug }}</strong> (Club
      <strong>{{ currentMapping.veo_club_slug }}</strong
      >).
    </p>

    <form
      v-if="step === 'credentials'"
      class="space-y-4"
      novalidate
      data-testid="veo-link-credentials-form"
      @submit.prevent="submitCredentials"
    >
      <ShadcnLabel class="block space-y-1">
        <span>Veo E-Mail-Adresse</span>
        <ShadcnInput
          v-model="email"
          type="email"
          required
          autocomplete="username"
          data-testid="veo-link-email-input"
        />
        <span v-if="fieldErrors.email" class="block text-sm text-destructive">{{ fieldErrors.email }}</span>
      </ShadcnLabel>
      <ShadcnLabel class="block space-y-1">
        <span>Veo Passwort</span>
        <UiInputPassword
          v-model="password"
          required
          autocomplete="current-password"
          data-testid="veo-link-password-input"
        />
        <span v-if="fieldErrors.password" class="block text-sm text-destructive">{{
          fieldErrors.password
        }}</span>
      </ShadcnLabel>
      <ShadcnButton type="submit" :disabled="loginLoading" data-testid="veo-link-login-submit">
        {{ loginLoading ? 'Melde an…' : 'Bei Veo anmelden' }}
      </ShadcnButton>
      <p v-if="loginError" class="text-sm text-destructive" role="alert">{{ loginError }}</p>
    </form>

    <div v-else-if="step === 'select'" class="space-y-4" data-testid="veo-link-select-step">
      <ShadcnLabel class="block space-y-1">
        <span>Veo-Team auswählen</span>
        <ShadcnSelect v-model="selectedOption">
          <ShadcnSelectTrigger data-testid="veo-link-team-select">
            <ShadcnSelectValue placeholder="Team wählen…" />
          </ShadcnSelectTrigger>
          <ShadcnSelectContent>
            <ShadcnSelectItem
              v-for="option in teamOptions"
              :key="option.value"
              :value="option.value"
              :data-testid="`veo-link-team-option-${option.value}`"
            >
              {{ option.clubName }} — {{ option.teamName }}
            </ShadcnSelectItem>
          </ShadcnSelectContent>
        </ShadcnSelect>
      </ShadcnLabel>
      <div class="flex gap-2">
        <ShadcnButton
          type="button"
          :disabled="!selectedOption || linkLoading"
          data-testid="veo-link-confirm"
          @click="confirmSelection"
        >
          {{ linkLoading ? 'Speichere…' : 'Verknüpfung bestätigen' }}
        </ShadcnButton>
        <ShadcnButton type="button" variant="ghost" @click="startOver">Abbrechen</ShadcnButton>
      </div>
      <p v-if="linkError" class="text-sm text-destructive" role="alert">{{ linkError }}</p>
    </div>

    <div v-else class="space-y-4" data-testid="veo-link-done-step">
      <p class="text-sm text-success">Team erfolgreich mit Veo verknüpft.</p>
      <ShadcnButton type="button" variant="ghost" data-testid="veo-link-relink" @click="startOver">
        Erneut verknüpfen
      </ShadcnButton>
    </div>
  </div>
</template>
