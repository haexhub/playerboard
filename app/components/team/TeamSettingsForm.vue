<script setup lang="ts">
import { ref } from 'vue'
import { z } from 'zod'
import { errorMessage, isUniqueViolation } from '~/utils/errors'

const props = defineProps<{
  teamId: string
  name: string
  slug: string
  seasonStart: string
}>()

const emit = defineEmits<{
  (e: 'saved', payload: { slug: string }): void
}>()

const schema = z.object({
  name: z.string().trim().min(1, 'Bitte Team-Name eingeben.').max(80),
  slug: z
    .string()
    .trim()
    .min(1, 'Bitte Slug eingeben.')
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Nur Kleinbuchstaben, Ziffern und Bindestriche.'),
  season_start: z.string().min(1, 'Bitte Saisonstart wählen.'),
})

const { updateWithSettings } = useTeams()

const name = ref(props.name)
const slug = ref(props.slug)
const seasonStart = ref(props.seasonStart)
const fieldErrors = ref<{ name?: string; slug?: string; season_start?: string }>({})
const submitError = ref<string | null>(null)
const loading = ref(false)

const submit = async () => {
  fieldErrors.value = {}
  submitError.value = null
  const parsed = schema.safeParse({
    name: name.value,
    slug: slug.value,
    season_start: seasonStart.value,
  })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (key === 'name' || key === 'slug' || key === 'season_start') {
        fieldErrors.value[key] = issue.message
      }
    }
    return
  }
  loading.value = true
  try {
    await updateWithSettings(props.teamId, parsed.data)
    emit('saved', { slug: parsed.data.slug })
  } catch (err) {
    if (isUniqueViolation(err)) {
      fieldErrors.value.slug = 'Dieser Slug ist bereits vergeben.'
    } else {
      submitError.value = errorMessage(err, 'Einstellungen konnten nicht gespeichert werden.')
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="space-y-4" novalidate data-testid="team-settings-form" @submit.prevent="submit">
    <ShadcnLabel class="block space-y-1">
      <span>Team-Name</span>
      <ShadcnInput
        v-model="name"
        type="text"
        required
        maxlength="80"
        data-testid="team-settings-name-input"
      />
      <span v-if="fieldErrors.name" class="block text-sm text-destructive">{{ fieldErrors.name }}</span>
    </ShadcnLabel>
    <ShadcnLabel class="block space-y-1">
      <span>Slug</span>
      <ShadcnInput
        v-model="slug"
        type="text"
        required
        maxlength="64"
        data-testid="team-settings-slug-input"
      />
      <span v-if="fieldErrors.slug" class="block text-sm text-destructive">{{ fieldErrors.slug }}</span>
      <p class="text-sm text-warning">
        Achtung: Öffentliche Links (z. B. die Rangliste) und Lesezeichen verweisen auf den
        aktuellen Slug. Eine Änderung macht alte Links ungültig.
      </p>
    </ShadcnLabel>
    <ShadcnLabel class="block space-y-1">
      <span>Saisonstart</span>
      <ShadcnInput
        v-model="seasonStart"
        type="date"
        required
        data-testid="team-settings-season-start-input"
      />
      <span v-if="fieldErrors.season_start" class="block text-sm text-destructive">{{
        fieldErrors.season_start
      }}</span>
    </ShadcnLabel>
    <ShadcnButton type="submit" :disabled="loading" data-testid="team-settings-submit">
      {{ loading ? 'Speichere…' : 'Speichern' }}
    </ShadcnButton>
    <p v-if="submitError" class="text-sm text-destructive" role="alert">{{ submitError }}</p>
  </form>
</template>
