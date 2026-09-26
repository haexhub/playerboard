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

const rowHighlightClass = (rank: number): string => {
  if (rank === 1) return 'bg-ranking-gold/70 hover:bg-ranking-gold/90 font-semibold'
  if (rank === 2) return 'bg-ranking-silver/60 hover:bg-ranking-silver/80 font-semibold'
  if (rank === 3) return 'bg-ranking-bronze/50 hover:bg-ranking-bronze/70 font-semibold'
  return ''
}

const rankBadgeClass = (rank: number): string => {
  if (rank === 1) return 'bg-ranking-gold-badge text-ranking-gold-foreground border-transparent'
  if (rank === 2) return 'bg-ranking-silver-badge text-ranking-silver-foreground border-transparent'
  if (rank === 3) return 'bg-ranking-bronze-badge text-ranking-bronze-foreground border-transparent'
  return ''
}
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
      <ShadcnTableRow
        v-for="(row, i) in rows"
        :key="i"
        :class="rowHighlightClass(row.rank_position)"
        data-testid="public-ranking-row"
      >
        <th scope="row" class="sticky left-0 bg-inherit border-r px-2 py-2 text-left">
          <ShadcnBadge
            :variant="row.rank_position <= 3 ? 'default' : 'secondary'"
            :class="rankBadgeClass(row.rank_position)"
          >
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
