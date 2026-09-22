<script setup lang="ts">
import { computed, ref } from 'vue'
import { errorMessage } from '~/utils/errors'

type Invitation = {
  token: string
  role: 'trainer' | 'player'
  team_name: string
  team_slug: string | null
  expires_at: string
  email: string
}

const props = defineProps<{
  invitation: Invitation
  callerEmail: string | null
}>()

const { accept } = useInvitations()

const loading = ref(false)
const error = ref<string | null>(null)

const emailMismatch = computed(
  () =>
    props.callerEmail !== null &&
    props.callerEmail.toLowerCase() !== props.invitation.email.toLowerCase(),
)

const roleLabel = computed(() => (props.invitation.role === 'trainer' ? 'Trainer' : 'Spieler'))

const expiresLabel = computed(() =>
  new Date(props.invitation.expires_at).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }),
)

const submit = async () => {
  loading.value = true
  error.value = null
  try {
    const res = await accept(props.invitation.token)
    if (res.slug) {
      await navigateTo(`/t/${res.slug}`)
    } else {
      await navigateTo('/')
    }
  } catch (err) {
    error.value = errorMessage(err, 'Einladung konnte nicht angenommen werden.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="rounded border border-neutral-200 bg-white p-5 space-y-4">
    <div class="space-y-1">
      <p class="text-sm text-neutral-500">Einladung in</p>
      <p class="text-xl font-semibold text-neutral-900">{{ invitation.team_name }}</p>
      <p class="text-sm text-neutral-700">
        Rolle: <strong>{{ roleLabel }}</strong>
      </p>
      <p class="text-sm text-neutral-500">Gültig bis {{ expiresLabel }}</p>
    </div>

    <p v-if="emailMismatch" class="rounded bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3">
      Diese Einladung ist an <strong>{{ invitation.email }}</strong> adressiert. Du bist derzeit als
      <strong>{{ callerEmail }}</strong> angemeldet und kannst sie so nicht annehmen. Bitte melde
      dich mit der eingeladenen Adresse an.
    </p>

    <button
      type="button"
      :disabled="loading || emailMismatch"
      class="w-full min-h-touch px-4 rounded bg-neutral-900 text-white font-medium hover:bg-neutral-800 disabled:opacity-50"
      @click="submit"
    >
      {{ loading ? 'Nehme an…' : 'Annehmen' }}
    </button>
    <p v-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>
  </div>
</template>
