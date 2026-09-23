import { z } from 'zod'
import type { Database } from '~/types/database'

const publicVeoStatsRowSchema = z.object({
  jersey_number: z.number().nullable(),
  stats: z.record(z.string(), z.number()),
})

export type PublicVeoStatsRow = z.infer<typeof publicVeoStatsRowSchema>

const publicVeoStatsSchema = z.object({
  enabled: z.boolean(),
  season_start: z.string().nullable(),
  rows: z.array(publicVeoStatsRowSchema),
  not_found: z.boolean().optional(),
})

export type PublicVeoStats = z.infer<typeof publicVeoStatsSchema>

export const usePublicVeoStats = () => {
  const client = useSupabaseClient<Database>()

  const getPublicVeoStats = async (slug: string): Promise<PublicVeoStats> => {
    const { data, error } = await client.rpc('get_public_veo_stats', { p_slug: slug })
    if (error) throw error
    if (!data) {
      return { enabled: false, season_start: null, rows: [], not_found: true }
    }
    const parsed = publicVeoStatsSchema.safeParse(data)
    if (!parsed.success) throw new Error('Ungültiges Veo-Stats-Format')
    return parsed.data
  }

  return { getPublicVeoStats }
}
