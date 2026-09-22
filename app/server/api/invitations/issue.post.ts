import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database'
import { requireTrainer, useAdminDb, schema } from '~/server/utils/db'
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
  await requireTrainer(db, team_id, userId)

  // accept_invitation() keeps an existing membership untouched, so inviting a
  // current member (e.g. to change their role) would be accepted and then
  // silently do nothing. Roles are changed on the members page instead.
  // auth.users is Supabase-owned and deliberately not modelled beyond its key
  // in the Drizzle schema, so its e-mail is read through a raw subquery.
  const [existingMember] = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.teamId, team_id),
        sql`${schema.memberships.userId} in (select id from auth.users where lower(email) = ${email})`,
      ),
    )
    .limit(1)
  if (existingMember) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This person is already a member of the team',
    })
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
    throw createError({ statusCode: 500, statusMessage: 'Invitation could not be created' })
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
