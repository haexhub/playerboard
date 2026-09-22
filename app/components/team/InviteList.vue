<script setup lang="ts">
import { ref, watch } from 'vue'
import { errorMessage } from '~/utils/errors'

const props = defineProps<{
  teamId: string
}>()

const { listOpenByTeam, revoke } = useInvitations()

type Invite = Awaited<ReturnType<typeof listOpenByTeam>>[number]

const invitations = ref<Invite[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const load = async () => {
  loading.value = true
  error.value = null
  try {
    invitations.value = await listOpenByTeam(props.teamId)
  } catch (err) {
    error.value = errorMessage(err, 'Einladungen konnten nicht geladen werden.')
  } finally {
    loading.value = false
  }
}

watch(() => props.teamId, load, { immediate: true })

const remove = async (id: string) => {
  try {
    await revoke(id)
    invitations.value = invitations.value.filter((i) => i.id !== id)
  } catch (err) {
    error.value = errorMessage(err, 'Einladung konnte nicht widerrufen werden.')
  }
}

defineExpose({ reload: load })
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-sm font-semibold text-foreground">Offene Einladungen</h3>
    <p v-if="loading" class="text-sm text-muted-foreground">Lade…</p>
    <p v-else-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>
    <p v-else-if="invitations.length === 0" class="text-sm text-muted-foreground">
      Keine offenen Einladungen.
    </p>
    <ul v-else class="space-y-2">
      <li v-for="inv in invitations" :key="inv.id">
        <ShadcnCard class="py-3">
          <ShadcnCardContent class="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between px-3">
            <div class="text-sm">
              <p class="font-medium text-foreground">{{ inv.email }}</p>
              <p class="text-muted-foreground">
                Rolle: {{ inv.role === 'trainer' ? 'Trainer' : 'Spieler' }} · gültig bis
                {{ new Date(inv.expires_at).toLocaleDateString('de-DE') }}
              </p>
            </div>
            <ShadcnButton type="button" variant="destructive" size="sm" @click="remove(inv.id)">
              Widerrufen
            </ShadcnButton>
          </ShadcnCardContent>
        </ShadcnCard>
      </li>
    </ul>
  </div>
</template>
