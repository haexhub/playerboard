<script setup lang="ts">
import { onMounted } from 'vue'
import { LAST_SLUG_KEY } from '~/composables/useTeams'

definePageMeta({
  middleware: ['team-context'],
})

const route = useRoute()
const slug = String(route.params.slug)

onMounted(() => {
  if (import.meta.client) localStorage.setItem(LAST_SLUG_KEY, slug)
  void navigateTo(`/t/${slug}/dashboard`, { replace: true })
})
</script>

<template>
  <div class="text-center py-16 text-neutral-500">Öffne Team…</div>
</template>
