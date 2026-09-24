import { randomBytes } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { serverSupabaseUser } from '#supabase/server'
import { requireTrainer, schema, useAdminDb } from '~/server/utils/db'
import { pgError } from '~/server/utils/pg-error'

const playerIdSchema = z.string().uuid()

const bodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    jersey_number: z.number().int().min(0).nullable().optional(),
    position: z.string().trim().min(1).nullable().optional(),
    photo_consent: z.boolean().optional(),
    active: z.boolean().optional(),
    email: z.string().trim().toLowerCase().email().nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, 'At least one field is required')

const generateToken = () => randomBytes(24).toString('base64url')

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const playerId = playerIdSchema.safeParse(getRouterParam(event, 'player_id'))
  if (!playerId.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid player_id' })
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }

  const db = useAdminDb()
  try {
    const updated = await db.transaction(async (tx) => {
      const [player] = await tx
        .select({
          id: schema.players.id,
          teamId: schema.players.teamId,
          linkedUserId: schema.players.linkedUserId,
          email: schema.players.email,
        })
        .from(schema.players)
        .where(eq(schema.players.id, playerId.data))
        .for('update')

      if (!player) {
        throw createError({ statusCode: 404, statusMessage: 'Player not found' })
      }
      await requireTrainer(db, player.teamId, userId)

      const hasEmailChange = Object.hasOwn(parsed.data, 'email')
      const nextEmail = parsed.data.email
      if (hasEmailChange && player.linkedUserId && nextEmail !== player.email) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Linked player email must use the owner-confirmed change flow',
        })
      }

      const updates: Partial<typeof schema.players.$inferInsert> = {}
      if (parsed.data.name !== undefined) updates.name = parsed.data.name
      if (parsed.data.jersey_number !== undefined) {
        updates.jerseyNumber = parsed.data.jersey_number
      }
      if (parsed.data.position !== undefined) updates.position = parsed.data.position
      if (parsed.data.photo_consent !== undefined) {
        updates.photoConsent = parsed.data.photo_consent
      }
      if (parsed.data.active !== undefined) updates.active = parsed.data.active
      if (hasEmailChange) updates.email = nextEmail

      if (hasEmailChange && nextEmail !== player.email && !player.linkedUserId) {
        const [openInvitation] = await tx
          .select({ id: schema.invitations.id })
          .from(schema.invitations)
          .where(
            sql`${schema.invitations.playerId} = ${playerId.data}
              and ${schema.invitations.acceptedAt} is null`,
          )
          .limit(1)

        if (openInvitation && nextEmail === null) {
          await tx.delete(schema.invitations).where(eq(schema.invitations.id, openInvitation.id))
        } else if (openInvitation && nextEmail !== null) {
          await tx
            .update(schema.invitations)
            .set({
              email: nextEmail,
              token: generateToken(),
              expiresAt: sql`now() + interval '14 days'`,
            })
            .where(eq(schema.invitations.id, openInvitation.id))
        }
      }

      const [row] = await tx
        .update(schema.players)
        .set(updates)
        .where(eq(schema.players.id, playerId.data))
        .returning({ id: schema.players.id })
      if (!row) throw new Error('Player update returned no row')
      return row
    })

    return updated
  } catch (err) {
    const databaseError = pgError(err)
    if (databaseError.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Player email or jersey number conflicts with an existing player',
      })
    }
    throw err
  }
})
