import { z } from 'zod'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
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
  const handoverByTeam = new Map(handovers.map((h) => [h.team_id, h.new_trainer_user_id]))
  const teamsToDelete = new Set(delete_team_ids)

  const admin = serverSupabaseServiceRole<Database>(event)

  type Promotion = { teamId: string; userId: string; previousRole: string }

  // Lock and recheck the teams in the same transaction as the handovers. The
  // initial UI query is only a hint; a member can join between opening the
  // dialog and submitting it.
  const preparation = await db.transaction(async (tx) => {
    const myTrainerTeams = await tx
      .select({ teamId: schema.memberships.teamId })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.role, 'trainer')))
    const trainerTeamIds = myTrainerTeams.map(({ teamId }) => teamId)

    if (trainerTeamIds.length > 0) {
      await tx.execute(
        sql`select id from ${schema.teams} where ${inArray(schema.teams.id, trainerTeamIds)} for update`,
      )
    }

    const members =
      trainerTeamIds.length === 0
        ? []
        : await tx
            .select({
              teamId: schema.memberships.teamId,
              userId: schema.memberships.userId,
              role: schema.memberships.role,
            })
            .from(schema.memberships)
            .where(
              and(
                inArray(schema.memberships.teamId, trainerTeamIds),
                ne(schema.memberships.userId, userId),
              ),
            )
    const membersByTeam = new Map<string, typeof members>()
    for (const member of members) {
      const teamMembers = membersByTeam.get(member.teamId) ?? []
      teamMembers.push(member)
      membersByTeam.set(member.teamId, teamMembers)
    }

    const unresolved: string[] = []
    const promotions: Promotion[] = []
    const deletions: string[] = []

    for (const teamId of trainerTeamIds) {
      const others = membersByTeam.get(teamId) ?? []

      // Another trainer already covers the team.
      if (others.some((member) => member.role === 'trainer')) continue

      if (teamsToDelete.has(teamId)) {
        // Deleting a team is only offered when nobody else would lose access.
        if (others.length > 0) {
          throw createError({
            statusCode: 409,
            statusMessage:
              'A team with other members cannot be deleted, hand over the role instead',
          })
        }
        deletions.push(teamId)
        continue
      }

      const successor = handoverByTeam.get(teamId)
      const successorMember = others.find((member) => member.userId === successor)
      if (successorMember) {
        promotions.push({
          teamId,
          userId: successorMember.userId,
          previousRole: successorMember.role,
        })
        continue
      }
      unresolved.push(teamId)
    }

    if (unresolved.length > 0) {
      const names = await tx
        .select({ name: schema.teams.name })
        .from(schema.teams)
        .where(inArray(schema.teams.id, unresolved))
      throw createError({
        statusCode: 409,
        statusMessage: 'Hand over the trainer role first',
        data: { teams: names.map((team) => team.name) },
      })
    }

    if (deletions.length > 0) {
      await tx
        .insert(schema.pendingAccountDeletions)
        .values(deletions.map((teamId) => ({ userId, teamId })))
        .onConflictDoNothing()
    }

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

    const [profile] = await tx
      .select({ avatarPath: schema.userProfiles.avatarPath })
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.id, userId))
      .limit(1)

    return { avatarPath: profile?.avatarPath, promotions }
  })

  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId)
  if (deleteErr) {
    console.error('[profile/delete] auth user deletion failed', deleteErr.message)
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(schema.pendingAccountDeletions)
          .where(eq(schema.pendingAccountDeletions.userId, userId))
        for (const promotion of preparation.promotions) {
          await tx
            .update(schema.memberships)
            .set({ role: promotion.previousRole })
            .where(
              and(
                eq(schema.memberships.teamId, promotion.teamId),
                eq(schema.memberships.userId, promotion.userId),
                eq(schema.memberships.role, 'trainer'),
              ),
            )
        }
      })
    } catch (rollbackError) {
      console.error('[profile/delete] failed to roll back pending deletion', rollbackError)
    }
    throw createError({ statusCode: 500, statusMessage: 'Account deletion failed' })
  }

  // Auth deletion succeeded. Recheck pending teams under a lock because a
  // member may have joined while the external Auth request was in flight.
  // Such a team is kept, while an empty one is deleted with its data.
  const { photoPaths } = await db.transaction(async (tx) => {
    const pending = await tx
      .select({ teamId: schema.pendingAccountDeletions.teamId })
      .from(schema.pendingAccountDeletions)
      .where(eq(schema.pendingAccountDeletions.userId, userId))
    const pendingTeamIds = pending.map(({ teamId }) => teamId)
    let photoPaths: string[] = []

    if (pendingTeamIds.length > 0) {
      await tx.execute(
        sql`select id from ${schema.teams} where ${inArray(schema.teams.id, pendingTeamIds)} for update`,
      )
      const currentMembers = await tx
        .select({ teamId: schema.memberships.teamId })
        .from(schema.memberships)
        .where(inArray(schema.memberships.teamId, pendingTeamIds))
      const occupiedTeams = new Set(currentMembers.map((member) => member.teamId))
      const deletions = pendingTeamIds.filter((teamId) => !occupiedTeams.has(teamId))

      if (deletions.length > 0) {
        photoPaths = (
          await tx
            .select({ path: schema.trainingPhotos.storagePath })
            .from(schema.trainingPhotos)
            .innerJoin(schema.trainings, eq(schema.trainings.id, schema.trainingPhotos.trainingId))
            .where(inArray(schema.trainings.teamId, deletions))
        ).map((row) => row.path)
        await tx.delete(schema.teams).where(inArray(schema.teams.id, deletions))
      }
    }

    await tx
      .delete(schema.pendingAccountDeletions)
      .where(eq(schema.pendingAccountDeletions.userId, userId))
    return { photoPaths }
  })

  // Best effort from here: the rows are gone, so a failed object removal only
  // leaves an unreachable file behind and must not fail the deletion.
  const removeObjects = async (bucket: string, paths: string[]) => {
    if (paths.length === 0) return
    const { error } = await admin.storage.from(bucket).remove(paths)
    if (error) console.error('[profile/delete] object removal failed', bucket, error.message)
  }
  await removeObjects('training-photos', photoPaths)
  await removeObjects('avatars', preparation.avatarPath ? [preparation.avatarPath] : [])

  return { ok: true }
})
