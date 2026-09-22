import { z } from 'zod'
import { serverSupabaseUser } from '#supabase/server'
import { requireTrainer, useAdminDb } from '~/server/utils/db'
import { captureSessionViaLogin } from '~/server/utils/veo/login'
import { exchangeSessionCookieForToken } from '~/server/utils/veo/auth'
import { listClubTeams, listOwnClubs } from '~/server/utils/veo/client'
import { createLinkToken } from '~/server/utils/veo/linkToken'

const bodySchema = z.object({
  team_id: z.string().uuid(),
  email: z.string().trim().email(),
  password: z.string().min(1),
})

const LINK_TOKEN_TTL_MS = 5 * 60 * 1000

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }
  const { team_id, email, password } = parsed.data

  // No table write happens in this route, so there is nothing for RLS to
  // enforce against yet — this is the one explicit app-level authorization
  // check in this feature (see contracts/rls-policies.md).
  await requireTrainer(useAdminDb(), team_id, userId)

  let sessionCookie: string
  try {
    sessionCookie = await captureSessionViaLogin(email, password)
  } catch (err) {
    throw createError({
      statusCode: 401,
      statusMessage: err instanceof Error ? err.message : 'Veo login failed',
    })
  }

  const accessToken = await exchangeSessionCookieForToken(sessionCookie)
  const clubs = await listOwnClubs(accessToken)
  const clubsWithTeams = await Promise.all(
    clubs.map(async (club) => ({
      club_slug: club.slug,
      club_name: club.name,
      teams: (await listClubTeams(accessToken, club.slug)).map((team) => ({
        team_slug: team.slug,
        team_name: team.name,
      })),
    })),
  )

  const link_token = createLinkToken(
    { teamId: team_id, sessionCookie, exp: Date.now() + LINK_TOKEN_TTL_MS },
    useRuntimeConfig().veoLinkTokenSecret,
  )

  return { clubs: clubsWithTeams, link_token }
})
