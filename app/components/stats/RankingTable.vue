<script setup lang="ts">
import { computed } from 'vue'
import type { RankingCategory, RankingRow, TeamRanking } from '~/composables/useRanking'

const props = defineProps<{
  ranking: TeamRanking | null
  slug: string
  highlightPlayerId?: string | null
  linkPlayers?: boolean
}>()

const rows = computed<RankingRow[]>(() => props.ranking?.rows ?? [])
const cats = computed<RankingCategory[]>(() => props.ranking?.categories ?? [])

const scoreFor = (row: RankingRow, catId: string): number => Number(row.scores?.[catId] ?? 0)

const totalFor = (row: RankingRow): number =>
  cats.value.reduce((sum, c) => sum + scoreFor(row, c.id), 0)
</script>

<template>
  <ShadcnTable class="rounded-lg border" data-testid="ranking-table">
    <ShadcnTableHeader>
      <ShadcnTableRow class="hover:bg-transparent">
        <ShadcnTableHead class="sticky left-0 bg-card border-r"> # </ShadcnTableHead>
        <ShadcnTableHead>Spieler:in</ShadcnTableHead>
        <ShadcnTableHead v-for="c in cats" :key="c.id" class="text-right whitespace-nowrap">
          {{ c.name }}
        </ShadcnTableHead>
        <ShadcnTableHead class="text-right">Gesamt</ShadcnTableHead>
      </ShadcnTableRow>
    </ShadcnTableHeader>
    <ShadcnTableBody>
      <ShadcnTableEmpty v-if="!rows.length" :colspan="cats.length + 3" data-testid="ranking-empty">
        Keine Punkte im gewählten Zeitraum.
      </ShadcnTableEmpty>
      <ShadcnTableRow
        v-for="row in rows"
        :key="row.player_id"
        :class="{ 'bg-warning/15 hover:bg-warning/20': row.player_id === highlightPlayerId }"
        :data-testid="`ranking-row-${row.player_id}`"
      >
        <th scope="row" class="sticky left-0 bg-inherit border-r px-2 py-2 text-left">
          <ShadcnBadge :variant="row.rank_position <= 3 ? 'default' : 'secondary'">
            {{ row.rank_position }}
          </ShadcnBadge>
        </th>
        <ShadcnTableCell>
          <NuxtLink
            v-if="linkPlayers"
            :to="`/t/${slug}/players/${row.player_id}`"
            class="underline"
          >
            <span class="text-muted-foreground mr-1">
              {{ row.jersey_number !== null ? `#${row.jersey_number}` : '—' }}
            </span>
            {{ row.name }}
          </NuxtLink>
          <template v-else>
            <span class="text-muted-foreground mr-1">
              {{ row.jersey_number !== null ? `#${row.jersey_number}` : '—' }}
            </span>
            {{ row.name }}
          </template>
        </ShadcnTableCell>
        <ShadcnTableCell v-for="c in cats" :key="c.id" class="text-right tabular-nums">
          {{ scoreFor(row, c.id) }}
        </ShadcnTableCell>
        <ShadcnTableCell class="text-right font-semibold tabular-nums">
          {{ totalFor(row) }}
        </ShadcnTableCell>
      </ShadcnTableRow>
    </ShadcnTableBody>
  </ShadcnTable>
</template>
