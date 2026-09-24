<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { usePlayers, type PendingEmailChangeRequest } from '~/composables/usePlayers'
import { errorMessage } from '~/utils/errors'

const { getOwnPendingEmailChangeRequest, confirmLinkedEmailChange } = usePlayers()
const client = useSupabaseClient()

const request = ref<PendingEmailChangeRequest | null>(null)
const loading = ref(false)
const confirmed = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    request.value = await getOwnPendingEmailChangeRequest()
  } catch {
    // Silently skip — the card just doesn't render if the check fails.
  }
})

// Idempotent: re-sends both confirmation mails if clicked again. Kept as its
// own button rather than gated behind a "started" flag, since that flag
// can't survive the owner navigating away to open the confirmation links and
// coming back — this component would simply remount.
const startChange = async () => {
  if (!request.value) return
  error.value = null
  loading.value = true
  try {
    const { error: authErr } = await client.auth.updateUser({ email: request.value.requested_email })
    if (authErr) throw authErr
  } catch (err) {
    error.value = errorMessage(err, 'E-Mail-Änderung konnte nicht gestartet werden.')
  } finally {
    loading.value = false
  }
}

const finishChange = async () => {
  if (!request.value) return
  error.value = null
  loading.value = true
  try {
    await confirmLinkedEmailChange(request.value.player_id, request.value.id)
    confirmed.value = true
    request.value = null
  } catch (err) {
    error.value = errorMessage(
      err,
      'Noch nicht bestätigt. Bitte zuerst beide Links aus den Bestätigungs-E-Mails öffnen.',
    )
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    v-if="request || confirmed"
    class="space-y-3 rounded-lg border p-4"
    data-testid="pending-email-change-card"
  >
    <div v-if="confirmed" class="space-y-1">
      <h2 class="font-semibold text-neutral-900">E-Mail-Adresse aktualisiert</h2>
      <p class="text-sm text-muted-foreground">Deine Login-E-Mail wurde erfolgreich geändert.</p>
    </div>
    <template v-else-if="request">
      <div class="space-y-1">
        <h2 class="font-semibold text-neutral-900">Ausstehende E-Mail-Änderung</h2>
        <p class="text-sm text-muted-foreground">
          Dein Trainer hat angefragt, deine Login-E-Mail auf
          <strong>{{ request.requested_email }}</strong> zu ändern.
        </p>
      </div>
      <p v-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>
      <div class="space-y-2">
        <p class="text-sm text-muted-foreground">
          1. Änderung starten — du bekommst eine Bestätigungs-E-Mail an deine bisherige und an die
          neue Adresse. 2. Beide Links öffnen. 3. Hier auf "Fertig" klicken.
        </p>
        <div class="flex flex-wrap gap-2">
          <ShadcnButton
            type="button"
            variant="outline"
            :disabled="loading"
            data-testid="pending-email-change-start"
            @click="startChange"
          >
            {{ loading ? 'Starte…' : 'Änderung starten' }}
          </ShadcnButton>
          <ShadcnButton
            type="button"
            :disabled="loading"
            data-testid="pending-email-change-finish"
            @click="finishChange"
          >
            {{ loading ? 'Prüfe…' : 'Fertig' }}
          </ShadcnButton>
        </div>
      </div>
    </template>
  </div>
</template>
