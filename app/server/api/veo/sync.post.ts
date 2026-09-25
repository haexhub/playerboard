import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { schema, useAdminDb } from '~/server/utils/db'
import { getAccessToken } from '~/server/utils/veo/auth'
import {
  fetchAnalysisStats,
  fetchPlayerAnalysisStats,
  listMatches,
  type VeoMatchListItem,
} from '~/server/utils/veo/client'
import { mapAnalysisStatsToRows, type VeoMatchStatRow } from '~/server/utils/veo/mapStats'
import {
  mapPlayerStats,
  type RosterPlayer,
  type VeoPlayerMatchStatRow,
} from '~/server/utils/veo/mapPlayerStats'

type Db = ReturnType<typeof useAdminDb>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type TeamMapping = typeof schema.veoTeamMappings.$inferSelect
type AnalyzableVeoMatch = Omit<VeoMatchListItem, 'info'> & {
  info: { stats: { score_aggregated: { own: number; opponent: number } } }
}

const isAnalyzable = (match: VeoMatchListItem): match is AnalyzableVeoMatch => {
  const score = match.info?.stats?.score_aggregated
  return match.has_analytics_enabled && score?.own != null && score.opponent != null
}

const touchAttempt = (db: Db, teamId: string) =>
  db
    .insert(schema.veoSyncStatus)
    .values({ teamId, lastAttemptAt: new Date() })
    .onConflictDoUpdate({
      target: schema.veoSyncStatus.teamId,
      set: { lastAttemptAt: new Date() },
    })

const recordSuccess = (db: Db, teamId: string) =>
  db
    .update(schema.veoSyncStatus)
    .set({ lastSuccessAt: new Date(), consecutiveFailures: 0, lastError: null })
    .where(eq(schema.veoSyncStatus.teamId, teamId))

const recordFailure = (db: Db, teamId: string, error: unknown) =>
  db
    .update(schema.veoSyncStatus)
    .set({
      consecutiveFailures: sql`${schema.veoSyncStatus.consecutiveFailures} + 1`,
      lastError: error instanceof Error ? error.message : String(error),
    })
    .where(eq(schema.veoSyncStatus.teamId, teamId))

const upsertMatch = async (db: Db | Tx, teamId: string, match: AnalyzableVeoMatch) => {
  const values = {
    teamId,
    veoMatchId: match.identifier,
    playedAt: new Date(match.start),
    opponentName: match.opponent_team_name,
    ownScore: match.info.stats.score_aggregated.own,
    opponentScore: match.info.stats.score_aggregated.opponent,
    homeOrAway: match.own_team_home_or_away,
  }
  const [row] = await db
    .insert(schema.veoMatches)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.veoMatches.teamId, schema.veoMatches.veoMatchId],
      set: { ...values, lastSyncedAt: new Date() },
    })
    .returning({ id: schema.veoMatches.id })
  if (!row) throw new Error(`Upsert of veo_matches for ${match.identifier} returned no row`)
  return row.id
}

const upsertStats = async (db: Db | Tx, rows: VeoMatchStatRow[]) => {
  if (rows.length === 0) return
  await db
    .insert(schema.veoMatchStats)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        schema.veoMatchStats.matchId,
        schema.veoMatchStats.teamAssociation,
        schema.veoMatchStats.statType,
      ],
      set: {
        category: sql`excluded.category`,
        value: sql`excluded.value`,
        periodValues: sql`excluded.period_values`,
      },
    })
}

const fetchActiveRoster = async (db: Db, teamId: string): Promise<RosterPlayer[]> => {
  const rows = await db
    .select({ id: schema.players.id, jerseyNumber: schema.players.jerseyNumber })
    .from(schema.players)
    .where(
      and(
        eq(schema.players.teamId, teamId),
        eq(schema.players.active, true),
        isNotNull(schema.players.jerseyNumber),
      ),
    )
  return rows.map((r) => ({ id: r.id, jerseyNumber: r.jerseyNumber as number }))
}

// Jersey numbers already recorded for this match, by whichever row (sync or
// manual) last set player_id — used to stop a *new* jersey-number group from
// auto-claiming a player already attributed to a different jersey number in
// the same match (research.md §10/§14, FR-016).
const fetchExistingAssignments = async (
  tx: Tx,
  matchId: string,
): Promise<Map<number, string | null>> => {
  const rows = await tx
    .select({
      veoJerseyNumber: schema.veoPlayerMatchStats.veoJerseyNumber,
      playerId: schema.veoPlayerMatchStats.playerId,
      matchedManually: schema.veoPlayerMatchStats.matchedManually,
    })
    .from(schema.veoPlayerMatchStats)
    .where(eq(schema.veoPlayerMatchStats.matchId, matchId))
  const byJersey = new Map<number, string | null>()
  for (const row of rows) {
    if (row.playerId !== null || row.matchedManually) {
      byJersey.set(row.veoJerseyNumber, row.playerId)
    }
  }
  return byJersey
}

const reserveAssignments = (
  rows: VeoPlayerMatchStatRow[],
  existingByJersey: Map<number, string | null>,
): VeoPlayerMatchStatRow[] => {
  const claimedPlayerIds = new Set(existingByJersey.values())
  return rows.map((row) => {
    // An existing jersey-number group's player_id is preserved unchanged on
    // conflict regardless of what we send, including a manual clear.
    if (existingByJersey.has(row.veoJerseyNumber)) {
      return { ...row, playerId: existingByJersey.get(row.veoJerseyNumber) ?? null }
    }
    if (row.playerId !== null && claimedPlayerIds.has(row.playerId)) {
      return { ...row, playerId: null }
    }
    return row
  })
}

const upsertPlayerStats = async (db: Db | Tx, rows: VeoPlayerMatchStatRow[]) => {
  if (rows.length === 0) return
  await db
    .insert(schema.veoPlayerMatchStats)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        schema.veoPlayerMatchStats.matchId,
        schema.veoPlayerMatchStats.veoJerseyNumber,
        schema.veoPlayerMatchStats.statType,
      ],
      // player_id/matched_manually intentionally excluded — set only on
      // insert, preserved unchanged on conflict (research.md §10, FR-013).
      set: {
        category: sql`excluded.category`,
        value: sql`excluded.value`,
        updatedAt: new Date(),
      },
    })
}

const syncTeam = async (db: Db, mapping: TeamMapping) => {
  await touchAttempt(db, mapping.teamId)
  try {
    const accessToken = await getAccessToken(mapping.teamId)
    const matches = await listMatches(accessToken, {
      veoClubSlug: mapping.veoClubSlug,
      veoTeamSlug: mapping.veoTeamSlug,
    })
    // FR-007: a match without completed Veo analysis is skipped, not an error.
    const analyzable = matches.filter(isAnalyzable)
    // Fetched once per team per run, not per match (research.md §5).
    const roster = await fetchActiveRoster(db, mapping.teamId)

    let hasMatchFailure = false
    let firstMatchError: unknown
    let syncedMatches = 0
    for (const match of analyzable) {
      try {
        const statsPayload = await fetchAnalysisStats(accessToken, {
          veoTeamId: match.team.id,
          veoMatchIds: [match.identifier],
        })
        // Fetched before the transaction, same as statsPayload above: a
        // failure here must skip the whole match (match + team stats
        // included), not just the player stats (FR-015, research.md §13).
        const playerStatsPayload = await fetchPlayerAnalysisStats(accessToken, {
          veoTeamId: match.team.id,
          veoMatchIds: [match.identifier],
        })
        // One transaction per match: a malformed stats payload or a failure
        // half-way through must not leave a freshly synced match row next to
        // stale or partial stats (FR-008, fail closed).
        await db.transaction(async (tx) => {
          const matchId = await upsertMatch(tx, mapping.teamId, match)
          await upsertStats(tx, mapAnalysisStatsToRows(statsPayload, matchId))

          const mappedPlayerRows = mapPlayerStats(playerStatsPayload, matchId, roster)
          const existingByJersey = await fetchExistingAssignments(tx, matchId)
          await upsertPlayerStats(tx, reserveAssignments(mappedPlayerRows, existingByJersey))
        })
        syncedMatches += 1
      } catch (err) {
        hasMatchFailure = true
        if (firstMatchError === undefined) firstMatchError = err
      }
    }

    if (hasMatchFailure) {
      await recordFailure(db, mapping.teamId, firstMatchError)
      return { teamId: mapping.teamId, ok: false, matches: syncedMatches }
    }
    await recordSuccess(db, mapping.teamId)
    return { teamId: mapping.teamId, ok: true, matches: syncedMatches }
  } catch (err) {
    await recordFailure(db, mapping.teamId, err)
    return { teamId: mapping.teamId, ok: false }
  }
}

export default defineEventHandler(async (event) => {
  const expected = `Bearer ${useRuntimeConfig().veoSyncSecret}`
  if (getHeader(event, 'authorization') !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'Not authorized' })
  }

  const db = useAdminDb()
  const mappings = await db
    .select()
    .from(schema.veoTeamMappings)
    .where(eq(schema.veoTeamMappings.enabled, true))

  const results = []
  for (const mapping of mappings) {
    results.push(await syncTeam(db, mapping))
  }
  // Let the cron's `curl --fail` notice a failed team sync.
  if (results.some((result) => !result.ok)) setResponseStatus(event, 502)
  return { synced: results }
})
