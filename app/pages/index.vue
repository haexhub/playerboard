<script setup lang="ts">
import { ref } from 'vue'

// T041: role-aware landing.
// - session + memberships → /t/<lastSlug or first>
// - session + no memberships → /start
// - no session → /login (handled by auth.global)

const user = useSupabaseUser()
const error = ref<string | null>(null)

if (import.meta.client && user.value) {
  const { resolveLandingPath } = useTeams()
  let target: string | null = null
  try {
    target = await resolveLandingPath()
  } catch {
    error.value = 'Teams konnten nicht geladen werden. Bitte lade die Seite neu.'
  }
  if (target) await navigateTo(target)
}
</script>

<template>
  <p v-if="error" class="text-center py-16 text-red-700" role="alert">{{ error }}</p>
  <div v-else class="text-center py-16 text-neutral-500">Weiterleitung…</div>
</template>
