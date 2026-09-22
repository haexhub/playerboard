<script setup lang="ts">
import { computed } from 'vue'
import type { ActivePlayer } from '~/composables/usePlayers'

const props = defineProps<{ players: ActivePlayer[] }>()

const withoutConsent = computed(() => props.players.filter((p) => !p.photo_consent))

const label = (p: ActivePlayer) => {
  const jersey = p.jersey_number !== null ? `#${p.jersey_number} ` : ''
  return `${jersey}${p.name}`
}
</script>

<template>
  <div
    v-if="withoutConsent.length > 0"
    role="alert"
    class="rounded-md border border-red-300 bg-red-50 text-red-900 px-4 py-3"
    data-testid="consent-warning-banner"
  >
    <p class="font-semibold text-sm mb-1">Foto-Einwilligung fehlt ({{ withoutConsent.length }})</p>
    <p class="text-sm">
      Für folgende aktive Spieler:innen liegt keine Foto-Einwilligung vor. Bitte keine erkennbaren
      Aufnahmen dieser Personen hochladen:
    </p>
    <ul class="mt-2 text-sm list-disc list-inside space-y-0.5">
      <li v-for="p in withoutConsent" :key="p.id">{{ label(p) }}</li>
    </ul>
  </div>
</template>
