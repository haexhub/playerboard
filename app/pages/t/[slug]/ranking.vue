<script setup lang="ts">
import { computed } from 'vue'
import RankingTable from '~/components/stats/RankingTable.vue'
import TimeframePicker from '~/components/stats/TimeframePicker.vue'
import { useTimeframedRanking } from '~/composables/useRanking'

definePageMeta({
  middleware: ['team-context'],
})

const { currentTeam, currentSlug } = useTeamContext()
const teamId = computed(() => currentTeam.value?.id ?? '')
const slug = computed(() => currentSlug.value ?? '')

const { timeframe, seasonStart, ranking, isLoading, loadError } = await useTimeframedRanking(
  teamId,
  slug,
)
</script>

<template>
  <section class="space-y-6" data-testid="ranking-page">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-neutral-900">Rangliste</h1>
      <p class="text-sm text-neutral-600">
        Punkte je Spieler:in und Kategorie über den gewählten Zeitraum.
      </p>
    </header>

    <TimeframePicker
      :preset="timeframe.preset.value"
      :range="timeframe.range.value"
      :custom-from="timeframe.customFrom.value"
      :custom-to="timeframe.customTo.value"
      :season-available="!!seasonStart"
      @update:preset="timeframe.setPreset"
      @update:custom="(v) => timeframe.setCustom(v.from, v.to)"
    />

    <p v-if="isLoading" class="text-sm text-neutral-500">Lade Rangliste…</p>
    <p v-else-if="loadError" class="text-sm text-red-700" role="alert">{{ loadError }}</p>
    <RankingTable v-else :ranking="ranking" :slug="slug" :link-players="true" />
  </section>
</template>
