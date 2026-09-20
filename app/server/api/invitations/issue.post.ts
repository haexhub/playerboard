import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database'
import { useAdminDb, schema } from '~/server/utils/db'
import { pgError } from '~/server/utils/pg-error'

const bodySchema = z.object({
  team_id: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['trainer', 'player']),
  player_id: z.string().uuid().optional(),
})

const generateToken = () => randomBytes(24).toString('base64url')

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }
  const { team_id, email, role, player_id } = parsed.data

  if (player_id && role !== 'player') {
    throw createError({ statusCode: 400, statusMessage: 'player_id requires role "player"' })
  }

  const db = useAdminDb()

  const [caller] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.teamId, team_id), eq(schema.memberships.userId, userId)))
    .limit(1)

  if (!caller || caller.role !== 'trainer') {
    throw createError({ statusCode: 403, statusMessage: 'Only trainers of the team may invite' })
  }

  if (player_id) {
    const [player] = await db
      .select({ teamId: schema.players.teamId })
      .from(schema.players)
      .where(eq(schema.players.id, player_id))
      .limit(1)
    if (!player || player.teamId !== team_id) {
      throw createError({ statusCode: 400, statusMessage: 'player_id does not belong to team_id' })
    }
  }

  const token = generateToken()

  let invitationId: string
  try {
    const result = await db.transaction(async (tx) => {
      await tx
        .delete(schema.invitations)
        .where(
          and(
            eq(schema.invitations.teamId, team_id),
            sql`lower(${schema.invitations.email}) = ${email}`,
            isNull(schema.invitations.acceptedAt),
            sql`${schema.invitations.expiresAt} <= now()`,
          ),
        )

      const [inserted] = await tx
        .insert(schema.invitations)
        .values({
          teamId: team_id,
          email,
          role,
          token,
          invitedBy: userId,
          playerId: player_id,
        })
        .returning({ id: schema.invitations.id })
      if (!inserted) throw new Error('Invitation insert returned no row')
      return inserted
    })
    invitationId = result.id
  } catch (err) {
    const e = pgError(err)
    if (e.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'An open invitation for this email already exists',
      })
    }
    console.error('[invitations/issue] insert failed', e.code, e.constraint_name, e.message)
    throw createError({ statusCode: 500, statusMessage: e.message ?? 'Invitation insert failed' })
  }

  const origin = getRequestURL(event).origin
  const admin = serverSupabaseServiceRole<Database>(event)
  const { error: mailErr } = await admin.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/callback?redirect=${encodeURIComponent(`/invite/${token}`)}`,
    },
  })
  if (mailErr) {
    await db.delete(schema.invitations).where(eq(schema.invitations.id, invitationId))
    throw createError({ statusCode: 500, statusMessage: mailErr.message })
  }

  return { id: invitationId }
})
