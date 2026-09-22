import { z } from 'zod'

const authErrorSchema = z.object({
  message: z.string(),
  status: z.number().optional(),
  code: z.string().optional(),
  name: z.string(),
})

const bodySchema = z.object({
  hasHash: z.boolean().optional(),
  hasCode: z.boolean().optional(),
  implicitError: authErrorSchema.optional(),
  pkceError: authErrorSchema.optional(),
})

export default defineEventHandler(async (event) => {
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload' })
  }

  // The payload is only flags plus AuthError name/code/status/message — no
  // tokens — so it is safe to log and is the only way to see WHY the browser
  // could not establish a session.
  console.error('[auth-callback] session could not be established', JSON.stringify(parsed.data))

  return { ok: true }
})
