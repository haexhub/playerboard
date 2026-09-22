<script setup lang="ts">
import { computed } from 'vue'
import VeoLinkForm from '~/components/veo/VeoLinkForm.vue'

definePageMeta({
  middleware: ['trainer-only'],
})

const { currentTeam } = useTeamContext()
const teamId = computed(() => currentTeam.value?.id ?? '')
</script>

<template>
  <section class="space-y-8" data-testid="veo-link-page">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-neutral-900">Veo-Kamera verknüpfen</h1>
      <p class="text-neutral-600">
        Verknüpfe {{ currentTeam?.name ?? 'dein Team' }} mit deinem Veo-Account, damit Spielergebnisse
        und Statistiken automatisch übernommen werden.
      </p>
    </header>

    <VeoLinkForm v-if="teamId" :key="teamId" :team-id="teamId" />
  </section>
</template>
