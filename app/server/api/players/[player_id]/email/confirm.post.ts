import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { serverSupabaseUser } from '#supabase/server'
import { useAdminDb, schema } from '~/server/utils/db'
import { pgError } from '~/server/utils/pg-error'

const bodySchema = z.object({
  request_id: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub
  const authEmail = user?.email?.trim().toLowerCase()
  if (!userId || !authEmail) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const playerId = getRouterParam(event, 'player_id')
  const playerIdCheck = z.string().uuid().safeParse(playerId)
  if (!playerIdCheck.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid player_id' })
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }
  const { request_id } = parsed.data

  const db = useAdminDb()

  await db.transaction(async (tx) => {
    // Same lock key as the request route — serializes a confirm against a
    // concurrent new request for the same player.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${playerIdCheck.data}))`)

    const [request] = await tx
      .select({
        id: schema.playerEmailChangeRequests.id,
        playerId: schema.playerEmailChangeRequests.playerId,
        linkedUserId: schema.playerEmailChangeRequests.linkedUserId,
        requestedEmail: schema.playerEmailChangeRequests.requestedEmail,
        expiresAt: schema.playerEmailChangeRequests.expiresAt,
        confirmedAt: schema.playerEmailChangeRequests.confirmedAt,
      })
      .from(schema.playerEmailChangeRequests)
      .where(eq(schema.playerEmailChangeRequests.id, request_id))
      .limit(1)

    if (!request || request.playerId !== playerIdCheck.data) {
      throw createError({ statusCode: 404, statusMessage: 'Request not found' })
    }
    if (request.linkedUserId !== userId) {
      throw createError({ statusCode: 403, statusMessage: 'Not the linked account owner' })
    }
    if (request.confirmedAt || request.expiresAt.getTime() <= Date.now()) {
      throw createError({ statusCode: 409, statusMessage: 'Request already used or expired' })
    }
    if (authEmail !== request.requestedEmail) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Auth email does not yet match the requested address',
      })
    }

    try {
      await tx
        .update(schema.players)
        .set({ email: request.requestedEmail })
        .where(eq(schema.players.linkedUserId, userId))
    } catch (err) {
      if (pgError(err).code === '23505') {
        throw createError({
          statusCode: 409,
          statusMessage: 'Email already used by another player in this team',
        })
      }
      throw err
    }

    await tx
      .update(schema.playerEmailChangeRequests)
      .set({ confirmedAt: new Date() })
      .where(eq(schema.playerEmailChangeRequests.id, request.id))
  })

  return { ok: true }
})
