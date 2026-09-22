<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTrainings, type TrainingRow } from '~/composables/useTrainings'
import { formatDate } from '~/utils/dates'

definePageMeta({
  middleware: ['team-context'],
})

const { currentTeam, isTrainer } = useTeamContext()
const teamId = computed(() => currentTeam.value?.id ?? '')
const slug = computed(() => currentTeam.value?.slug ?? '')

const { list } = useTrainings()
const trainings = ref<TrainingRow[]>([])

const load = async () => {
  if (!teamId.value) return
  trainings.value = await list(teamId.value)
}

await load()

const visible = computed(() =>
  isTrainer.value ? trainings.value : trainings.value.filter((t) => t.status === 'saved'),
)
</script>

<template>
  <section class="space-y-4" data-testid="trainings-index-page">
    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-neutral-900">Trainings</h1>
        <p class="text-sm text-neutral-600">
          {{ isTrainer ? 'Alle Trainings (inkl. Entwürfe)' : 'Gespeicherte Trainings' }}
        </p>
      </div>
      <NuxtLink
        v-if="isTrainer"
        :to="`/t/${slug}/trainings/new`"
        class="min-h-touch inline-flex items-center px-3 rounded bg-neutral-900 text-white text-sm font-semibold"
        data-testid="new-training-cta"
      >
        Neues Training
      </NuxtLink>
    </header>

    <p
      v-if="visible.length === 0"
      class="text-sm text-neutral-500"
      data-testid="trainings-empty-hint"
    >
      Noch kein Training erfasst.
    </p>

    <ul v-else class="divide-y divide-neutral-200 rounded border border-neutral-200 bg-white">
      <li v-for="t in visible" :key="t.id">
        <NuxtLink
          :to="`/t/${slug}/trainings/${t.id}`"
          class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50 min-h-touch"
        >
          <div>
            <p class="font-medium text-neutral-900">
              {{ t.title || `Training ${formatDate(t.date)}` }}
            </p>
            <p class="text-xs text-neutral-500">{{ formatDate(t.date) }}</p>
          </div>
          <span
            class="text-xs px-2 py-0.5 rounded-full border"
            :class="
              t.status === 'saved'
                ? 'border-green-300 bg-green-50 text-green-800'
                : 'border-neutral-300 bg-neutral-100 text-neutral-700'
            "
          >
            {{ t.status === 'saved' ? 'Gespeichert' : 'Entwurf' }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
