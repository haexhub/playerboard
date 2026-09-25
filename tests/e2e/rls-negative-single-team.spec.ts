import { expect, test, type Page } from '@playwright/test'
import { fetchLatestMagicLink, signInWithMagicLink } from './helpers/magic-link'
import { SUPABASE_ANON_KEY, SUPABASE_URL, restGet, restInsert } from './helpers/supabase-rest'
import { asUser, decodeJwtSub, getAccessToken } from './helpers/session'

// SC-003: a player must not be able to perform trainer-only writes, even by
// calling PostgREST/Storage directly — bypassing the UI entirely. See
// contracts/rls-policies.md rows N1..N7.

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser console] ${msg.text()}`)
  })
}

// @nuxtjs/supabase persists the session in a non-httpOnly cookie
// `sb-<host>-auth-token` as `base64-<base64(JSON session)>` — read it directly
// rather than re-deriving a session via a second sign-in.

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

    // N7 — escalate a pending invitation to my own e-mail before accepting it.
    // Acceptance runs only through the service-role accept_invitation(); an
    // invitee has no update policy on invitations at all.
    const [trainerMembership] = await restGet<{ user_id: string }>(
      `memberships?team_id=eq.${teamId}&role=eq.trainer&select=user_id`,
    )
    const [pendingInvitation] = await restInsert<{ id: string }>('invitations', [
      {
        team_id: teamId,
        email: playerEmail,
        role: 'player',
        token: `n7-${suffix}-${'0'.repeat(24)}`,
        invited_by: trainerMembership!.user_id,
      },
    ])
    const n7 = await playerCtx.request.patch(
      `${SUPABASE_URL}/rest/v1/invitations?id=eq.${pendingInvitation!.id}`,
      {
        headers: { ...asUser(playerToken), Prefer: 'return=representation' },
        data: { role: 'trainer' },
      },
    )
    const n7Body = n7.ok() ? ((await n7.json()) as unknown[]) : []
    expect(n7Body).toHaveLength(0)
    const [refetchedInvitation] = await restGet<{ role: string }>(
      `invitations?id=eq.${pendingInvitation!.id}&select=role`,
    )
    expect(refetchedInvitation!.role).toBe('player')

    // N8 — create a point category as the player (pc_write_trainer).
    const n8 = await playerCtx.request.post(`${SUPABASE_URL}/rest/v1/point_categories`, {
      headers: asUser(playerToken),
      data: [{ team_id: teamId, name: 'Selbstlob', sort_order: 99, value_min: 0, value_max: 5 }],
    })
    expect(n8.ok()).toBe(false)

    // N9 — rename a team-mate's profile (user_profiles_update_self is self-only).
    const trainerToken = await getAccessToken(trainerCtx)
    const trainerUserId = decodeJwtSub(trainerToken)
    const n9 = await playerCtx.request.patch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${trainerUserId}`,
      {
        headers: { ...asUser(playerToken), Prefer: 'return=representation' },
        data: { display_name: 'Gekapert' },
      },
    )
    const n9Body = n9.ok() ? ((await n9.json()) as unknown[]) : []
    expect(n9Body).toHaveLength(0)

    // N10 — change team settings through the privileged route as the player.
    const n10 = await playerPage.request.put(`/api/teams/${teamId}/settings`, {
      data: { name: 'Gekapert', slug: `${teamSlug}-hijacked`, season_start: '2026-07-01' },
    })
    expect(n10.status()).toBe(403)

    // N11 — a player (non-trainer) cannot link their own team to Veo; only
    // the trainer can (contracts/rls-policies.md V4).
    const playerMappingInsert = await playerCtx.request.post(
      `${SUPABASE_URL}/rest/v1/veo_team_mappings`,
      {
        headers: asUser(playerToken),
        data: [{ team_id: teamId, veo_club_slug: 'x', veo_team_slug: 'y' }],
      },
    )
    expect(playerMappingInsert.ok()).toBe(false)

    const playerCredInsert = await playerCtx.request.post(
      `${SUPABASE_URL}/rest/v1/veo_sync_credentials`,
      {
        headers: asUser(playerToken),
        data: [{ team_id: teamId, session_cookie: 'x', captured_at: new Date().toISOString() }],
      },
    )
    expect(playerCredInsert.ok()).toBe(false)

    // Positive control for N11 — the trainer of this team really can insert
    // then update (upsert) veo_team_mappings; a broken/overly-strict policy
    // would make N11's "denied" a false positive too (denied because writes
    // are broken for everyone, not because the player specifically lacks
    // permission).
    const trainerMappingInsert = await trainerCtx.request.post(
      `${SUPABASE_URL}/rest/v1/veo_team_mappings`,
      {
        headers: { ...asUser(trainerToken), Prefer: 'return=representation' },
        data: [{ team_id: teamId, veo_club_slug: 'club-x', veo_team_slug: 'team-y' }],
      },
    )
    expect(trainerMappingInsert.ok()).toBe(true)

    const trainerMappingUpdate = await trainerCtx.request.patch(
      `${SUPABASE_URL}/rest/v1/veo_team_mappings?team_id=eq.${teamId}`,
      {
        headers: { ...asUser(trainerToken), Prefer: 'return=representation' },
        data: { veo_team_slug: 'team-z' },
      },
    )
    expect(trainerMappingUpdate.ok()).toBe(true)
    expect(await trainerMappingUpdate.json()).toEqual([
      expect.objectContaining({ veo_team_slug: 'team-z' }),
    ])

    const trainerMappingSelect = await trainerCtx.request.get(
      `${SUPABASE_URL}/rest/v1/veo_team_mappings?team_id=eq.${teamId}&select=veo_team_slug`,
      { headers: asUser(trainerToken) },
    )
    expect(await trainerMappingSelect.json()).toEqual([{ veo_team_slug: 'team-z' }])

    // N13 — veo_sync_credentials denies every authenticated-role operation,
    // even for the trainer of this exact team: it has no policy at all (not
    // even insert/update) since Postgres can't resolve ON CONFLICT/UPDATE
    // row-matching under RLS without a select policy, and adding one just to
    // make writes "work" would defeat the point of this table (see
    // contracts/rls-policies.md). Only useAdminDb() — auth.ts's read,
    // link.post.ts's write — ever touches it.
    const trainerCredInsert = await trainerCtx.request.post(
      `${SUPABASE_URL}/rest/v1/veo_sync_credentials`,
      {
        headers: asUser(trainerToken),
        data: [{ team_id: teamId, session_cookie: 'x', captured_at: new Date().toISOString() }],
      },
    )
    expect(trainerCredInsert.ok()).toBe(false)

    const credRes = await trainerCtx.request.get(
      `${SUPABASE_URL}/rest/v1/veo_sync_credentials?team_id=eq.${teamId}&select=*`,
      { headers: asUser(trainerToken) },
    )
    expect(credRes.ok()).toBe(true)
    expect(await credRes.json()).toEqual([])

    // N14 — a player (non-trainer) cannot even start the Veo linking flow
    // for their own team through the route itself (contracts/rls-policies.md V7).
    const n14 = await playerPage.request.post('/api/veo/login', {
      data: { team_id: teamId, email: 'player@example.com', password: 'whatever' },
    })
    expect(n14.status()).toBe(403)

    // N15 — a player (non-trainer) cannot flip the public Veo-Stats
    // visibility switch (005-public-veo-ranking FR-004). Reuses the
    // veo_team_mappings row the trainer already created above (N11/N13).
    const n15 = await playerCtx.request.patch(
      `${SUPABASE_URL}/rest/v1/veo_team_mappings?team_id=eq.${teamId}`,
      {
        headers: { ...asUser(playerToken), Prefer: 'return=representation' },
        data: { public_stats_enabled: true },
      },
    )
    const n15Body = n15.ok() ? ((await n15.json()) as unknown[]) : []
    expect(n15Body).toHaveLength(0)
    const [refetchedMapping] = await restGet<{ public_stats_enabled: boolean }>(
      `veo_team_mappings?team_id=eq.${teamId}&select=public_stats_enabled`,
    )
    expect(refetchedMapping!.public_stats_enabled).toBe(false)

    // N16 — a player (non-trainer) cannot correct a Veo jersey-number
    // assignment for their own team (004-veo-player-analytics, P4).
    const [veoMatch] = await restInsert<{ id: string }>('veo_matches', [
      {
        team_id: teamId,
        veo_match_id: `n16-${suffix}`,
        played_at: new Date().toISOString(),
        opponent_name: 'N16 Opponent',
        own_score: 1,
        opponent_score: 0,
        home_or_away: 'home',
      },
    ])

    await restInsert('veo_player_match_stats', [
      {
        match_id: veoMatch!.id,
        veo_jersey_number: 7,
        stat_type: 'sprints_total',
        player_id: rosterPlayer!.id,
        category: 'physical',
        value: 10,
      },
      {
        match_id: veoMatch!.id,
        veo_jersey_number: 99,
        stat_type: 'football_goal_total',
        player_id: null,
        category: 'attacking',
        value: 3,
      },
    ])

    // N17 — assigned stats remain visible to every team member, but the raw
    // unassigned correction row is trainer-only (FR-011). The UI filter alone
    // is not sufficient because a player can query PostgREST directly.
    const unassignedQuery = `veo_player_match_stats?match_id=eq.${veoMatch!.id}&select=veo_jersey_number,player_id`
    const playerUnassigned = await playerCtx.request.get(
      `${SUPABASE_URL}/rest/v1/${unassignedQuery}`,
      {
        headers: asUser(playerToken),
      },
    )
    expect(playerUnassigned.ok()).toBe(true)
    expect(await playerUnassigned.json()).toEqual([
      { veo_jersey_number: 7, player_id: rosterPlayer!.id },
    ])

    const trainerUnassigned = await trainerCtx.request.get(
      `${SUPABASE_URL}/rest/v1/${unassignedQuery}`,
      { headers: asUser(trainerToken) },
    )
    expect(trainerUnassigned.ok()).toBe(true)
    expect(await trainerUnassigned.json()).toEqual([
      { veo_jersey_number: 7, player_id: rosterPlayer!.id },
      { veo_jersey_number: 99, player_id: null },
    ])

    const n16 = await playerPage.request.post(
      `/api/veo/matches/${veoMatch!.id}/player-assignment`,
      { data: { team_id: teamId, veo_jersey_number: 7, player_id: null } },
    )
    expect(n16.status()).toBe(403)

    await trainerCtx.close()
    await playerCtx.close()
  })
})
