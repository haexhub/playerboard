import { z } from 'zod'
import type { Database } from '~/types/database'

const publicRankingCategorySchema = z.object({
  name: z.string(),
  sort_order: z.number(),
})

export type PublicRankingCategory = z.infer<typeof publicRankingCategorySchema>

const publicRankingRowSchema = z.object({
  rank_position: z.number(),
  jersey_number: z.number().nullable(),
  scores: z.record(z.string(), z.number()),
})

export type PublicRankingRow = z.infer<typeof publicRankingRowSchema>

const publicRankingSchema = z.object({
  team_name: z.string().nullable(),
  from: z.string(),
  to: z.string(),
  categories: z.array(publicRankingCategorySchema),
  rows: z.array(publicRankingRowSchema),
  not_found: z.boolean().optional(),
})

export type PublicRanking = z.infer<typeof publicRankingSchema>

export const usePublicRanking = () => {
  const client = useSupabaseClient<Database>()

  const getPublicRanking = async (
    slug: string,
    from: string,
    to: string,
  ): Promise<PublicRanking> => {
    const { data, error } = await client.rpc('get_public_ranking', {
      p_slug: slug,
      p_from: from,
      p_to: to,
    })
    if (error) throw error
    if (!data) {
      return { team_name: null, from, to, categories: [], rows: [], not_found: true }
    }
    const parsed = publicRankingSchema.safeParse(data)
    if (!parsed.success) throw new Error('Ungültiges Ranglistenformat')
    return parsed.data
  }

  return { getPublicRanking }
}
