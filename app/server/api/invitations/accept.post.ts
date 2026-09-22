import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { serverSupabaseUser } from '#supabase/server'
import { useAdminDb } from '~/server/utils/db'
import { pgError } from '~/server/utils/pg-error'

const bodySchema = z.object({
  token: z.string().min(8).max(128),
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub
  if (!userId || !user.email) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }

  const db = useAdminDb()

  try {
    const [row] = await db.execute<{ slug: string; already_accepted: boolean }>(
      sql`select slug, already_accepted from public.accept_invitation(${parsed.data.token}, ${userId}::uuid, ${user.email})`,
    )
    return {
      slug: row?.slug ?? null,
      alreadyAccepted: row?.already_accepted ?? false,
    }
  } catch (err) {
    const e = pgError(err)
    const msg = e.message ?? ''
    if (/invitation not found/i.test(msg) || e.code === 'P0002') {
      throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
    }
    if (/invitation expired/i.test(msg)) {
      throw createError({ statusCode: 410, statusMessage: 'Invitation expired' })
    }
    if (/email mismatch/i.test(msg)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Invitation email does not match your account',
      })
    }
    console.error('[invitations/accept] failed', e.code, msg)
    throw createError({ statusCode: 500, statusMessage: 'Accept failed' })
  }
})
