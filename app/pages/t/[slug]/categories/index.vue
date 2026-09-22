<script setup lang="ts">
import { computed, ref } from 'vue'
import CategoryForm from '~/components/categories/CategoryForm.vue'
import CategoryList from '~/components/categories/CategoryList.vue'

definePageMeta({
  middleware: ['trainer-only'],
})

const { currentTeam } = useTeamContext()
const teamId = computed(() => currentTeam.value?.id ?? '')

type Cat = {
  id: string
  name: string
  value_min: number
  value_max: number
  sort_order: number
  active: boolean
}

const categoryList = ref<InstanceType<typeof CategoryList> | null>(null)
const isDialogOpen = ref(false)
const nextSortOrder = ref(1)
const editingCategory = ref<Cat | null>(null)
const dialogSeq = ref(0)

const openCreateDialog = () => {
  editingCategory.value = null
  nextSortOrder.value = (categoryList.value?.maxSortOrder() ?? 0) + 1
  dialogSeq.value += 1
  isDialogOpen.value = true
}

const openEditDialog = (category: Cat) => {
  editingCategory.value = category
  dialogSeq.value += 1
  isDialogOpen.value = true
}

const onSaved = () => {
  isDialogOpen.value = false
  categoryList.value?.reload?.()
}
</script>

<template>
  <section class="space-y-8" data-testid="categories-page">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold text-foreground">Punktekategorien</h1>
      <p class="text-muted-foreground">
        Kategorien für {{ currentTeam?.name ?? 'Team' }} verwalten.
      </p>
    </header>

    <ShadcnButton type="button" data-testid="category-new-button" @click="openCreateDialog">
      Neue Kategorie
    </ShadcnButton>

    <CategoryList v-if="teamId" ref="categoryList" :team-id="teamId" @edit="openEditDialog" />

    <ShadcnDialog v-model:open="isDialogOpen">
      <ShadcnDialogContent>
        <div data-testid="category-dialog">
          <ShadcnDialogHeader>
            <ShadcnDialogTitle>
              {{ editingCategory ? 'Kategorie bearbeiten' : 'Neue Kategorie' }}
            </ShadcnDialogTitle>
          </ShadcnDialogHeader>
          <CategoryForm
            v-if="teamId"
            :key="`${dialogSeq}-${editingCategory?.id ?? 'new'}`"
            :team-id="teamId"
            :next-sort-order="nextSortOrder"
            :category="editingCategory"
            @saved="onSaved"
          />
        </div>
      </ShadcnDialogContent>
    </ShadcnDialog>
  </section>
</template>
