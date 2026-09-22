import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { schema, useAdminDb } from '~/server/utils/db'

const AUTH_BASE = 'https://auth.veo.co/oidc'
// Public SPA client id used by Veo's own web app — not a secret, it's
// embedded in their publicly served frontend bundle (PKCE, no client secret).
const CLIENT_ID = 'IzRQtXQ07V7n8uBtpTHzi'
const REDIRECT_URI = 'https://app.veo.co/signin-redirect/'

const base64url = (input: Buffer) =>
  input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const generatePkcePair = () => {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

type TokenResponse = { access_token: string; expires_in: number; token_type: string }

/** Exchanges a live `auth.veo.co` session cookie for a short-lived (~1h)
 * bearer access token via silent OIDC re-authentication (`prompt=none`).
 * Shared by `getAccessToken` (DB-stored cookie, used by the daily sync) and
 * the trainer-initiated linking flow (freshly captured cookie, not yet
 * persisted — see `app/server/utils/veo/login.ts`). Throws if the cookie no
 * longer renews (e.g. expired or invalid). */
export const exchangeSessionCookieForToken = async (sessionCookie: string): Promise<string> => {
  const { verifier, challenge } = generatePkcePair()
  const authorizeUrl = new URL(`${AUTH_BASE}/auth`)
  authorizeUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid email phone address profile',
    prompt: 'none',
    state: base64url(randomBytes(16)),
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()

  const authorizeRes = await fetch(authorizeUrl, {
    redirect: 'manual',
    headers: { cookie: sessionCookie },
  })
  const location = authorizeRes.headers.get('location')
  const code = location ? new URL(location, REDIRECT_URI).searchParams.get('code') : null
  if (!code) {
    throw new Error('Veo silent re-authentication failed (session likely expired)')
  }

  const tokenRes = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: verifier,
      client_id: CLIENT_ID,
    }),
  })
  if (!tokenRes.ok) {
    throw new Error(`Veo token exchange failed: ${tokenRes.status}`)
  }
  const token = (await tokenRes.json()) as TokenResponse
  return token.access_token
}

/** Looks up the team's stored session cookie and exchanges it for a bearer
 * access token (see `exchangeSessionCookieForToken`). Used by the daily
 * sync route. Throws if no credentials have been captured yet for this
 * team, or if the stored session no longer renews; the caller records that
 * as a sync failure (see spec.md's Edge Cases: "Veo-Zugang läuft ab"), it
 * does not retry indefinitely. */
export const getAccessToken = async (teamId: string): Promise<string> => {
  const db = useAdminDb()
  const [credentials] = await db
    .select()
    .from(schema.veoSyncCredentials)
    .where(eq(schema.veoSyncCredentials.teamId, teamId))
    .limit(1)
  if (!credentials) {
    throw new Error('No Veo credentials captured for this team yet')
  }
  return exchangeSessionCookieForToken(credentials.sessionCookie)
}
