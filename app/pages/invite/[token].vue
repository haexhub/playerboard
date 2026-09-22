<script setup lang="ts">
import { ref, watch } from 'vue'
import InvitationAcceptCard from '~/components/auth/InvitationAcceptCard.vue'
import LoginMagicLink from '~/components/auth/LoginMagicLink.vue'
import type { Database } from '~/types/database'

definePageMeta({
  layout: 'onboarding',
})

const route = useRoute()
const token = String(route.params.token)
const user = useSupabaseUser()
const client = useSupabaseClient<Database>()

type Invite = {
  token: string
  role: 'trainer' | 'player'
  team_name: string
  team_slug: string | null
  expires_at: string
  email: string
}

const invite = ref<Invite | null>(null)
const status = ref<'loading' | 'ok' | 'not-found' | 'expired' | 'accepted' | 'not-permitted'>('loading')

const loadForAuthenticatedUser = async () => {
  status.value = 'loading'
  const { data, error } = await client
    .from('invitations')
    .select('token, role, email, expires_at, accepted_at, teams(name, slug)')
    .eq('token', token)
    .maybeSingle()

  if (error || !data) {
    status.value = 'not-found'
    return
  }
  if (data.accepted_at) {
    status.value = 'accepted'
    return
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    status.value = 'expired'
    return
  }
  invite.value = {
    token: data.token,
    role: data.role as 'trainer' | 'player',
    email: data.email,
    expires_at: data.expires_at,
    team_name: data.teams?.name ?? '—',
    team_slug: data.teams?.slug ?? null,
  }
  status.value = 'ok'
}

watch(user, (v) => {
  if (v) void loadForAuthenticatedUser()
}, { immediate: true })
</script>

<template>
  <section class="space-y-6 py-6">
    <template v-if="user">
      <p v-if="status === 'loading'" class="text-sm text-neutral-500">Lade Einladung…</p>
      <div v-else-if="status === 'not-found'" class="rounded border border-red-200 bg-red-50 p-4 text-red-800">
        Einladung nicht gefunden.
      </div>
      <div v-else-if="status === 'expired'" class="rounded border border-amber-200 bg-amber-50 p-4 text-amber-900">
        Diese Einladung ist abgelaufen. Bitte den einladenden Trainer, eine neue zu schicken.
      </div>
      <div v-else-if="status === 'accepted'" class="rounded border border-neutral-200 bg-white p-4 text-neutral-700">
        Diese Einladung wurde bereits angenommen.
      </div>
      <InvitationAcceptCard
        v-else-if="status === 'ok' && invite"
        :invitation="invite"
        :caller-email="user.email ?? null"
      />
    </template>
    <template v-else>
      <header class="space-y-1">
        <h1 class="text-2xl font-semibold text-neutral-900">Einladung annehmen</h1>
        <p class="text-neutral-600">Melde dich an, um deine Einladung zu sehen.</p>
      </header>
      <LoginMagicLink :redirect-to="`/invite/${token}`" />
    </template>
  </section>
</template>
