<script setup lang="ts">
import { computed } from 'vue'
import type {
  PublicRanking,
  PublicRankingCategory,
  PublicRankingRow,
} from '~/composables/usePublicRanking'

const props = defineProps<{
  ranking: PublicRanking | null
}>()

const rows = computed<PublicRankingRow[]>(() => props.ranking?.rows ?? [])
const cats = computed<PublicRankingCategory[]>(() => props.ranking?.categories ?? [])

const scoreFor = (row: PublicRankingRow, categoryName: string): number =>
  Number(row.scores?.[categoryName] ?? 0)

const totalFor = (row: PublicRankingRow): number =>
  cats.value.reduce((sum, c) => sum + scoreFor(row, c.name), 0)
</script>

<template>
  <ShadcnTable class="rounded-lg border" data-testid="public-ranking-table">
    <ShadcnTableHeader>
      <ShadcnTableRow class="hover:bg-transparent">
        <ShadcnTableHead class="sticky left-0 bg-card border-r"> # </ShadcnTableHead>
        <ShadcnTableHead>Trikot</ShadcnTableHead>
        <ShadcnTableHead v-for="c in cats" :key="c.name" class="text-right whitespace-nowrap">
          {{ c.name }}
        </ShadcnTableHead>
        <ShadcnTableHead class="text-right">Gesamt</ShadcnTableHead>
      </ShadcnTableRow>
    </ShadcnTableHeader>
    <ShadcnTableBody>
      <ShadcnTableEmpty
        v-if="!rows.length"
        :colspan="cats.length + 3"
        data-testid="public-ranking-empty"
      >
        Keine Punkte im gewählten Zeitraum.
      </ShadcnTableEmpty>
      <ShadcnTableRow v-for="(row, i) in rows" :key="i" data-testid="public-ranking-row">
        <th scope="row" class="sticky left-0 bg-inherit border-r px-2 py-2 text-left">
          <ShadcnBadge :variant="row.rank_position <= 3 ? 'default' : 'secondary'">
            {{ row.rank_position }}
          </ShadcnBadge>
        </th>
        <ShadcnTableCell>
          {{ row.jersey_number !== null ? `#${row.jersey_number}` : '—' }}
        </ShadcnTableCell>
        <ShadcnTableCell v-for="c in cats" :key="c.name" class="text-right tabular-nums">
          {{ scoreFor(row, c.name) }}
        </ShadcnTableCell>
        <ShadcnTableCell class="text-right font-semibold tabular-nums">
          {{ totalFor(row) }}
        </ShadcnTableCell>
      </ShadcnTableRow>
    </ShadcnTableBody>
  </ShadcnTable>
</template>
