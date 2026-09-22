import { z } from 'zod'

// Unauthenticated endpoint whose payload ends up in the server log: keep the
// free-text fields bounded so it cannot be used to flood the log.
const authErrorSchema = z.object({
  message: z.string().max(500),
  status: z.number().optional(),
  code: z.string().max(100).optional(),
  name: z.string().max(100),
})

const bodySchema = z.object({
  hasHash: z.boolean().optional(),
  hasCode: z.boolean().optional(),
  hasSession: z.boolean().optional(),
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
