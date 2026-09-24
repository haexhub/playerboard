import { randomBytes, createHash } from 'node:crypto'
import { z } from 'zod'
import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import { serverSupabaseUser } from '#supabase/server'
import { requireTrainer, useAdminDb, schema } from '~/server/utils/db'

const bodySchema = z.object({
  team_id: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
})

const REQUEST_TTL_MS = 30 * 60 * 1000

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const playerId = getRouterParam(event, 'player_id')
  const playerIdCheck = z.string().uuid().safeParse(playerId)
  if (!playerIdCheck.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid player_id' })
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }
  const { team_id, email } = parsed.data

  const db = useAdminDb()
  await requireTrainer(db, team_id, userId)

  const result = await db.transaction(async (tx) => {
    // Serializes concurrent trainer requests for the same player — locked by
    // player_id (known up front here), not linked_user_id, so the lock can be
    // acquired before any row read (contracts/rls-policies.md).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${playerIdCheck.data}))`)

    const [player] = await tx
      .select({ teamId: schema.players.teamId, linkedUserId: schema.players.linkedUserId })
      .from(schema.players)
      .where(eq(schema.players.id, playerIdCheck.data))
      .limit(1)
    if (!player || player.teamId !== team_id) {
      throw createError({ statusCode: 400, statusMessage: 'player_id does not belong to team_id' })
    }
    if (!player.linkedUserId) {
      throw createError({ statusCode: 400, statusMessage: 'Player is not linked to an account' })
    }

    const [conflict] = await tx
      .select({ id: schema.players.id })
      .from(schema.players)
      .where(
        and(
          eq(schema.players.teamId, team_id),
          sql`lower(${schema.players.email}) = ${email}`,
          ne(schema.players.id, playerIdCheck.data),
        ),
      )
      .limit(1)
    if (conflict) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Email already used by another player in this team',
      })
    }

    // At most one live pending request per player — a new request supersedes
    // any earlier one still unconfirmed.
    await tx
      .delete(schema.playerEmailChangeRequests)
      .where(
        and(
          eq(schema.playerEmailChangeRequests.playerId, playerIdCheck.data),
          isNull(schema.playerEmailChangeRequests.confirmedAt),
        ),
      )

    const token = randomBytes(24).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const [inserted] = await tx
      .insert(schema.playerEmailChangeRequests)
      .values({
        playerId: playerIdCheck.data,
        linkedUserId: player.linkedUserId,
        requestedEmail: email,
        tokenHash,
        expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
      })
      .returning({ id: schema.playerEmailChangeRequests.id })
    if (!inserted) throw new Error('Request insert returned no row')
    return inserted
  })

  return { status: 'confirmation_required' as const, request_id: result.id }
})
