import type { Database } from '~/types/database'

export type VeoMatchStat = {
  team_association: 'own' | 'opponent'
  stat_type: string
  category: string
  value: number
  period_values: { period: number; value: number }[]
}

export type VeoMatch = {
  id: string
  veo_match_id: string
  played_at: string
  opponent_name: string
  own_score: number
  opponent_score: number
  home_or_away: 'home' | 'away'
  stats: VeoMatchStat[]
}

export type VeoSyncStatus = {
  last_attempt_at: string | null
  last_success_at: string | null
  consecutive_failures: number
  last_error: string | null
}

export type VeoSeasonSummary = {
  wins: number
  draws: number
  losses: number
  categoryTotals: Record<string, number>
}

/** Aggregates own-team results/stats across the given matches — season
 * overview for User Story 2. Computed on read, not stored (research.md §6). */
export const computeSeasonSummary = (matches: VeoMatch[]): VeoSeasonSummary => {
  const summary: VeoSeasonSummary = { wins: 0, draws: 0, losses: 0, categoryTotals: {} }
  for (const match of matches) {
    if (match.own_score !== null && match.opponent_score !== null) {
      if (match.own_score > match.opponent_score) summary.wins += 1
      else if (match.own_score < match.opponent_score) summary.losses += 1
      else summary.draws += 1
    }
    for (const stat of match.stats) {
      if (stat.team_association !== 'own') continue
      summary.categoryTotals[stat.stat_type] =
        (summary.categoryTotals[stat.stat_type] ?? 0) + stat.value
    }
  }
  return summary
}

export const useVeoAnalytics = () => {
  const client = useSupabaseClient<Database>()

  const listMatches = async (team_id: string): Promise<VeoMatch[]> => {
    const { data, error } = await client
      .from('veo_matches')
      .select(
        'id, veo_match_id, played_at, opponent_name, own_score, opponent_score, home_or_away, veo_match_stats(team_association, stat_type, category, value, period_values)',
      )
      .eq('team_id', team_id)
      .order('played_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((m) => ({
      id: m.id,
      veo_match_id: m.veo_match_id,
      played_at: m.played_at,
      opponent_name: m.opponent_name,
      own_score: m.own_score,
      opponent_score: m.opponent_score,
      home_or_away: m.home_or_away as 'home' | 'away',
      stats: (m.veo_match_stats ?? []) as VeoMatchStat[],
    }))
  }

  const getSyncStatus = async (team_id: string): Promise<VeoSyncStatus | null> => {
    const { data, error } = await client
      .from('veo_sync_status')
      .select('last_attempt_at, last_success_at, consecutive_failures, last_error')
      .eq('team_id', team_id)
      .maybeSingle()
    if (error) throw error
    return data
  }

  return { listMatches, getSyncStatus }
}
