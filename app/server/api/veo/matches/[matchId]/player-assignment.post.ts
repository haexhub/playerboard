import { z } from 'zod'
import { and, eq, ne } from 'drizzle-orm'
import { serverSupabaseUser } from '#supabase/server'
import { requireTrainer, schema, useAdminDb } from '~/server/utils/db'
import { pgError } from '~/server/utils/pg-error'

const bodySchema = z.object({
  team_id: z.string().uuid(),
  veo_jersey_number: z.number().int(),
  // Nullable so a trainer can clear a wrong assignment without setting a new one.
  player_id: z.string().uuid().nullable(),
})

export default defineEventHandler(async (event) => {
  // Checked first, ahead of body validation, so an unauthenticated caller
  // always gets 401 regardless of what else is wrong with the request.
  const user = await serverSupabaseUser(event)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const matchId = getRouterParam(event, 'matchId')
  if (!matchId) throw createError({ statusCode: 400, statusMessage: 'Missing matchId' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }
  const { team_id, veo_jersey_number, player_id } = parsed.data

  const db = useAdminDb()
  await requireTrainer(db, team_id, user.sub)

  try {
    await db.transaction(async (tx) => {
      // Shared lock with the sync route (research.md §14) — serializes a
      // concurrent sync run and a concurrent manual assignment for the same
      // match.
      const [match] = await tx
        .select({ id: schema.veoMatches.id, teamId: schema.veoMatches.teamId })
        .from(schema.veoMatches)
        .where(eq(schema.veoMatches.id, matchId))
        .for('update')
      if (!match || match.teamId !== team_id) {
        throw createError({ statusCode: 404, statusMessage: 'Match not found for this team' })
      }

      if (player_id) {
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
      }

      await tx
        .update(schema.veoPlayerMatchStats)
        .set({ playerId: player_id, matchedManually: true, updatedAt: new Date() })
        .where(
          and(
            eq(schema.veoPlayerMatchStats.matchId, matchId),
            eq(schema.veoPlayerMatchStats.veoJerseyNumber, veo_jersey_number),
          ),
        )
    })
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode) throw err
    console.error('[veo/player-assignment] failed', pgError(err).code, pgError(err).message)
    throw createError({ statusCode: 500, statusMessage: 'Could not save player assignment' })
  }

  return { ok: true }
})
