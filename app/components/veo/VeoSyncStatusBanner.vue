<script setup lang="ts">
import { computed } from 'vue'
import type { VeoSyncStatus } from '~/composables/useVeoAnalytics'

const props = defineProps<{ status: VeoSyncStatus | null }>()

// "mehrere Sync-Läufe in Folge" (spec.md User Story 3) — two or more in a row.
const FAILURE_THRESHOLD = 2

const isFailing = computed(() => (props.status?.consecutive_failures ?? 0) >= FAILURE_THRESHOLD)

const lastSuccessLabel = computed(() => {
  const at = props.status?.last_success_at
  if (!at) return null
  return new Date(at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
})
</script>

<template>
  <p
    v-if="isFailing"
    class="rounded bg-red-50 border border-red-200 text-red-900 text-sm p-3"
    role="alert"
    data-testid="veo-sync-status-failing"
  >
    Die automatische Aktualisierung der Veo-Daten funktioniert seit
    {{ status?.consecutive_failures }} Versuchen nicht mehr. Die angezeigten Daten können veraltet
    sein.
    <span v-if="status?.last_error" data-testid="veo-sync-status-error-detail">
      Fehler: {{ status.last_error }}
    </span>
  </p>
  <p v-else-if="lastSuccessLabel" class="text-xs text-neutral-500" data-testid="veo-sync-status-ok">
    Letzter erfolgreicher Sync: {{ lastSuccessLabel }}
  </p>
</template>
