<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { errorMessage } from '~/utils/errors'
import { useVeoLink } from '~/composables/useVeoLink'

const props = defineProps<{ teamId: string }>()

const { getCurrentMapping, setPublicStatsEnabled } = useVeoLink()

const enabled = ref(false)
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const mapping = await getCurrentMapping(props.teamId)
    enabled.value = mapping?.public_stats_enabled ?? false
  } catch (err) {
    error.value = errorMessage(err, 'Einstellung konnte nicht geladen werden.')
  } finally {
    loading.value = false
  }
})

const onToggle = async (event: Event) => {
  const next = (event.target as HTMLInputElement).checked
  error.value = null
  saving.value = true
  try {
    await setPublicStatsEnabled(props.teamId, next)
    enabled.value = next
  } catch (err) {
    const input = event.target as HTMLInputElement
    input.checked = enabled.value
    error.value = errorMessage(err, 'Einstellung konnte nicht gespeichert werden.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-2" data-testid="veo-public-stats-toggle">
    <label class="inline-flex min-h-touch items-center gap-2">
      <input
        type="checkbox"
        :checked="enabled"
        :disabled="loading || saving"
        data-testid="veo-public-stats-toggle-input"
        class="h-5 w-5"
        @change="onToggle"
      />
      <span>Veo-Saison-Statistiken öffentlich sichtbar machen</span>
    </label>
    <p class="text-sm text-neutral-600">
      Zeigt die aufsummierten Veo-Kennzahlen der Saison, nach Trikotnummer, auf der öffentlichen
      Team-Seite — ohne Namen. Unabhängig von der Veo-Kamera-Verknüpfung oben.
    </p>
    <p v-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>
  </div>
</template>
