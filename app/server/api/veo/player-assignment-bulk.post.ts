import { z } from 'zod'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { serverSupabaseUser } from '#supabase/server'
import { requireTrainer, schema, useAdminDb } from '~/server/utils/db'
import { pgError } from '~/server/utils/pg-error'

const bodySchema = z.object({
  team_id: z.string().uuid(),
  veo_jersey_number: z.number().int(),
  player_id: z.string().uuid(),
})

// Sibling of matches/[matchId]/player-assignment.post.ts, for a trainer who
// registers a player only after that jersey number's matches already
// synced (FR-003 keeps the sync-time assignment frozen — a later roster
// change never retroactively re-resolves it, on purpose, so this bulk
// action is the deliberate escape hatch instead of a live join). Only ever
// touches rows still `player_id is null` — an existing assignment (auto or
// manual) for a *different* player is never overwritten here, since the
// same jersey number can legitimately belong to a different player in an
// earlier or later match within the same season.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }
  const { team_id, veo_jersey_number, player_id } = parsed.data

  const db = useAdminDb()
  await requireTrainer(db, team_id, user.sub)

  try {
    await db.transaction(async (tx) => {
      const [player] = await tx
        .select({ id: schema.players.id })
        .from(schema.players)
        .where(and(eq(schema.players.id, player_id), eq(schema.players.teamId, team_id)))
      if (!player) {
        throw createError({
          statusCode: 400,
          statusMessage: 'player_id does not belong to team_id',
        })
      }

      const targetMatches = await tx
        .selectDistinct({ matchId: schema.veoPlayerMatchStats.matchId })
        .from(schema.veoPlayerMatchStats)
        .innerJoin(schema.veoMatches, eq(schema.veoMatches.id, schema.veoPlayerMatchStats.matchId))
        .where(
          and(
            eq(schema.veoMatches.teamId, team_id),
            eq(schema.veoPlayerMatchStats.veoJerseyNumber, veo_jersey_number),
            isNull(schema.veoPlayerMatchStats.playerId),
          ),
        )

      for (const { matchId } of targetMatches) {
        // Shared lock with the sync route (research.md §14) — same as the
        // single-match route, just repeated per affected match.
        await tx
          .select({ id: schema.veoMatches.id })
          .from(schema.veoMatches)
          .where(eq(schema.veoMatches.id, matchId))
          .for('update')

        // FR-016 — at most one jersey number per player per match: clear
        // this player's rows under any *other* jersey number in this match
        // before attributing the target jersey number to them.
        await tx
          .update(schema.veoPlayerMatchStats)
          .set({ playerId: null, matchedManually: true, updatedAt: new Date() })
          .where(
            and(
              eq(schema.veoPlayerMatchStats.matchId, matchId),
              eq(schema.veoPlayerMatchStats.playerId, player_id),
              ne(schema.veoPlayerMatchStats.veoJerseyNumber, veo_jersey_number),
            ),
          )

        await tx
          .update(schema.veoPlayerMatchStats)
          .set({ playerId: player_id, matchedManually: true, updatedAt: new Date() })
          .where(
            and(
              eq(schema.veoPlayerMatchStats.matchId, matchId),
              eq(schema.veoPlayerMatchStats.veoJerseyNumber, veo_jersey_number),
              isNull(schema.veoPlayerMatchStats.playerId),
            ),
          )
      }
    })
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode) throw err
    console.error('[veo/player-assignment-bulk] failed', pgError(err).code, pgError(err).message)
    throw createError({ statusCode: 500, statusMessage: 'Could not save player assignment' })
  }

  return { ok: true }
})
