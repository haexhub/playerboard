<script setup lang="ts">
import { computed } from 'vue'
import { LAST_SLUG_KEY } from '~/composables/useTeams'

const { memberships, currentSlug } = useTeamContext()

const options = computed(() =>
  (memberships.value ?? [])
    .filter((m) => m.teams)
    .map((m) => ({
      slug: m.teams!.slug,
      name: m.teams!.name,
      role: m.role,
    })),
)

const onChange = async (event: Event) => {
  const target = event.target as HTMLSelectElement
  const slug = target.value
  if (!slug || slug === currentSlug.value) return
  if (import.meta.client) localStorage.setItem(LAST_SLUG_KEY, slug)
  await navigateTo(`/t/${slug}`)
}
</script>

<template>
  <label v-if="options.length > 1" class="text-sm">
    <span class="sr-only">Team wechseln</span>
    <select
      :value="currentSlug ?? ''"
      class="min-h-touch px-2 rounded-md border border-input bg-background text-sm"
      @change="onChange"
    >
      <option v-for="opt in options" :key="opt.slug" :value="opt.slug">
        {{ opt.name }}
      </option>
    </select>
  </label>
  <span v-else-if="options.length === 1" class="text-sm text-muted-foreground truncate">
    {{ options[0]!.name }}
  </span>
</template>
