import { z } from 'zod'
import { serverSupabaseUser } from '#supabase/server'
import { requireTrainer, schema, useAdminDb } from '~/server/utils/db'
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

  const db = useAdminDb()
  // Not RLS-enforced: veo_sync_credentials deliberately has no select policy
  // for anyone, so Postgres can't resolve ON CONFLICT DO UPDATE against it
  // under RLS (conflict detection needs row-visibility, which would mean
  // making the credential readable — the one thing this table must never
  // allow). So this write goes through useAdminDb() with the same explicit
  // requireTrainer() check POST /api/veo/login already uses, instead of
  // useUserDb()/RLS. veo_team_mappings is written the same way here so both
  // rows commit atomically in one transaction; its RLS policies are still
  // real and still enforced for any other caller (see contracts/rls-policies.md
  // and the rls-negative-*.spec.ts positive/negative controls).
  try {
    await requireTrainer(db, team_id, user.sub)

    await db.transaction(async (tx) => {
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
    console.error('[veo/link] failed', pgError(err).code, pgError(err).message)
    throw createError({ statusCode: 500, statusMessage: 'Could not save Veo link' })
  }

  return { ok: true }
})
