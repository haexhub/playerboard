import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { fetchLatestMagicLink, signInWithMagicLink } from './helpers/magic-link'

// SC-003: a player must not be able to perform trainer-only writes, even by
// calling PostgREST/Storage directly — bypassing the UI entirely. See
// contracts/rls-policies.md rows N1..N6.

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const SUPABASE_ANON_KEY =
  process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_KEY ?? ''

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser console] ${msg.text()}`)
  })
}

const restHeaders = () => ({
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
})

const restGet = async <T>(path: string): Promise<T[]> => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: restHeaders() })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as T[]
}

const restInsert = async <T>(table: string, rows: unknown[]): Promise<T[]> => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: restHeaders(),
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`INSERT ${table} failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as T[]
}

// @nuxtjs/supabase persists the session in a non-httpOnly cookie
// `sb-<host>-auth-token` as `base64-<base64(JSON session)>` — read it directly
// rather than re-deriving a session via a second sign-in.
const getAccessToken = async (ctx: BrowserContext): Promise<string> => {
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

const decodeJwtSub = (token: string): string => {
  const payload = token.split('.')[1]!
  const json = Buffer.from(payload, 'base64url').toString('utf-8')
  return (JSON.parse(json) as { sub: string }).sub
}

const asUser = (token: string) => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
})

test.describe('RLS negative — single team (SC-003)', () => {
  test('a player cannot perform trainer-only writes or see draft trainings', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-rlsn-${suffix}@example.com`
    const playerEmail = `player-rlsn-${suffix}@example.com`
    const teamSlug = `rlsn-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)
    await signInWithMagicLink(trainerPage, trainerEmail)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })
    await trainerPage.getByLabel(/team-name/i).fill(`RLS N Team ${suffix}`)
    await trainerPage.getByLabel(/slug/i).fill(teamSlug)
    await trainerPage.getByRole('button', { name: /team gründen/i }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await trainerPage.goto(`/t/${teamSlug}/team/members`, { waitUntil: 'networkidle' })
    await trainerPage
      .getByLabel(/e-mail/i)
      .first()
      .fill(playerEmail)
    await trainerPage.getByLabel(/rolle/i).selectOption('player')
    await trainerPage.getByRole('button', { name: /einladen/i }).click()
    await expect(trainerPage.getByText(playerEmail)).toBeVisible({ timeout: 10_000 })

    const inviteLink = await fetchLatestMagicLink(playerEmail)
    const playerCtx = await browser.newContext()
    const playerPage = await playerCtx.newPage()
    setupPage(playerPage)
    await playerPage.goto(inviteLink, { waitUntil: 'networkidle' })
    await playerPage.getByRole('button', { name: /annehmen/i }).click()
    await playerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    const [team] = await restGet<{ id: string }>(`teams?slug=eq.${teamSlug}&select=id`)
    const teamId = team!.id
    const [category] = await restInsert<{ id: string }>('point_categories', [
      { team_id: teamId, name: 'Einsatz', sort_order: 1, value_min: 0, value_max: 5 },
    ])
    const [rosterPlayer] = await restInsert<{ id: string }>('players', [
      { team_id: teamId, name: 'N-Test Player', jersey_number: 7, active: true },
    ])
    const today = new Date().toISOString().slice(0, 10)
    const [savedTraining] = await restInsert<{ id: string }>('trainings', [
      { team_id: teamId, date: today, status: 'saved' },
    ])
    await restInsert('trainings', [{ team_id: teamId, date: today, status: 'draft' }])

    const playerToken = await getAccessToken(playerCtx)

    // Positive control — the extracted token really is an authenticated
    // session for this player, not a broken/anon fallback that would make
    // every "expect denied/empty" assertion below a false negative.
    const control = await playerCtx.request.get(
      `${SUPABASE_URL}/rest/v1/trainings?id=eq.${savedTraining!.id}&select=id`,
      { headers: asUser(playerToken) },
    )
    expect(control.ok()).toBe(true)
    expect(await control.json()).toEqual([{ id: savedTraining!.id }])

    // N1 — insert into point_entries as the player.
    const n1 = await playerCtx.request.post(`${SUPABASE_URL}/rest/v1/point_entries`, {
      headers: asUser(playerToken),
      data: [
        {
          training_id: savedTraining!.id,
          player_id: rosterPlayer!.id,
          category_id: category!.id,
          value: 3,
        },
      ],
    })
    expect(n1.ok()).toBe(false)
    expect(await restGet(`point_entries?training_id=eq.${savedTraining!.id}`)).toHaveLength(0)

    // N2 — update players set active=false as the player.
    const n2 = await playerCtx.request.patch(
      `${SUPABASE_URL}/rest/v1/players?id=eq.${rosterPlayer!.id}`,
      {
        headers: { ...asUser(playerToken), Prefer: 'return=representation' },
        data: { active: false },
      },
    )
    const n2Body = n2.ok() ? ((await n2.json()) as unknown[]) : []
    expect(n2Body).toHaveLength(0)
    const [refetchedPlayer] = await restGet<{ active: boolean }>(
      `players?id=eq.${rosterPlayer!.id}&select=active`,
    )
    expect(refetchedPlayer!.active).toBe(true)

    // N3 — insert into trainings as the player.
    const n3 = await playerCtx.request.post(`${SUPABASE_URL}/rest/v1/trainings`, {
      headers: asUser(playerToken),
      data: [{ team_id: teamId, date: today, status: 'draft' }],
    })
    expect(n3.ok()).toBe(false)

    // N4 — select drafts as the player: RLS filters them out (empty, not an error).
    const n4 = await playerCtx.request.get(
      `${SUPABASE_URL}/rest/v1/trainings?team_id=eq.${teamId}&status=eq.draft`,
      { headers: asUser(playerToken) },
    )
    expect(n4.ok()).toBe(true)
    expect(await n4.json()).toEqual([])

    // N5 — upload a photo into Storage under <team>/<training>/… as the player.
    const n5 = await playerCtx.request.post(
      `${SUPABASE_URL}/storage/v1/object/training-photos/${teamId}/${savedTraining!.id}/attack.png`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${playerToken}`,
          'Content-Type': 'image/png',
        },
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      },
    )
    expect(n5.ok()).toBe(false)

    // N6 — self-promote to trainer.
    const playerUserId = decodeJwtSub(playerToken)
    const n6 = await playerCtx.request.patch(
      `${SUPABASE_URL}/rest/v1/memberships?user_id=eq.${playerUserId}&team_id=eq.${teamId}`,
      {
        headers: { ...asUser(playerToken), Prefer: 'return=representation' },
        data: { role: 'trainer' },
      },
    )
    const n6Body = n6.ok() ? ((await n6.json()) as unknown[]) : []
    expect(n6Body).toHaveLength(0)
    const [refetchedMembership] = await restGet<{ role: string }>(
      `memberships?user_id=eq.${playerUserId}&team_id=eq.${teamId}&select=role`,
    )
    expect(refetchedMembership!.role).toBe('player')

    await trainerCtx.close()
    await playerCtx.close()
  })
})
