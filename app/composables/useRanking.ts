import { ref, watch, type Ref } from 'vue'
import { z } from 'zod'
import { useTeamSettings } from '~/composables/useTeamSettings'
import { useTimeframe } from '~/composables/useTimeframe'
import type { Database } from '~/types/database'

const rankingCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  sort_order: z.number(),
})

export type RankingCategory = z.infer<typeof rankingCategorySchema>

const rankingRowSchema = z.object({
  rank_position: z.number(),
  player_id: z.string(),
  name: z.string(),
  jersey_number: z.number().nullable(),
  scores: z.record(z.string(), z.number()),
})

export type RankingRow = z.infer<typeof rankingRowSchema>

const teamRankingSchema = z.object({
  team_id: z.string(),
  from: z.string(),
  to: z.string(),
  categories: z.array(rankingCategorySchema),
  rows: z.array(rankingRowSchema),
})

export type TeamRanking = z.infer<typeof teamRankingSchema>

export const useRanking = () => {
  const client = useSupabaseClient<Database>()

  const getTeamRanking = async (
    team_id: string,
    from: string,
    to: string,
  ): Promise<TeamRanking> => {
    const { data, error } = await client.rpc('get_team_ranking', {
      p_team: team_id,
      p_from: from,
      p_to: to,
    })
    if (error) throw error
    if (!data) {
      return { team_id, from, to, categories: [], rows: [] }
    }
    const parsed = teamRankingSchema.safeParse(data)
    if (!parsed.success) throw new Error('Ungültiges Ranglistenformat')
    return parsed.data
  }

  return { getTeamRanking }
}

// Season start → timeframe → team ranking that reloads whenever the range changes.
// Async (callers `await` it in <script setup>); the watcher is registered before
// the first await so it stays bound to the calling component instance.
export const useTimeframedRanking = async (teamId: Ref<string>, slug: Ref<string>) => {
  const { getTeamRanking } = useRanking()
  const { get: getSettings } = useTeamSettings()

  const seasonStart = ref<string | null>(null)
  const timeframe = useTimeframe(slug, seasonStart)

  const ranking = ref<TeamRanking | null>(null)
  const isLoading = ref(false)
  const loadError = ref<string | null>(null)
  // Loads wait for season_start so the first request already uses the right range.
  const settingsLoaded = ref(false)
  let latestLoad = 0

  const reload = async () => {
    if (!teamId.value || !settingsLoaded.value) return
    const loadId = ++latestLoad
    isLoading.value = true
    loadError.value = null
    try {
      const nextRanking = await getTeamRanking(
        teamId.value,
        timeframe.range.value.from,
        timeframe.range.value.to,
      )
      if (loadId === latestLoad) ranking.value = nextRanking
    } catch (err) {
      if (loadId === latestLoad) {
        loadError.value = err instanceof Error ? err.message : 'Konnte Rangliste nicht laden'
      }
    } finally {
      if (loadId === latestLoad) isLoading.value = false
    }
  }

  watch(
    () => [
      settingsLoaded.value,
      teamId.value,
      timeframe.range.value.from,
      timeframe.range.value.to,
    ],
    () => void reload(),
    { immediate: true },
  )

  if (teamId.value) {
    const s = await getSettings(teamId.value)
    seasonStart.value = s?.season_start ?? null
  }
  settingsLoaded.value = true
  // Watchers created during SSR setup never re-run on the server, so the initial
  // load must be started here for the page to render its loading state.
  if (import.meta.server) void reload()

  return { timeframe, seasonStart, ranking, isLoading, loadError, reload }
}
