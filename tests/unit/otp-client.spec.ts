import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getOtpClient } from '~/utils/otp-client'

const SUPABASE_URL = 'http://supabase.test'
const ANON_KEY = 'anon-key'

// Sends one OTP request through `client` against a stubbed fetch and returns
// the request URL and JSON body that would have reached GoTrue.
const captureOtpRequest = async (client: SupabaseClient) => {
  const fetchMock = vi.fn(
    async () =>
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', fetchMock)
  await client.auth.signInWithOtp({
    email: 'trainer@example.com',
    options: { emailRedirectTo: 'http://app.test/callback' },
  })
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  return { url: String(url), body: JSON.parse(String(init.body)) as Record<string, unknown> }
}

describe('getOtpClient', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('requests the login mail without a PKCE challenge, so the link works on any device', async () => {
    const { url, body } = await captureOtpRequest(getOtpClient(SUPABASE_URL, ANON_KEY))

    expect(url).toContain('/auth/v1/otp')
    expect(body.email).toBe('trainer@example.com')
    // supabase-js sends explicit nulls when no PKCE flow is in use.
    expect(body.code_challenge).toBeNull()
    expect(body.code_challenge_method).toBeNull()
  })

  it('does not write anything to browser storage', async () => {
    await captureOtpRequest(getOtpClient(SUPABASE_URL, ANON_KEY))

    expect(localStorage.length).toBe(0)
  })

  // Control: proves the assertions above can fail. A PKCE client stores its
  // code verifier locally and sends the matching challenge.
  it('differs from a PKCE client, which sends a challenge and stores a verifier', async () => {
    const pkce = createClient(SUPABASE_URL, ANON_KEY, { auth: { flowType: 'pkce' } })
    const { body } = await captureOtpRequest(pkce)

    expect(body.code_challenge).toBeTruthy()
    expect(localStorage.length).toBeGreaterThan(0)
  })
})
