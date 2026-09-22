import type { BrowserContext } from '@playwright/test'
import { anonHeaders } from './supabase-rest'

// @nuxtjs/supabase persists the session in a non-httpOnly cookie
// `sb-<host>-auth-token` as `base64-<base64(JSON session)>` — read it directly
// rather than re-deriving a session via a second sign-in.
export const getAccessToken = async (ctx: BrowserContext): Promise<string> => {
  const cookies = await ctx.cookies()
  const authCookie = cookies.find(
    (c) => /^sb-.+-auth-token$/.test(c.name) && !c.name.includes('code-verifier'),
  )
  if (!authCookie) throw new Error('No Supabase session cookie found — is the user signed in?')
  const raw = authCookie.value.startsWith('base64-')
    ? Buffer.from(authCookie.value.slice('base64-'.length), 'base64').toString('utf-8')
    : authCookie.value
  return (JSON.parse(raw) as { access_token: string }).access_token
}

export const decodeJwtSub = (token: string): string => {
  const payload = token.split('.')[1]!
  const json = Buffer.from(payload, 'base64url').toString('utf-8')
  return (JSON.parse(json) as { sub: string }).sub
}

// A real user JWT still needs the anon apikey for PostgREST to route it.
export const asUser = (token: string) => ({
  ...anonHeaders(),
  Authorization: `Bearer ${token}`,
})
