<script setup lang="ts">
import { ref } from 'vue'
import { z } from 'zod'
import { errorMessage, isUniqueViolation } from '~/utils/errors'

const schema = z.object({
  name: z.string().trim().min(1, 'Bitte Team-Name eingeben.').max(80),
  slug: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9-]*$/, 'Nur Kleinbuchstaben, Ziffern und Bindestriche.')
    .optional()
    .transform((v) => (v ? v : undefined)),
})

const { createTeam } = useTeams()

const name = ref('')
const slug = ref('')
const fieldErrors = ref<{ name?: string; slug?: string }>({})
const submitError = ref<string | null>(null)
const loading = ref(false)

const submit = async () => {
  fieldErrors.value = {}
  submitError.value = null
  const parsed = schema.safeParse({ name: name.value, slug: slug.value })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (key === 'name' || key === 'slug') {
        fieldErrors.value[key] = issue.message
      }
    }
    return
  }
  loading.value = true
  try {
    const res = await createTeam(parsed.data)
    await navigateTo(`/t/${res.slug}`)
  } catch (err) {
    if (isUniqueViolation(err)) {
      fieldErrors.value.slug = 'Dieser Slug ist bereits vergeben.'
    } else {
      submitError.value = errorMessage(err, 'Team konnte nicht angelegt werden.')
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="space-y-4" novalidate @submit.prevent="submit">
    <ShadcnLabel class="block space-y-1">
      <span>Team-Name</span>
      <ShadcnInput v-model="name" type="text" required maxlength="80" />
      <span v-if="fieldErrors.name" class="block text-sm text-destructive">{{
        fieldErrors.name
      }}</span>
    </ShadcnLabel>
    <ShadcnLabel class="block space-y-1">
      <span>Slug <span class="text-muted-foreground font-normal">(optional)</span></span>
      <ShadcnInput
        v-model="slug"
        type="text"
        maxlength="64"
        placeholder="wird aus dem Namen abgeleitet"
      />
      <span v-if="fieldErrors.slug" class="block text-sm text-destructive">{{
        fieldErrors.slug
      }}</span>
    </ShadcnLabel>
    <ShadcnButton type="submit" :disabled="loading" class="w-full">
      {{ loading ? 'Lege an…' : 'Team gründen' }}
    </ShadcnButton>
    <p v-if="submitError" class="text-sm text-destructive" role="alert">{{ submitError }}</p>
  </form>
</template>
