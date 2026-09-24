import { z } from 'zod'

const playerStatEntrySchema = z.object({
  category: z.object({ id: z.string() }),
  // veo_player_match_stats.value is a double precision column — curated
  // stats mix integer counts and decimals (speeds, distance).
  value: z.number(),
  type: z.string(),
})

const playerItemSchema = z.object({
  player: z.object({ jersey_number: z.string() }),
  stats: z.array(playerStatEntrySchema),
})

const playerAnalysisStatsResponseSchema = z.object({
  items: z.array(playerItemSchema),
})

// research.md §3 — everything else Veo returns per player is dropped (FR-008).
const CURATED_STAT_TYPES = new Set([
  'distance_total_meters',
  'sprints_total',
  'top_speed_kmh',
  'average_speed_kmh',
  'high_intensity_runs_total',
  'seconds_played_total',
  'football_shots_total',
  'football_goal_total',
  'football_goal_involvement_total',
])

export type RosterPlayer = { id: string; jerseyNumber: number }

export type VeoPlayerMatchStatRow = {
  matchId: string
  veoJerseyNumber: number
  statType: string
  playerId: string | null
  category: string
  value: number
}

/** Maps a `POST app.veo.co/api/app/analysis/stats/` (group_by: player) response
 * to `veo_player_match_stats` rows. A jersey number with no active-roster
 * match still produces rows, with `playerId: null` — never dropped
 * (FR-011), never displayed until a trainer assigns it. */
export const mapPlayerStats = (
  payload: unknown,
  matchId: string,
  roster: RosterPlayer[],
): VeoPlayerMatchStatRow[] => {
  const parsed = playerAnalysisStatsResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('Unexpected Veo player-stats response shape')
  }
  const playerIdByJersey = new Map(roster.map((p) => [p.jerseyNumber, p.id]))

  const rowsByKey = new Map<string, VeoPlayerMatchStatRow>()
  for (const item of parsed.data.items) {
    const veoJerseyNumber = Number.parseInt(item.player.jersey_number, 10)
    if (!Number.isFinite(veoJerseyNumber)) continue
    const playerId = playerIdByJersey.get(veoJerseyNumber) ?? null
    for (const stat of item.stats) {
      if (!CURATED_STAT_TYPES.has(stat.type)) continue
      const key = `${veoJerseyNumber}:${stat.type}`
      // Keep the first occurrence so duplicate Veo rows have deterministic
      // behavior without allowing them to collide at the database key.
      if (rowsByKey.has(key)) continue
      rowsByKey.set(key, {
        matchId,
        veoJerseyNumber,
        statType: stat.type,
        playerId,
        category: stat.category.id,
        value: stat.value,
      })
    }
  }
  return [...rowsByKey.values()]
}
