<script setup lang="ts">
import { ref } from 'vue'
import { z } from 'zod'
import { errorMessage, isUniqueViolation } from '~/utils/errors'

const props = defineProps<{
  teamId: string
  nextSortOrder: number
  category?: {
    id: string
    name: string
    value_min: number
    value_max: number
    sort_order: number
    active: boolean
  } | null
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v)

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name ist erforderlich.'),
    value_min: z.preprocess(
      emptyToUndefined,
      z.coerce.number({ error: 'Wert erforderlich.' }).int('Ganzzahl erforderlich.'),
    ),
    value_max: z.preprocess(
      emptyToUndefined,
      z.coerce.number({ error: 'Wert erforderlich.' }).int('Ganzzahl erforderlich.'),
    ),
    sort_order: z.preprocess(
      emptyToUndefined,
      z.coerce
        .number({ error: 'Wert erforderlich.' })
        .int('Ganzzahl erforderlich.')
        .min(1, 'Reihenfolge muss ≥ 1 sein.'),
    ),
    active: z.boolean(),
  })
  .refine((data) => data.value_max >= data.value_min, {
    message: 'Maximalwert muss ≥ Minimalwert sein.',
    path: ['value_max'],
  })

const { create, update } = useCategories()

const name = ref(props.category?.name ?? '')
const valueMin = ref<number | ''>(props.category?.value_min ?? 0)
const valueMax = ref<number | ''>(props.category?.value_max ?? 5)
const sortOrder = ref<number | ''>(props.category?.sort_order ?? props.nextSortOrder)
const active = ref(props.category?.active ?? true)
const fieldErrors = ref<{
  name?: string
  value_min?: string
  value_max?: string
  sort_order?: string
}>({})
const submitError = ref<string | null>(null)
const loading = ref(false)

const valueMinModel = useNumberModel(valueMin)
const valueMaxModel = useNumberModel(valueMax)
const sortOrderModel = useNumberModel(sortOrder)

const submit = async () => {
  fieldErrors.value = {}
  submitError.value = null
  const parsed = schema.safeParse({
    name: name.value,
    value_min: valueMin.value,
    value_max: valueMax.value,
    sort_order: sortOrder.value,
    active: active.value,
  })
  if (!parsed.success) {
    for (const issue_ of parsed.error.issues) {
      const key = issue_.path[0]
      if (key === 'name') fieldErrors.value.name = issue_.message
      if (key === 'value_min') fieldErrors.value.value_min = issue_.message
      if (key === 'value_max') fieldErrors.value.value_max = issue_.message
      if (key === 'sort_order') fieldErrors.value.sort_order = issue_.message
    }
    return
  }
  loading.value = true
  try {
    if (props.category) {
      await update(props.category.id, parsed.data)
    } else {
      await create(props.teamId, parsed.data)
    }
    emit('saved')
  } catch (err) {
    if (isUniqueViolation(err)) {
      submitError.value = 'Eine Kategorie mit diesem Namen existiert in diesem Team bereits.'
    } else {
      submitError.value = errorMessage(err, 'Kategorie konnte nicht gespeichert werden.')
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="space-y-3" novalidate data-testid="category-form" @submit.prevent="submit">
    <ShadcnLabel class="block space-y-1">
      <span>Name</span>
      <ShadcnInput v-model="name" type="text" required />
      <span v-if="fieldErrors.name" class="block text-sm text-destructive">{{
        fieldErrors.name
      }}</span>
    </ShadcnLabel>
    <div class="flex gap-3">
      <ShadcnLabel class="flex-1 block space-y-1">
        <span>Min</span>
        <ShadcnInput v-model="valueMinModel" type="number" required />
        <span v-if="fieldErrors.value_min" class="block text-sm text-destructive">{{
          fieldErrors.value_min
        }}</span>
      </ShadcnLabel>
      <ShadcnLabel class="flex-1 block space-y-1">
        <span>Max</span>
        <ShadcnInput v-model="valueMaxModel" type="number" required />
        <span v-if="fieldErrors.value_max" class="block text-sm text-destructive">{{
          fieldErrors.value_max
        }}</span>
      </ShadcnLabel>
    </div>
    <ShadcnLabel class="block space-y-1">
      <span>Reihenfolge</span>
      <ShadcnInput v-model="sortOrderModel" type="number" min="1" required />
      <span v-if="fieldErrors.sort_order" class="block text-sm text-destructive">{{
        fieldErrors.sort_order
      }}</span>
    </ShadcnLabel>
    <label class="flex items-center gap-2">
      <ShadcnCheckbox v-model="active" class="min-w-touch" />
      <span class="text-sm font-medium text-foreground">Aktiv</span>
    </label>
    <ShadcnButton type="submit" :disabled="loading" data-testid="category-form-submit">
      {{ loading ? 'Speichere…' : 'Speichern' }}
    </ShadcnButton>
    <p v-if="submitError" class="text-sm text-destructive" role="alert">{{ submitError }}</p>
  </form>
</template>
