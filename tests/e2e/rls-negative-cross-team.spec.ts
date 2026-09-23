import { expect, test, type Page } from '@playwright/test'
import { fetchLatestMagicLink, signInWithMagicLink } from './helpers/magic-link'
import {
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY,
  SUPABASE_URL,
  restGet,
  restInsert,
} from './helpers/supabase-rest'
import { asUser, decodeJwtSub, getAccessToken } from './helpers/session'

// SC-008/SC-009: no cross-team leak, even by calling PostgREST/Storage
// directly. See contracts/rls-policies.md rows X1..X10.

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser console] ${msg.text()}`)
  })
}

const foundTeam = async (page: Page, teamName: string, teamSlug: string) => {
  await page.waitForURL(/\/start$/, { timeout: 15_000 })
  await page.getByLabel(/team-name/i).fill(teamName)
  await page.getByLabel(/slug/i).fill(teamSlug)
  await page.getByRole('button', { name: /team gründen/i }).click()
  await page.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })
}

// @nuxtjs/supabase persists the session in a non-httpOnly cookie
// `sb-<host>-auth-token` as `base64-<base64(JSON session)>`.

const asAnon = () => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
})

test.describe('RLS negative — cross team (SC-008, SC-009)', () => {
  test('team A members cannot read or write team B data via direct API calls', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const suffix = uniqueSuffix()

    // --- Team A: trainer + player ---
    const trainerAEmail = `trainer-a-${suffix}@example.com`
    const playerAEmail = `player-a-${suffix}@example.com`
    const teamASlug = `rlsx-a-${suffix}`

    const trainerACtx = await browser.newContext()
    const trainerAPage = await trainerACtx.newPage()
    setupPage(trainerAPage)
    await signInWithMagicLink(trainerAPage, trainerAEmail)
    await foundTeam(trainerAPage, `RLS X Team A ${suffix}`, teamASlug)

    await trainerAPage.goto(`/t/${teamASlug}/team/members`, { waitUntil: 'networkidle' })
    await trainerAPage
      .getByLabel(/e-mail/i)
      .first()
      .fill(playerAEmail)
    await trainerAPage.getByLabel(/rolle/i).selectOption('player')
    await trainerAPage.getByRole('button', { name: /einladen/i }).click()
    await expect(trainerAPage.getByText(playerAEmail)).toBeVisible({ timeout: 10_000 })

    const inviteLinkA = await fetchLatestMagicLink(playerAEmail)
    const playerACtx = await browser.newContext()
    const playerAPage = await playerACtx.newPage()
    setupPage(playerAPage)
    await playerAPage.goto(inviteLinkA, { waitUntil: 'networkidle' })
    await playerAPage.getByRole('button', { name: /annehmen/i }).click()
    await playerAPage.waitForURL(new RegExp(`/t/${teamASlug}(/|$)`), { timeout: 15_000 })

    // --- Team B: trainer only, plus seeded data via service role ---
    const trainerBEmail = `trainer-b-${suffix}@example.com`
    const teamBSlug = `rlsx-b-${suffix}`
    const teamBName = `RLS X Team B ${suffix}`

    const trainerBCtx = await browser.newContext()
    const trainerBPage = await trainerBCtx.newPage()
    setupPage(trainerBPage)
    await signInWithMagicLink(trainerBPage, trainerBEmail)
    await foundTeam(trainerBPage, teamBName, teamBSlug)

    const trainerBToken = await getAccessToken(trainerBCtx)
    const trainerBUserId = decodeJwtSub(trainerBToken)

    const [teamB] = await restGet<{ id: string }>(`teams?slug=eq.${teamBSlug}&select=id`)
    const teamBId = teamB!.id
    const [categoryB] = await restInsert<{ id: string }>('point_categories', [
      { team_id: teamBId, name: 'Einsatz', sort_order: 1, value_min: 0, value_max: 5 },
    ])
    const [playerB] = await restInsert<{ id: string }>('players', [
      { team_id: teamBId, name: 'Team B Secret Player', jersey_number: 9, active: true },
    ])
    const today = new Date().toISOString().slice(0, 10)
    const [trainingB] = await restInsert<{ id: string }>('trainings', [
      { team_id: teamBId, date: today, status: 'saved' },
    ])
    await restInsert('point_entries', [
      { training_id: trainingB!.id, player_id: playerB!.id, category_id: categoryB!.id, value: 4 },
    ])
    await restInsert('invitations', [
      {
        team_id: teamBId,
        email: `ghost-${suffix}@example.com`,
        role: 'player',
        token: `tok-${suffix}`,
        invited_by: trainerBUserId,
      },
    ])
    await restInsert('veo_team_mappings', [
      { team_id: teamBId, veo_club_slug: 'x', veo_team_slug: 'y', enabled: true },
    ])

    // Real Storage object under team B's prefix, uploaded with the service
    // role (bypasses RLS — this is fixture setup, not the attack).
    const photoPath = `${teamBId}/${trainingB!.id}/secret.png`
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/training-photos/${photoPath}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'image/png',
        },
        body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      },
    )
    if (!uploadRes.ok) {
      throw new Error(`Seed upload failed: ${uploadRes.status} ${await uploadRes.text()}`)
    }

    const trainerAToken = await getAccessToken(trainerACtx)
    const playerAToken = await getAccessToken(playerACtx)

    // Positive control — both tokens really are authenticated sessions for
    // team A, not a broken/anon fallback that would make every
    // "expect denied/empty" assertion below a false negative.
    const [teamA] = await restGet<{ id: string }>(`teams?slug=eq.${teamASlug}&select=id`)
    for (const token of [trainerAToken, playerAToken]) {
      const control = await trainerACtx.request.get(
        `${SUPABASE_URL}/rest/v1/teams?id=eq.${teamA!.id}&select=id`,
        { headers: asUser(token) },
      )
      expect(control.ok()).toBe(true)
      expect(await control.json()).toEqual([{ id: teamA!.id }])
    }

    const runAttackerChecks = async (token: string) => {
      // X1 / X7 — read team B's players.
      const x1 = await trainerACtx.request.get(
        `${SUPABASE_URL}/rest/v1/players?team_id=eq.${teamBId}`,
        { headers: asUser(token) },
      )
      expect(x1.ok()).toBe(true)
      expect(await x1.json()).toEqual([])

      // X2 — insert a training into team B.
      const x2 = await trainerACtx.request.post(`${SUPABASE_URL}/rest/v1/trainings`, {
        headers: asUser(token),
        data: [{ team_id: teamBId, date: today, status: 'draft' }],
      })
      expect(x2.ok()).toBe(false)

      // X3 — call get_team_ranking for team B.
      const x3 = await trainerACtx.request.post(`${SUPABASE_URL}/rest/v1/rpc/get_team_ranking`, {
        headers: asUser(token),
        data: { p_team: teamBId, p_from: '2000-01-01', p_to: today },
      })
      expect(x3.ok()).toBe(true)
      expect(await x3.json()).toBeNull()

      // X4 — download team B's training photo.
      const x4 = await trainerACtx.request.get(
        `${SUPABASE_URL}/storage/v1/object/training-photos/${photoPath}`,
        { headers: asUser(token) },
      )
      expect(x4.ok()).toBe(false)

      // X5 — read team B's memberships.
      const x5 = await trainerACtx.request.get(
        `${SUPABASE_URL}/rest/v1/memberships?team_id=eq.${teamBId}`,
        { headers: asUser(token) },
      )
      expect(x5.ok()).toBe(true)
      expect(await x5.json()).toEqual([])

      // X6 — read team B's invitations.
      const x6 = await trainerACtx.request.get(
        `${SUPABASE_URL}/rest/v1/invitations?team_id=eq.${teamBId}`,
        { headers: asUser(token) },
      )
      expect(x6.ok()).toBe(true)
      expect(await x6.json()).toEqual([])

      // X11 — link team B to Veo from team A's side (contracts/rls-policies.md V3).
      const x11 = await trainerACtx.request.post(`${SUPABASE_URL}/rest/v1/veo_team_mappings`, {
        headers: asUser(token),
        data: [{ team_id: teamBId, veo_club_slug: 'x', veo_team_slug: 'y' }],
      })
      expect(x11.ok()).toBe(false)

      // X12 — write team B's Veo session credentials from team A's side (V2).
      const x12 = await trainerACtx.request.post(`${SUPABASE_URL}/rest/v1/veo_sync_credentials`, {
        headers: asUser(token),
        data: [{ team_id: teamBId, session_cookie: 'x', captured_at: new Date().toISOString() }],
      })
      expect(x12.ok()).toBe(false)

      // X13 — flip team B's public Veo-Stats visibility switch from team A's
      // side (005-public-veo-ranking, contracts/rls-policies.md W2).
      const x13 = await trainerACtx.request.patch(
        `${SUPABASE_URL}/rest/v1/veo_team_mappings?team_id=eq.${teamBId}`,
        {
          headers: { ...asUser(token), Prefer: 'return=representation' },
          data: { public_stats_enabled: true },
        },
      )
      const x13Body = x13.ok() ? ((await x13.json()) as unknown[]) : []
      expect(x13Body).toHaveLength(0)
    }

    // X1..X6 as TU_A.
    await runAttackerChecks(trainerAToken)
    // X7 — same checks as PU_A.
    await runAttackerChecks(playerAToken)

    // Positive verification for X13 — team B's switch is still off despite
    // both attackers' attempts above.
    const [mappingBAfterAttacks] = await restGet<{ public_stats_enabled: boolean }>(
      `veo_team_mappings?team_id=eq.${teamBId}&select=public_stats_enabled`,
    )
    expect(mappingBAfterAttacks!.public_stats_enabled).toBe(false)

    // W3 (005-public-veo-ranking) — anon cannot select any of the base
    // tables behind get_public_veo_stats directly, only execute the RPC.
    for (const table of ['veo_team_mappings', 'veo_matches', 'veo_player_match_stats']) {
      const res = await trainerACtx.request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
        headers: asAnon(),
      })
      expect(res.ok()).toBe(true)
      expect(await res.json()).toEqual([])
    }

    // X8 — anon reads `teams`.
    const x8 = await trainerACtx.request.get(`${SUPABASE_URL}/rest/v1/teams`, {
      headers: asAnon(),
    })
    expect(x8.ok()).toBe(true)
    expect(await x8.json()).toEqual([])

    // X9 — anon calls get_public_ranking: projection only, no PII.
    const x9 = await trainerACtx.request.post(`${SUPABASE_URL}/rest/v1/rpc/get_public_ranking`, {
      headers: asAnon(),
      data: { p_slug: teamBSlug, p_from: '2000-01-01', p_to: today },
    })
    expect(x9.ok()).toBe(true)
    const x9Body = (await x9.json()) as {
      rows: Array<Record<string, unknown>>
      team_name: string | null
    }
    expect(x9Body.team_name).toBe(teamBName)
    expect(x9Body.rows.length).toBeGreaterThan(0)
    for (const row of x9Body.rows) {
      expect(Object.keys(row).sort()).toEqual(['jersey_number', 'rank_position', 'scores'])
    }
    expect(JSON.stringify(x9Body)).not.toContain('Team B Secret Player')

    // X10 — anon downloads team B's training photo.
    const x10 = await trainerACtx.request.get(
      `${SUPABASE_URL}/storage/v1/object/training-photos/${photoPath}`,
      { headers: asAnon() },
    )
    expect(x10.ok()).toBe(false)

    await trainerACtx.close()
    await playerACtx.close()
    await trainerBCtx.close()
  })
})
