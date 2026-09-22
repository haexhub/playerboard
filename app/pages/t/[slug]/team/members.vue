<script setup lang="ts">
import { ref, computed } from 'vue'
import InviteForm from '~/components/team/InviteForm.vue'
import InviteList from '~/components/team/InviteList.vue'
import MembershipTable from '~/components/team/MembershipTable.vue'

definePageMeta({
  middleware: ['trainer-only'],
})

const { currentTeam, isTrainer } = useTeamContext()
const teamId = computed(() => currentTeam.value?.id ?? '')

const inviteList = ref<InstanceType<typeof InviteList> | null>(null)

const onIssued = () => {
  inviteList.value?.reload?.()
}
</script>

<template>
  <section class="space-y-8">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-foreground">{{ currentTeam?.name ?? 'Team' }}</h1>
      <p class="text-muted-foreground">Mitglieder und offene Einladungen verwalten.</p>
    </header>

    <div class="space-y-3">
      <h2 class="text-lg font-semibold text-foreground">Neuen Nutzer einladen</h2>
      <ShadcnCard v-if="teamId">
        <ShadcnCardContent>
          <InviteForm :team-id="teamId" @issued="onIssued" />
        </ShadcnCardContent>
      </ShadcnCard>
    </div>

    <InviteList v-if="teamId" ref="inviteList" :team-id="teamId" />
    <MembershipTable v-if="teamId" :team-id="teamId" :is-trainer="isTrainer" />
  </section>
</template>
