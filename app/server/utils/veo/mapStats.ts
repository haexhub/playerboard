import { z } from 'zod'

const statPeriodSchema = z.object({
  period: z.number(),
  value: z.number(),
})

const statEntrySchema = z.object({
  category: z.object({ id: z.string() }),
  // veo_match_stats.value is an integer column.
  value: z.number().int(),
  periods: z.array(statPeriodSchema),
  type: z.string(),
})

const associationSchema = z.object({
  team_association: z.enum(['own', 'opponent']),
  stats: z.array(statEntrySchema),
})

const analysisStatsResponseSchema = z.object({
  items: z.array(associationSchema),
})

export type VeoMatchStatRow = {
  matchId: string
  teamAssociation: 'own' | 'opponent'
  statType: string
  category: string
  value: number
  periodValues: { period: number; value: number }[]
}

/** Maps a `POST app.veo.co/api/app/analysis/stats/` response to `veo_match_stats` rows.
 * Only stat types Veo actually returned are mapped — a missing category stays
 * missing, it is never fabricated (spec.md Edge Cases). */
export const mapAnalysisStatsToRows = (payload: unknown, matchId: string): VeoMatchStatRow[] => {
  const parsed = analysisStatsResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('Unexpected Veo analysis/stats response shape')
  }
  return parsed.data.items.flatMap((item) =>
    item.stats.map((stat) => ({
      matchId,
      teamAssociation: item.team_association,
      statType: stat.type,
      category: stat.category.id,
      value: stat.value,
      periodValues: stat.periods,
    })),
  )
}
