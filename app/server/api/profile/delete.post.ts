import { z } from 'zod'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database'
import { useAdminDb, schema } from '~/server/utils/db'

const bodySchema = z.object({
  handovers: z
    .array(z.object({ team_id: z.string().uuid(), new_trainer_user_id: z.string().uuid() }))
    .max(50)
    .default([]),
  delete_team_ids: z.array(z.string().uuid()).max(50).default([]),
})

/**
 * Deletes the caller's account.
 *
 * A team must keep a trainer, so a team the caller trains alone has to be
 * resolved first: either the role is handed to another member of that team,
 * or the team is deleted along with the account when the caller is its only
 * member. Anything left unresolved answers 409 and names the teams, and the
 * `prevent_last_trainer_change` trigger refuses the deletion regardless.
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }
  const { handovers, delete_team_ids } = parsed.data

  const db = useAdminDb()

  const myTrainerTeams = await db
    .select({ teamId: schema.memberships.teamId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.role, 'trainer')))

  const handoverByTeam = new Map(handovers.map((h) => [h.team_id, h.new_trainer_user_id]))
  const teamsToDelete = new Set(delete_team_ids)
  const unresolved: string[] = []
  const promotions: { teamId: string; userId: string }[] = []
  const deletions: string[] = []

  for (const { teamId } of myTrainerTeams) {
    const others = await db
      .select({ userId: schema.memberships.userId, role: schema.memberships.role })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.teamId, teamId), ne(schema.memberships.userId, userId)))

    // Another trainer already covers the team.
    if (others.some((m) => m.role === 'trainer')) continue

    if (teamsToDelete.has(teamId)) {
      // Deleting a team is only offered when nobody else would lose access.
      if (others.length > 0) {
        throw createError({
          statusCode: 409,
          statusMessage: 'A team with other members cannot be deleted, hand over the role instead',
        })
      }
      deletions.push(teamId)
      continue
    }

    const successor = handoverByTeam.get(teamId)
    if (successor && others.some((m) => m.userId === successor)) {
      promotions.push({ teamId, userId: successor })
      continue
    }
    unresolved.push(teamId)
  }

  if (unresolved.length > 0) {
    const names = await db
      .select({ name: schema.teams.name })
      .from(schema.teams)
      .where(inArray(schema.teams.id, unresolved))
    throw createError({
      statusCode: 409,
      statusMessage: 'Hand over the trainer role first',
      data: { teams: names.map((t) => t.name) },
    })
  }

  // Storage is not transactional, so collect the paths while the rows exist.
  const [profile] = await db
    .select({ avatarPath: schema.userProfiles.avatarPath })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.id, userId))
    .limit(1)

  const photoPaths =
    deletions.length === 0
      ? []
      : (
          await db
            .select({ path: schema.trainingPhotos.storagePath })
            .from(schema.trainingPhotos)
            .innerJoin(schema.trainings, eq(schema.trainings.id, schema.trainingPhotos.trainingId))
            .where(inArray(schema.trainings.teamId, deletions))
        ).map((row) => row.path)

  await db.transaction(async (tx) => {
    for (const promotion of promotions) {
      await tx
        .update(schema.memberships)
        .set({ role: 'trainer' })
        .where(
          and(
            eq(schema.memberships.teamId, promotion.teamId),
            eq(schema.memberships.userId, promotion.userId),
          ),
        )
    }
    if (deletions.length > 0) {
      await tx.delete(schema.teams).where(inArray(schema.teams.id, deletions))
    }
  })

  const admin = serverSupabaseServiceRole<Database>(event)

  // Best effort from here: the rows are gone, so a failed object removal only
  // leaves an unreachable file behind and must not fail the deletion.
  const removeObjects = async (bucket: string, paths: string[]) => {
    if (paths.length === 0) return
    const { error } = await admin.storage.from(bucket).remove(paths)
    if (error) console.error('[profile/delete] object removal failed', bucket, error.message)
  }
  await removeObjects('training-photos', photoPaths)
  await removeObjects('avatars', profile?.avatarPath ? [profile.avatarPath] : [])

  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId)
  if (deleteErr) {
    console.error('[profile/delete] auth user deletion failed', deleteErr.message)
    throw createError({ statusCode: 500, statusMessage: 'Account deletion failed' })
  }

  return { ok: true }
})
