import { expect, test, type Page } from '@playwright/test'
import { signInWithMagicLink } from './helpers/magic-link'
import {
  anonHeaders,
  SUPABASE_URL,
  restGet,
  restHeaders,
  restInsert,
} from './helpers/supabase-rest'

const restUpsert = async (table: string, onConflict: string, row: unknown): Promise<void> => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { ...restHeaders(), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error(`UPSERT ${table} failed: ${res.status} ${await res.text()}`)
}

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser console] ${msg.text()}`)
  })
}

const foundTeam = async (page: Page, email: string, teamName: string, teamSlug: string) => {
  await signInWithMagicLink(page, email)
  await page.waitForURL(/\/start$/, { timeout: 15_000 })
  await page.getByLabel(/team-name/i).fill(teamName)
  await page.getByLabel(/slug/i).fill(teamSlug)
  await page.getByRole('button', { name: /team gründen/i }).click()
  await page.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })
}

const teamIdForSlug = async (teamSlug: string): Promise<string> => {
  const teams = await restGet<{ id: string }>(
    `teams?slug=eq.${encodeURIComponent(teamSlug)}&select=id`,
  )
  if (teams.length === 0) throw new Error(`team ${teamSlug} not found`)
  return teams[0]!.id
}

const seedMatch = async (
  team_id: string,
  veo_match_id: string,
  opponent_name: string,
  own_score: number,
  opponent_score: number,
  stats: {
    team_association: 'own' | 'opponent'
    stat_type: string
    category: string
    value: number
  }[],
) => {
  const [match] = await restInsert<{ id: string }>('veo_matches', [
    {
      team_id,
      veo_match_id,
      played_at: new Date().toISOString(),
      opponent_name,
      own_score,
      opponent_score,
      home_or_away: 'home',
    },
  ])
  const match_id = match!.id
  await restInsert(
    'veo_match_stats',
    stats.map((s) => ({ match_id, period_values: [], ...s })),
  )
  return match_id
}

test.describe('T003-veo-analytics — Veo camera analytics page', () => {
  test('shows synced match stats for the enabled team, nothing for another team', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const suffix = uniqueSuffix()

    // Team A: gets Veo data seeded.
    const emailA = `veo-a-${suffix}@example.com`
    const slugA = `veo-a-${suffix}`
    const ctxA = await browser.newContext()
    const pageA = await ctxA.newPage()
    setupPage(pageA)
    await foundTeam(pageA, emailA, `Veo A ${suffix}`, slugA)
    const teamIdA = await teamIdForSlug(slugA)
    await restUpsert('veo_team_mappings', 'team_id', {
      team_id: teamIdA,
      veo_club_slug: 'test-club',
      veo_team_slug: 'test-team',
      enabled: true,
    })

    const matchDrawId = await seedMatch(teamIdA, `match-draw-${suffix}`, 'SG Neukirchen', 2, 2, [
      {
        team_association: 'own',
        stat_type: 'football_goal_total',
        category: 'attacking',
        value: 2,
      },
      {
        team_association: 'opponent',
        stat_type: 'football_goal_total',
        category: 'attacking',
        value: 2,
      },
      {
        team_association: 'own',
        stat_type: 'football_corner_total',
        category: 'set_pieces',
        value: 3,
      },
      {
        team_association: 'opponent',
        stat_type: 'football_corner_total',
        category: 'set_pieces',
        value: 1,
      },
    ])
    const matchWinId = await seedMatch(teamIdA, `match-win-${suffix}`, 'FSV Limbach', 9, 0, [
      {
        team_association: 'own',
        stat_type: 'football_goal_total',
        category: 'attacking',
        value: 9,
      },
      {
        team_association: 'opponent',
        stat_type: 'football_goal_total',
        category: 'attacking',
        value: 0,
      },
      {
        team_association: 'own',
        stat_type: 'football_corner_total',
        category: 'set_pieces',
        value: 5,
      },
      {
        team_association: 'opponent',
        stat_type: 'football_corner_total',
        category: 'set_pieces',
        value: 1,
      },
    ])

    // Team B: founded, but nothing Veo-related ever seeded for it.
    const emailB = `veo-b-${suffix}@example.com`
    const slugB = `veo-b-${suffix}`
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    setupPage(pageB)
    await foundTeam(pageB, emailB, `Veo B ${suffix}`, slugB)

    // Team A reaches the page through the menu and sees both matches with the
    // seeded stats, own vs. opponent.
    await pageA.goto(`/t/${slugA}/dashboard`, { waitUntil: 'networkidle' })
    await pageA.getByRole('button', { name: 'Menü öffnen' }).click()
    await pageA.getByRole('link', { name: 'Veo-Analytics' }).click()
    await pageA.waitForURL(new RegExp(`/t/${slugA}/analytics$`))
    await expect(pageA.getByTestId('veo-analytics-page')).toBeVisible()
    const cards = pageA.getByTestId('veo-match-card')
    await expect(cards).toHaveCount(2)
    await expect(pageA.getByText('vs. SG Neukirchen')).toBeVisible()
    await expect(pageA.getByText('vs. FSV Limbach')).toBeVisible()

    const winCard = pageA.getByTestId('veo-match-card').filter({ hasText: 'FSV Limbach' })
    await expect(winCard.getByTestId('veo-match-score')).toHaveText('9:0')
    const winGoals = winCard.getByTestId('veo-stat-football_goal_total')
    await expect(winGoals).toContainText('9')
    await expect(winGoals).toContainText('0')

    // Season summary aggregates both matches: 1 win, 1 draw, 0 losses;
    // own goals 2+9=11, own corners 3+5=8.
    await expect(pageA.getByTestId('veo-season-record')).toContainText('1S 1U 0N')
    await expect(pageA.getByTestId('veo-season-total-football_goal_total')).toHaveText('11')
    await expect(pageA.getByTestId('veo-season-total-football_corner_total')).toHaveText('8')

    // Team B — no team-A data ever leaks, and the empty state shows instead.
    await pageB.goto(`/t/${slugB}/analytics`, { waitUntil: 'networkidle' })
    await expect(pageB.getByTestId('veo-analytics-empty')).toBeVisible()
    await expect(pageB.getByText('SG Neukirchen')).toHaveCount(0)
    await expect(pageB.getByText('FSV Limbach')).toHaveCount(0)

    // Healthy sync status shows the last successful sync time.
    await restUpsert('veo_sync_status', 'team_id', {
      team_id: teamIdA,
      last_attempt_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      consecutive_failures: 0,
    })
    await pageA.reload({ waitUntil: 'networkidle' })
    await expect(pageA.getByTestId('veo-sync-status-ok')).toBeVisible()
    await expect(pageA.getByTestId('veo-sync-status-failing')).toHaveCount(0)

    // Repeated failures replace it with a clear failure hint instead.
    await restUpsert('veo_sync_status', 'team_id', {
      team_id: teamIdA,
      consecutive_failures: 3,
      last_error: 'Veo silent re-authentication failed (session likely expired)',
    })
    await pageA.reload({ waitUntil: 'networkidle' })
    await expect(pageA.getByTestId('veo-sync-status-failing')).toBeVisible()
    await expect(pageA.getByTestId('veo-sync-status-ok')).toHaveCount(0)

    // 004-veo-player-analytics US1/US2 — roster players and Veo player
    // stats, seeded directly (no live Veo call, research.md §15). player7
    // appears in both matches (season sum across matches); player10 only in
    // the win; jersey 99 has no roster match anywhere (must never appear).
    const [player7] = await restInsert<{ id: string }>('players', [
      { team_id: teamIdA, name: 'Jersey Seven', jersey_number: 7, active: true },
    ])
    const [player10] = await restInsert<{ id: string }>('players', [
      { team_id: teamIdA, name: 'Jersey Ten', jersey_number: 10, active: true },
    ])
    const [player23] = await restInsert<{ id: string }>('players', [
      { team_id: teamIdA, name: 'Jersey Twenty-Three', jersey_number: 23, active: true },
    ])
    await restInsert('veo_player_match_stats', [
      {
        match_id: matchDrawId,
        veo_jersey_number: 7,
        stat_type: 'distance_total_meters',
        player_id: player7!.id,
        category: 'physical',
        value: 5000,
      },
      {
        match_id: matchDrawId,
        veo_jersey_number: 7,
        stat_type: 'sprints_total',
        player_id: player7!.id,
        category: 'physical',
        value: 10,
      },
      {
        match_id: matchDrawId,
        veo_jersey_number: 7,
        stat_type: 'top_speed_kmh',
        player_id: player7!.id,
        category: 'physical',
        value: 27.8,
      },
      {
        match_id: matchDrawId,
        veo_jersey_number: 7,
        stat_type: 'average_speed_kmh',
        player_id: player7!.id,
        category: 'physical',
        value: 18.2,
      },
      {
        match_id: matchWinId,
        veo_jersey_number: 7,
        stat_type: 'distance_total_meters',
        player_id: player7!.id,
        category: 'physical',
        value: 6000,
      },
      {
        match_id: matchWinId,
        veo_jersey_number: 7,
        stat_type: 'sprints_total',
        player_id: player7!.id,
        category: 'physical',
        value: 12,
      },
      {
        match_id: matchWinId,
        veo_jersey_number: 7,
        stat_type: 'top_speed_kmh',
        player_id: player7!.id,
        category: 'physical',
        value: 26.1,
      },
      {
        match_id: matchWinId,
        veo_jersey_number: 7,
        stat_type: 'average_speed_kmh',
        player_id: player7!.id,
        category: 'physical',
        value: 19.4,
      },
      {
        match_id: matchWinId,
        veo_jersey_number: 10,
        stat_type: 'seconds_played_total',
        player_id: player10!.id,
        category: 'physical',
        value: 2700,
      },
      // Unmatched jersey number in the draw match — stored, never displayed
      // to a member, until a trainer assigns it (FR-011).
      {
        match_id: matchDrawId,
        veo_jersey_number: 99,
        stat_type: 'football_goal_total',
        player_id: null,
        category: 'attacking',
        value: 3,
      },
    ])

    // US1 — dashboard season summary sums across both matches; the
    // unmatched jersey number never appears.
    await pageA.goto(`/t/${slugA}/dashboard`, { waitUntil: 'networkidle' })
    const seasonRows = pageA.getByTestId('veo-player-season-row')
    await expect(seasonRows).toHaveCount(2)
    const player7SeasonRow = seasonRows.filter({ hasText: '#7' })
    await expect(
      player7SeasonRow.getByTestId(`veo-player-season-stat-${player7!.id}-distance_total_meters`),
    ).toHaveText('11.000')
    await expect(
      player7SeasonRow.getByTestId(`veo-player-season-stat-${player7!.id}-sprints_total`),
    ).toHaveText('22')
    await expect(
      player7SeasonRow.getByTestId(`veo-player-season-stat-${player7!.id}-top_speed_kmh`),
    ).toHaveText('27,8')
    await expect(
      player7SeasonRow.getByTestId(`veo-player-season-stat-${player7!.id}-average_speed_kmh`),
    ).toHaveText('18,8')
    const player10SeasonRow = seasonRows.filter({ hasText: '#10' })
    await expect(
      player10SeasonRow.getByTestId(`veo-player-season-stat-${player10!.id}-seconds_played_total`),
    ).toHaveText('2.700')
    await expect(pageA.locator('body')).not.toContainText('#99')

    // US2 — per-match breakdown on the analytics page; jersey 99 stays
    // invisible there too, as a trainer who hasn't opened the correction UI.
    await pageA.goto(`/t/${slugA}/analytics`, { waitUntil: 'networkidle' })
    const winCardPlayers = pageA
      .getByTestId('veo-match-card')
      .filter({ hasText: 'FSV Limbach' })
      .getByTestId('veo-match-player-row')
    await expect(winCardPlayers).toHaveCount(2)
    const drawCardPlayers = pageA
      .getByTestId('veo-match-card')
      .filter({ hasText: 'SG Neukirchen' })
      .getByTestId('veo-match-player-row')
    await expect(drawCardPlayers).toHaveCount(1)
    await expect(
      drawCardPlayers.getByTestId(`veo-match-player-stat-${player7!.id}-distance_total_meters`),
    ).toHaveText('5000')

    // US3 — trainer correction: assign the unmatched jersey 99 (draw match)
    // to player23, a roster player untouched by any Veo data so far.
    const drawCard = pageA.getByTestId('veo-match-card').filter({ hasText: 'SG Neukirchen' })
    await drawCard.getByTestId('veo-assignment-select-99').selectOption(player23!.id)
    await Promise.all([
      pageA.waitForResponse(
        (res) =>
          res.url().includes(`/api/veo/matches/${matchDrawId}/player-assignment`) &&
          res.request().method() === 'POST',
      ),
      drawCard.getByTestId('veo-assignment-submit-99').click(),
    ])
    await expect(drawCard.getByTestId('veo-assignment-row-99')).toContainText('Jersey Twenty-Three')

    // Trainers can clear an existing assignment by selecting the empty option.
    await drawCard.getByTestId('veo-assignment-select-99').selectOption('')
    await Promise.all([
      pageA.waitForResponse(
        (res) =>
          res.url().includes(`/api/veo/matches/${matchDrawId}/player-assignment`) &&
          res.request().method() === 'POST',
      ),
      drawCard.getByTestId('veo-assignment-submit-99').click(),
    ])
    const [clearedJersey99] = await restGet<{ player_id: string | null }>(
      `veo_player_match_stats?match_id=eq.${matchDrawId}&veo_jersey_number=eq.99&stat_type=eq.football_goal_total&select=player_id`,
    )
    expect(clearedJersey99!.player_id).toBeNull()

    // FR-016 — assigning jersey 99 (same match) to player7, who already
    // holds jersey 7 in this exact match, must clear jersey 7's rows rather
    // than let one player hold two jersey numbers in one match.
    await drawCard.getByTestId('veo-assignment-select-99').selectOption(player7!.id)
    await Promise.all([
      pageA.waitForResponse(
        (res) =>
          res.url().includes(`/api/veo/matches/${matchDrawId}/player-assignment`) &&
          res.request().method() === 'POST',
      ),
      drawCard.getByTestId('veo-assignment-submit-99').click(),
    ])
    const [clearedJersey7] = await restGet<{ player_id: string | null }>(
      `veo_player_match_stats?match_id=eq.${matchDrawId}&veo_jersey_number=eq.7&stat_type=eq.distance_total_meters&select=player_id`,
    )
    expect(clearedJersey7!.player_id).toBeNull()
    const jersey99Rows = await restGet<{ player_id: string | null }>(
      `veo_player_match_stats?match_id=eq.${matchDrawId}&veo_jersey_number=eq.99&select=player_id`,
    )
    expect(jersey99Rows.every((r) => r.player_id === player7!.id)).toBe(true)

    // SC-005 — a simulated re-sync (fresh category/value for the same
    // jersey number, player_id/matched_manually omitted from the payload —
    // exactly the columns sync.post.ts's own upsert sets) must not revert
    // the manual correction.
    const resyncRes = await fetch(
      `${SUPABASE_URL}/rest/v1/veo_player_match_stats?on_conflict=match_id,veo_jersey_number,stat_type`,
      {
        method: 'POST',
        headers: { ...restHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([
          {
            match_id: matchDrawId,
            veo_jersey_number: 99,
            stat_type: 'football_goal_total',
            category: 'attacking',
            value: 4,
          },
        ]),
      },
    )
    if (!resyncRes.ok) throw new Error(`simulated re-sync upsert failed: ${resyncRes.status}`)
    const [resyncedRow] = (await resyncRes.json()) as { player_id: string; value: number }[]
    expect(resyncedRow!.player_id).toBe(player7!.id)
    expect(resyncedRow!.value).toBe(4)

    // 005-public-veo-ranking US1: a trainer flips the public Veo-Stats
    // visibility switch, independent of internal Veo enablement — the RPC's
    // `enabled` field must track only the toggle, not any UI reload.
    const fetchPublicVeoStats = async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_veo_stats`, {
        method: 'POST',
        headers: anonHeaders(),
        body: JSON.stringify({ p_slug: slugA }),
      })
      if (!res.ok) throw new Error(`get_public_veo_stats failed: ${res.status}`)
      return (await res.json()) as { enabled: boolean }
    }

    expect((await fetchPublicVeoStats()).enabled).toBe(false)

    await pageA.goto(`/t/${slugA}/team/veo`, { waitUntil: 'networkidle' })
    const toggleInput = pageA.getByTestId('veo-public-stats-toggle-input')
    await expect(toggleInput).not.toBeChecked()

    // The checkbox flips its DOM state immediately on click; the save is an
    // async Supabase update, so wait for that request to complete before
    // asserting on the server side.
    const waitForMappingSave = () =>
      pageA.waitForResponse(
        (res) =>
          res.url().includes('/rest/v1/veo_team_mappings') && res.request().method() === 'PATCH',
      )

    await Promise.all([waitForMappingSave(), toggleInput.check()])
    await expect(toggleInput).toBeChecked()
    expect((await fetchPublicVeoStats()).enabled).toBe(true)

    await Promise.all([waitForMappingSave(), toggleInput.uncheck()])
    await expect(toggleInput).not.toBeChecked()
    expect((await fetchPublicVeoStats()).enabled).toBe(false)

    await ctxA.close()
    await ctxB.close()
  })
})
