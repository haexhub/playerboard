<script setup lang="ts">
import { ref, onMounted } from 'vue'
import TeamCreateForm from '~/components/auth/TeamCreateForm.vue'
import InvitationAcceptCard from '~/components/auth/InvitationAcceptCard.vue'

definePageMeta({
  layout: 'onboarding',
})

const user = useSupabaseUser()
const { listMineByEmail } = useInvitations()

type Invite = {
  token: string
  role: 'trainer' | 'player'
  team_name: string
  team_slug: string | null
  expires_at: string
  email: string
}

const invitations = ref<Invite[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const load = async () => {
  loading.value = true
  error.value = null
  try {
    const rows = await listMineByEmail()
    invitations.value = rows.map((r) => ({
      token: r.token,
      role: r.role as 'trainer' | 'player',
      team_name: r.teams?.name ?? '—',
      team_slug: r.teams?.slug ?? null,
      expires_at: r.expires_at,
      email: user.value?.email ?? '',
    }))
  } catch (err) {
    error.value = (err as Error).message || 'Einladungen konnten nicht geladen werden.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="space-y-8 py-6">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-neutral-900">Willkommen</h1>
      <p class="text-neutral-600">Gründe ein neues Team oder nimm eine bestehende Einladung an.</p>
    </header>

    <div class="rounded border border-neutral-200 bg-white p-5 space-y-4">
      <h2 class="text-lg font-semibold text-neutral-900">Team gründen</h2>
      <TeamCreateForm />
    </div>

    <div class="space-y-3">
      <h2 class="text-lg font-semibold text-neutral-900">Einladungen an dich</h2>
      <p v-if="loading" class="text-sm text-neutral-500">Lade…</p>
      <p v-else-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>
      <p v-else-if="invitations.length === 0" class="text-sm text-neutral-500">
        Keine offenen Einladungen für {{ user?.email }}.
      </p>
      <div v-else class="space-y-3">
        <InvitationAcceptCard
          v-for="inv in invitations"
          :key="inv.token"
          :invitation="inv"
          :caller-email="user?.email ?? null"
        />
      </div>
    </div>
  </section>
</template>
