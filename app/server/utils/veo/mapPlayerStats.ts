import { z } from 'zod'

const playerStatEntrySchema = z.object({
  // veo_player_match_stats.value is a double precision column — curated
  // stats mix integer counts and decimals (speeds, distance).
  value: z.number(),
  type: z.string(),
})

// Jersey number and the other player fields sit directly on the item, not
// under a nested `player` object — confirmed by capturing the real request
// the app.veo.co frontend sends (2026-09-25); research.md's original,
// never-verified fixture had assumed the nested shape.
const playerItemSchema = z.object({
  // A negative lookahead for any character forces the regex to consume the
  // actual end of the string; JavaScript's `$` also matches before a newline.
  jersey_number: z.string().regex(/^\d+(?![\s\S])/),
  stats: z.array(playerStatEntrySchema),
})

const playerAnalysisStatsResponseSchema = z.object({
  items: z.array(playerItemSchema),
})

// research.md §3 — everything else Veo returns per player is dropped (FR-008).
// The real response no longer sends a `category` per stat (only
// `type`/`value`/`unit`), so the category this feature stores per curated
// type is assigned here, matching the original research.md categorization.
const CURATED_STAT_CATEGORY: Record<string, string> = {
  distance_total_meters: 'physical',
  sprints_total: 'physical',
  top_speed_kmh: 'physical',
  average_speed_kmh: 'physical',
  high_intensity_runs_total: 'physical',
  seconds_played_total: 'physical',
  football_shots_total: 'attacking',
  football_goal_total: 'attacking',
  football_goal_involvement_total: 'attacking',
}

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
    const veoJerseyNumber = Number.parseInt(item.jersey_number, 10)
    if (!Number.isSafeInteger(veoJerseyNumber)) continue
    const playerId = playerIdByJersey.get(veoJerseyNumber) ?? null
    for (const stat of item.stats) {
      if (!Object.prototype.hasOwnProperty.call(CURATED_STAT_CATEGORY, stat.type)) continue
      const category = CURATED_STAT_CATEGORY[stat.type]
      if (category === undefined) continue
      const key = `${veoJerseyNumber}:${stat.type}`
      // Keep the first occurrence so duplicate Veo rows have deterministic
      // behavior without allowing them to collide at the database key.
      if (rowsByKey.has(key)) continue
      rowsByKey.set(key, {
        matchId,
        veoJerseyNumber,
        statType: stat.type,
        playerId,
        category,
        value: stat.value,
      })
    }
  }
  return [...rowsByKey.values()]
}
