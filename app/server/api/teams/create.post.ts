import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { serverSupabaseUser } from '#supabase/server'
import { useAdminDb, schema } from '~/server/utils/db'
import { pgError } from '~/server/utils/pg-error'
import { nextUniqueSlug, toSlug } from '~/utils/slug'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(1).max(64).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }
  const { name, slug: requestedSlug } = parsed.data

  const db = useAdminDb()

  const slugBase = requestedSlug ? toSlug(requestedSlug) : toSlug(name)
  if (!slugBase) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Name must contain at least one alphanumeric character',
    })
  }

  const slugExists = async (candidate: string) => {
    const rows = await db
      .select({ id: schema.teams.id })
      .from(schema.teams)
      .where(eq(schema.teams.slug, candidate))
      .limit(1)
    return rows.length > 0
  }

  if (requestedSlug && (await slugExists(slugBase))) {
    throw createError({ statusCode: 409, statusMessage: 'Slug already taken' })
  }

  const slug = requestedSlug ? slugBase : await nextUniqueSlug(slugBase, slugExists)

  try {
    const [row] = await db.execute<{ slug: string }>(
      sql`select slug from public.create_team_with_trainer(${name}, ${slug}, ${userId}::uuid)`,
    )
    return { slug: row?.slug ?? slug }
  } catch (err) {
    const e = pgError(err)
    if (e.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Slug already taken' })
    }
    console.error('[teams/create] failed', e.code, e.constraint_name, e.message)
    throw createError({ statusCode: 500, statusMessage: 'Team creation failed' })
  }
})
