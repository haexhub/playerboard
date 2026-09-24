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

type InvitationSnapshot = {
  id: string
  email: string
  token: string
  expiresAt: Date
}

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

  const token = generateToken()
  let invitationId: string
  // Set when the update-in-place path ran, so a failed mail-send can restore
  // the invitation's previous state instead of leaving the fresh (unsent)
  // token in place (research.md §3).
  let restoreOnMailFailure: InvitationSnapshot | null = null

  try {
    const result = await db.transaction(async (tx) => {
      if (player_id) {
        // Locks the player row for the rest of this transaction, so two
        // concurrent resend requests for the same player cannot both observe
        // "no open invitation" and race into invitations_player_open_uniq.
        const [player] = await tx
          .select({ teamId: schema.players.teamId, email: schema.players.email })
          .from(schema.players)
          .where(eq(schema.players.id, player_id))
          .for('update')
        if (!player || player.teamId !== team_id) {
          throw createError({
            statusCode: 400,
            statusMessage: 'player_id does not belong to team_id',
          })
        }
        // Never trust an email the client copied from a previously loaded
        // roster row — only the currently stored value may receive mail.
        if (!player.email || player.email.toLowerCase() !== email) {
          throw createError({
            statusCode: 409,
            statusMessage: "Request email does not match the player's current stored email",
          })
        }

        const [openInvitation] = await tx
          .select({
            id: schema.invitations.id,
            email: schema.invitations.email,
            token: schema.invitations.token,
            expiresAt: schema.invitations.expiresAt,
          })
          .from(schema.invitations)
          .where(
            and(eq(schema.invitations.playerId, player_id), isNull(schema.invitations.acceptedAt)),
          )
          .limit(1)

        if (openInvitation) {
          restoreOnMailFailure = openInvitation
          await tx
            .update(schema.invitations)
            .set({ email, token, expiresAt: sql`now() + interval '14 days'` })
            .where(eq(schema.invitations.id, openInvitation.id))
          return { id: openInvitation.id }
        }
      }

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
    if (err && typeof err === 'object' && 'statusCode' in err) throw err
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
    if (restoreOnMailFailure) {
      const snapshot: InvitationSnapshot = restoreOnMailFailure
      // Only restore if nothing else has since resent this same invitation —
      // a concurrent resend that already committed a newer token must win.
      await db
        .update(schema.invitations)
        .set({ email: snapshot.email, token: snapshot.token, expiresAt: snapshot.expiresAt })
        .where(and(eq(schema.invitations.id, snapshot.id), eq(schema.invitations.token, token)))
    } else {
      await db.delete(schema.invitations).where(eq(schema.invitations.id, invitationId))
    }
    throw createError({ statusCode: 500, statusMessage: mailErr.message })
  }

  return { id: invitationId }
})
