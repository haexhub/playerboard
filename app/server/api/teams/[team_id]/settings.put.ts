import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useUserDb, schema } from '~/server/utils/db'
import { pgError } from '~/server/utils/pg-error'

const teamIdSchema = z.string().uuid()
const seasonStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [yearValue, monthValue, dayValue] = value.split('-')
    if (!yearValue || !monthValue || !dayValue) return false
    const year = Number(yearValue)
    const month = Number(monthValue)
    const day = Number(dayValue)
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    return year >= 1 && day >= 1 && day <= (daysInMonth ?? 0)
  }, 'Invalid season start date')

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  season_start: seasonStartSchema,
})

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'team_id')
  if (!teamId || !teamIdSchema.safeParse(teamId).success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid team id' })
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }

  try {
    return await useUserDb(event, async (tx) => {
      const [team] = await tx
        .update(schema.teams)
        .set({ name: parsed.data.name, slug: parsed.data.slug })
        .where(eq(schema.teams.id, teamId))
        .returning({ id: schema.teams.id })

      if (!team) {
        throw createError({ statusCode: 403, statusMessage: 'Team update is not permitted' })
      }

      const [settings] = await tx
        .update(schema.teamSettings)
        .set({ seasonStart: parsed.data.season_start })
        .where(eq(schema.teamSettings.teamId, teamId))
        .returning({ teamId: schema.teamSettings.teamId })

      if (!settings) {
        throw createError({ statusCode: 500, statusMessage: 'Team settings row is missing' })
      }

      return { slug: parsed.data.slug }
    })
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode) throw err
    if (pgError(err).code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Slug already taken' })
    }
    console.error('Failed to update team settings', err)
    throw createError({ statusCode: 500, statusMessage: 'Team update failed' })
  }
})
