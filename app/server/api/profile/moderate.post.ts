import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database'
import { requireTrainer, useAdminDb, schema } from '~/server/utils/db'
import { displayNameSchema } from '~/utils/validators'

const bodySchema = z.object({
  target_user_id: z.string().uuid(),
  team_id: z.string().uuid(),
  field: z.enum(['name', 'avatar']),
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }
  const { target_user_id, team_id, field } = parsed.data

  const db = useAdminDb()
  await requireTrainer(db, team_id, userId)

  const [target] = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(
      and(eq(schema.memberships.teamId, team_id), eq(schema.memberships.userId, target_user_id)),
    )
    .limit(1)
  if (!target) {
    throw createError({ statusCode: 403, statusMessage: 'Target is not a member of this team' })
  }

  const admin = serverSupabaseServiceRole<Database>(event)

  if (field === 'name') {
    const { data: targetUser, error: getUserErr } =
      await admin.auth.admin.getUserById(target_user_id)
    if (getUserErr || !targetUser.user?.email) {
      console.error('[profile/moderate] target user lookup failed', getUserErr?.message)
      throw createError({ statusCode: 500, statusMessage: 'Target user not found' })
    }
    const parsedDefaultName = displayNameSchema.safeParse(targetUser.user.email.split('@')[0])
    const defaultName = parsedDefaultName.success ? parsedDefaultName.data : target_user_id
    await db
      .update(schema.userProfiles)
      .set({ displayName: defaultName })
      .where(eq(schema.userProfiles.id, target_user_id))
  } else {
    const [profile] = await db
      .select({ avatarPath: schema.userProfiles.avatarPath })
      .from(schema.userProfiles)
      .where(eq(schema.userProfiles.id, target_user_id))
      .limit(1)
    const path = profile?.avatarPath ?? null
    if (path) {
      await db
        .update(schema.userProfiles)
        .set({ avatarPath: null })
        .where(eq(schema.userProfiles.id, target_user_id))
      // The profile no longer points at the object; a failed removal only
      // leaves an orphaned file behind, so log it instead of failing the request.
      const { error: removeErr } = await admin.storage.from('avatars').remove([path])
      if (removeErr) {
        console.error('[profile/moderate] avatar removal failed', path, removeErr.message)
      }
    }
  }

  return { ok: true }
})
