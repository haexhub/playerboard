<script setup lang="ts">
  import { computed } from 'vue'
  import TeamSettingsForm from '~/components/team/TeamSettingsForm.vue'

  definePageMeta({
    middleware: ['trainer-only'],
  })

  const { currentTeam, refresh: refreshTeamContext } = useTeamContext()
  const teamId = computed(() => currentTeam.value?.id ?? '')

  const { get: getSettings } = useTeamSettings()

  const { data: settings } = useAsyncData(
    () => `team-settings-${teamId.value}`,
    async () => {
      if (!teamId.value) return null
      return await getSettings(teamId.value)
    },
    { watch: [teamId] },
  )

  const onSaved = async ({ slug }: { slug: string }) => {
    await refreshTeamContext()
    if (slug !== currentTeam.value?.slug) {
      await navigateTo(`/t/${slug}/team/settings`)
    }
  }
</script>

<template>
  <section class="space-y-8" data-testid="team-settings-page">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-neutral-900">Team-Einstellungen</h1>
      <p class="text-neutral-600">
        Name, Slug und Saisonstart für {{ currentTeam?.name ?? 'Team' }}.
      </p>
    </header>

    <TeamSettingsForm
      v-if="teamId && currentTeam && settings?.team_id === teamId"
      :key="teamId"
      :team-id="teamId"
      :name="currentTeam.name"
      :slug="currentTeam.slug"
      :season-start="settings.season_start"
      @saved="onSaved"
    />
  </section>
</template>
