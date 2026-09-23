import type { Database } from '~/types/database'

export type VeoMatchStat = {
  team_association: 'own' | 'opponent'
  stat_type: string
  category: string
  value: number
  period_values: { period: number; value: number }[]
}

export type VeoPlayerMatchStat = {
  veo_jersey_number: number
  player_id: string
  matched_manually: boolean
  stat_type: string
  category: string
  value: number
  player_name: string
  jersey_number: number | null
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
  // Member-facing only — rows with no resolved player are excluded here
  // (FR-002/SC-004); the trainer-only correction path fetches those
  // separately via `listUnassignedJerseyNumbers()`.
  player_stats: VeoPlayerMatchStat[]
}

export type VeoPlayerSeasonTotals = {
  playerId: string
  playerName: string
  jerseyNumber: number | null
  statTotals: Record<string, number>
}

export type ActiveRosterPlayer = {
  id: string
  name: string
  jerseyNumber: number | null
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

/** Sums each assigned player's curated stats across the given matches —
 * season overview for User Story 1. Computed on read, not stored, same
 * approach as `computeSeasonSummary` (004-veo-player-analytics research.md
 * §6). A player with no assigned rows anywhere simply never appears. */
export const computePlayerSeasonSummary = (matches: VeoMatch[]): VeoPlayerSeasonTotals[] => {
  const byPlayer = new Map<string, VeoPlayerSeasonTotals>()
  for (const match of matches) {
    for (const stat of match.player_stats) {
      const existing = byPlayer.get(stat.player_id) ?? {
        playerId: stat.player_id,
        playerName: stat.player_name,
        jerseyNumber: stat.jersey_number,
        statTotals: {},
      }
      existing.statTotals[stat.stat_type] = (existing.statTotals[stat.stat_type] ?? 0) + stat.value
      byPlayer.set(stat.player_id, existing)
    }
  }
  return [...byPlayer.values()].sort(
    (a, b) => (a.jerseyNumber ?? Infinity) - (b.jerseyNumber ?? Infinity),
  )
}

type RawPlayerStatRow = {
  veo_jersey_number: number
  player_id: string | null
  matched_manually: boolean
  stat_type: string
  category: string
  value: number
  players: { id: string; name: string; jersey_number: number | null } | null
}

export const useVeoAnalytics = () => {
  const client = useSupabaseClient<Database>()

  const listMatches = async (team_id: string): Promise<VeoMatch[]> => {
    const { data, error } = await client
      .from('veo_matches')
      .select(
        'id, veo_match_id, played_at, opponent_name, own_score, opponent_score, home_or_away, veo_match_stats(team_association, stat_type, category, value, period_values), veo_player_match_stats(veo_jersey_number, player_id, matched_manually, stat_type, category, value, players(id, name, jersey_number))',
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
      player_stats: ((m.veo_player_match_stats ?? []) as RawPlayerStatRow[])
        .filter((r) => r.player_id !== null && r.players !== null)
        .map((r) => ({
          veo_jersey_number: r.veo_jersey_number,
          player_id: r.player_id as string,
          matched_manually: r.matched_manually,
          stat_type: r.stat_type,
          category: r.category,
          value: r.value,
          player_name: r.players!.name,
          jersey_number: r.players!.jersey_number,
        })),
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

  // Trainer-only: every team member could technically read these via RLS
  // (data-model.md has no per-role restriction), but only the correction UI
  // (US3) ever requests them — never mixed into the member-facing display.
  const listUnassignedJerseyNumbers = async (
    matchIds: string[],
  ): Promise<Record<string, number[]>> => {
    if (matchIds.length === 0) return {}
    const { data, error } = await client
      .from('veo_player_match_stats')
      .select('match_id, veo_jersey_number')
      .in('match_id', matchIds)
      .is('player_id', null)
    if (error) throw error
    const byMatch = new Map<string, Set<number>>()
    for (const row of data ?? []) {
      const set = byMatch.get(row.match_id) ?? new Set<number>()
      set.add(row.veo_jersey_number)
      byMatch.set(row.match_id, set)
    }
    return Object.fromEntries(
      [...byMatch.entries()].map(([matchId, numbers]) => [
        matchId,
        [...numbers].sort((a, b) => a - b),
      ]),
    )
  }

  const getActiveRoster = async (team_id: string): Promise<ActiveRosterPlayer[]> => {
    const { data, error } = await client
      .from('players')
      .select('id, name, jersey_number')
      .eq('team_id', team_id)
      .eq('active', true)
      .order('jersey_number', { ascending: true })
    if (error) throw error
    return (data ?? []).map((p) => ({ id: p.id, name: p.name, jerseyNumber: p.jersey_number }))
  }

  return { listMatches, getSyncStatus, listUnassignedJerseyNumbers, getActiveRoster }
}
