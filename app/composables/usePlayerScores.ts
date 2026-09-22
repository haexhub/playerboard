import type { Database } from '~/types/database'

export type CategoryScoreRow = {
  category_id: string
  category_name: string
  sort_order: number
  sum_value: number
  avg_value: number | null
  median_value: number | null
}

export type PlayerScoreWithTeamStats = CategoryScoreRow & {
  team_avg: number | null
  team_median: number | null
}

export const usePlayerScores = () => {
  const client = useSupabaseClient<Database>()

  const forPlayer = async (
    team_id: string,
    player_id: string,
    from: string,
    to: string,
  ): Promise<CategoryScoreRow[]> => {
    const { data, error } = await client.rpc('get_player_scores_by_category', {
      p_team: team_id,
      p_player: player_id,
      p_from: from,
      p_to: to,
    })
    if (error) throw error
    return ((data ?? []) as unknown as CategoryScoreRow[]).map((row) => ({
      ...row,
      sum_value: Number(row.sum_value),
      avg_value: row.avg_value !== null ? Number(row.avg_value) : null,
      median_value: row.median_value !== null ? Number(row.median_value) : null,
    }))
  }

  // Derives team average / median per category from every active player's
  // point_entries in the timeframe. Skips nulls (players with no entries
  // in that category simply don't contribute).
  const teamStatsForActivePlayers = async (
    team_id: string,
    from: string,
    to: string,
    active_player_ids: string[],
  ): Promise<Map<string, { avg: number | null; median: number | null }>> => {
    const perCategory = new Map<string, number[]>()
    await Promise.all(
      active_player_ids.map(async (pid) => {
        const rows = await forPlayer(team_id, pid, from, to)
        for (const r of rows) {
          if (r.sum_value === 0 && r.avg_value === null) continue
          const arr = perCategory.get(r.category_id) ?? []
          arr.push(r.sum_value)
          perCategory.set(r.category_id, arr)
        }
      }),
    )

    const out = new Map<string, { avg: number | null; median: number | null }>()
    for (const [cat, values] of perCategory.entries()) {
      if (values.length === 0) {
        out.set(cat, { avg: null, median: null })
        continue
      }
      const sorted = [...values].sort((a, b) => a - b)
      const avg = values.reduce((s, v) => s + v, 0) / values.length
      const mid = Math.floor(sorted.length / 2)
      const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
      out.set(cat, { avg, median })
    }
    return out
  }

  // Time-series data for one player: point_entries in the timeframe joined
  // with their training date. Grouped by category; entries within the same
  // category are ordered chronologically.
  type SeriesPoint = { date: string; value: number }
  type PlayerTimeSeries = Map<string, SeriesPoint[]>

  const playerTimeSeries = async (
    team_id: string,
    player_id: string,
    from: string,
    to: string,
  ): Promise<PlayerTimeSeries> => {
    const { data, error } = await client
      .from('point_entries')
      .select('category_id, value, trainings!inner(date, status, team_id)')
      .eq('player_id', player_id)
      .eq('trainings.team_id', team_id)
      .eq('trainings.status', 'saved')
      .gte('trainings.date', from)
      .lte('trainings.date', to)
    if (error) throw error

    const grouped = new Map<string, SeriesPoint[]>()
    for (const row of (data ?? []) as Array<{
      category_id: string
      value: number
      trainings: { date: string } | { date: string }[] | null
    }>) {
      const training = Array.isArray(row.trainings) ? row.trainings[0] : row.trainings
      if (!training) continue
      const arr = grouped.get(row.category_id) ?? []
      arr.push({ date: training.date, value: Number(row.value) })
      grouped.set(row.category_id, arr)
    }
    for (const [key, points] of grouped) {
      grouped.set(
        key,
        points.sort((a, b) => a.date.localeCompare(b.date)),
      )
    }
    return grouped
  }

  return { forPlayer, teamStatsForActivePlayers, playerTimeSeries }
}
