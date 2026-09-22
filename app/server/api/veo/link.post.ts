import { z } from 'zod'
import { serverSupabaseUser } from '#supabase/server'
import { schema, useUserDb } from '~/server/utils/db'
import { pgError } from '~/server/utils/pg-error'
import { verifyLinkToken } from '~/server/utils/veo/linkToken'

const bodySchema = z.object({
  team_id: z.string().uuid(),
  veo_club_slug: z.string().trim().min(1),
  veo_team_slug: z.string().trim().min(1),
  link_token: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  // Checked first, ahead of body/token validation, so an unauthenticated
  // caller always gets 401 regardless of what else is wrong with the request.
  const user = await serverSupabaseUser(event)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }
  const { team_id, veo_club_slug, veo_team_slug, link_token } = parsed.data

  let payload: ReturnType<typeof verifyLinkToken>
  try {
    payload = verifyLinkToken(link_token, useRuntimeConfig().veoLinkTokenSecret)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or expired link token' })
  }
  if (payload.teamId !== team_id) {
    throw createError({ statusCode: 400, statusMessage: 'Link token does not match team_id' })
  }

  try {
    // useUserDb runs as the authenticated caller under RLS — the
    // is_trainer(team_id) policies on both tables are the actual
    // authorization check here, not application code (contracts/rls-policies.md).
    await useUserDb(event, async (tx) => {
      await tx
        .insert(schema.veoTeamMappings)
        .values({ teamId: team_id, veoClubSlug: veo_club_slug, veoTeamSlug: veo_team_slug, enabled: true })
        .onConflictDoUpdate({
          target: schema.veoTeamMappings.teamId,
          set: {
            veoClubSlug: veo_club_slug,
            veoTeamSlug: veo_team_slug,
            enabled: true,
            updatedAt: new Date(),
          },
        })

      await tx
        .insert(schema.veoSyncCredentials)
        .values({ teamId: team_id, sessionCookie: payload.sessionCookie, capturedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.veoSyncCredentials.teamId,
          set: { sessionCookie: payload.sessionCookie, capturedAt: new Date(), updatedAt: new Date() },
        })
    })
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode) throw err
    if (pgError(err).code === '42501') {
      throw createError({ statusCode: 403, statusMessage: 'Only trainers of this team may link it to Veo' })
    }
    console.error('[veo/link] failed', pgError(err).code, pgError(err).message)
    throw createError({ statusCode: 500, statusMessage: 'Could not save Veo link' })
  }

  return { ok: true }
})
