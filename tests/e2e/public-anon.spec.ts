import { expect, test, type Page } from '@playwright/test'
import { signInWithMagicLink } from './helpers/magic-link'
import {
  anonHeaders,
  SUPABASE_SERVICE_KEY,
  SUPABASE_URL,
  restGet,
  restHeaders,
  restInsert,
} from './helpers/supabase-rest'

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser console] ${msg.text()}`)
  })
}

const seedRankedTeam = async (teamSlug: string): Promise<{ team_id: string; jersey: number }> => {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY missing — required to seed the public ranking fixture')
  }
  const teams = await restGet<{ id: string }>(
    `teams?slug=eq.${encodeURIComponent(teamSlug)}&select=id`,
  )
  if (teams.length === 0) throw new Error(`team ${teamSlug} not found`)
  const team_id = teams[0]!.id

  const [player] = await restInsert<{ id: string }>('players', [
    { team_id, name: 'Secret Name Should Not Leak', jersey_number: 11, active: true },
  ])
  const [category] = await restInsert<{ id: string }>('point_categories', [
    { team_id, name: 'Einsatz', sort_order: 1, value_min: 0, value_max: 5, active: true },
  ])
  const [training] = await restInsert<{ id: string }>('trainings', [
    { team_id, date: new Date().toISOString().slice(0, 10), status: 'saved' },
  ])
  await restInsert('point_entries', [
    { training_id: training!.id, player_id: player!.id, category_id: category!.id, value: 4 },
  ])

  return { team_id, jersey: 11 }
}

test.describe('US5 — anonymous public ranking', () => {
  test('shows jersey + rank + category sums only, hides everything else', async ({ browser }) => {
    test.setTimeout(120_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-pub-${suffix}@example.com`
    const teamName = `US5 Team ${suffix}`
    const teamSlug = `us5-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)

    await signInWithMagicLink(trainerPage, trainerEmail)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })
    await trainerPage.getByLabel(/team-name/i).fill(teamName)
    await trainerPage.getByLabel(/slug/i).fill(teamSlug)
    await trainerPage.getByRole('button', { name: /team gründen/i }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    const { team_id } = await seedRankedTeam(teamSlug)
    await trainerCtx.close()

    // A fresh, session-less context — no sign-in at all.
    const anonCtx = await browser.newContext()
    const anonPage = await anonCtx.newPage()
    setupPage(anonPage)

    await anonPage.goto(`/public/${teamSlug}/ranking`, { waitUntil: 'networkidle' })
    await expect(anonPage.getByTestId('public-ranking-page')).toBeVisible()
    await expect(anonPage.getByText(teamName)).toBeVisible()

    const row = anonPage.getByTestId('public-ranking-row')
    await expect(row).toHaveCount(1)
    await expect(row.locator('th').first()).toHaveText('1') // rank
    const cells = row.locator('td')
    await expect(cells.nth(0)).toHaveText('#11') // jersey
    await expect(cells.nth(1)).toHaveText('4') // "Einsatz" category sum
    await expect(cells.nth(2)).toHaveText('4') // total
    await expect(anonPage.locator('body')).not.toContainText('Secret Name Should Not Leak')

    // 005-public-veo-ranking US3 — Trainingsbewertungen is the default tab,
    // and (with both Veo gates still off) no tab switch renders at all yet.
    await expect(anonPage.getByTestId('public-tab-switch')).toHaveCount(0)
    await expect(anonPage.getByTestId('public-ranking-row')).toHaveCount(1)

    // 005-public-veo-ranking US2 — internal Veo enablement alone is not
    // enough: the tab must stay absent until public_stats_enabled is also on.
    await restInsert('veo_team_mappings', [
      { team_id, veo_club_slug: 'x', veo_team_slug: 'y', enabled: true },
    ])
    await anonPage.reload({ waitUntil: 'networkidle' })
    await expect(anonPage.getByTestId('public-tab-switch')).toHaveCount(0)

    // Both gates on, but no Veo player stats seeded yet: the tab appears,
    // showing the empty state — never a fabricated zero.
    const enableRes = await fetch(
      `${SUPABASE_URL}/rest/v1/veo_team_mappings?team_id=eq.${team_id}`,
      {
        method: 'PATCH',
        headers: { ...restHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify({ public_stats_enabled: true }),
      },
    )
    if (!enableRes.ok) throw new Error(`enable public_stats_enabled failed: ${enableRes.status}`)
    await anonPage.reload({ waitUntil: 'networkidle' })
    await expect(anonPage.getByTestId('public-tab-switch')).toBeVisible()
    await anonPage.getByTestId('public-tab-veo').click()
    await expect(anonPage.getByTestId('public-veo-stats-empty')).toBeVisible()

    // Seed a second jersey number, an in-season match, a pre-season match
    // (must be excluded), and an unmatched jersey number (must never appear).
    const [player11] = await restGet<{ id: string }>(
      `players?team_id=eq.${team_id}&jersey_number=eq.11&select=id`,
    )
    const player11Id = player11!.id
    const [player22] = await restInsert<{ id: string }>('players', [
      { team_id, name: 'Veo Secret Player 22', jersey_number: 22, active: true },
    ])
    const [matchInSeason] = await restInsert<{ id: string }>('veo_matches', [
      {
        team_id,
        veo_match_id: `veo-in-${suffix}`,
        played_at: new Date().toISOString(),
        opponent_name: 'Public Veo Opponent',
        own_score: 1,
        opponent_score: 0,
        home_or_away: 'home',
      },
    ])
    const [matchPreSeason] = await restInsert<{ id: string }>('veo_matches', [
      {
        team_id,
        veo_match_id: `veo-pre-${suffix}`,
        played_at: '2020-01-01T00:00:00.000Z',
        opponent_name: 'Old Season Opponent',
        own_score: 0,
        opponent_score: 0,
        home_or_away: 'away',
      },
    ])
    const [matchSecondInSeason] = await restInsert<{ id: string }>('veo_matches', [
      {
        team_id,
        veo_match_id: `veo-in-second-${suffix}`,
        played_at: new Date().toISOString(),
        opponent_name: 'Public Veo Opponent 2',
        own_score: 2,
        opponent_score: 1,
        home_or_away: 'away',
      },
    ])
    await restInsert('veo_player_match_stats', [
      {
        match_id: matchInSeason!.id,
        veo_jersey_number: 11,
        stat_type: 'distance_total_meters',
        player_id: player11Id,
        category: 'physical',
        value: 5000,
      },
      {
        match_id: matchInSeason!.id,
        veo_jersey_number: 22,
        stat_type: 'sprints_total',
        player_id: player22!.id,
        category: 'physical',
        value: 10,
      },
      {
        match_id: matchInSeason!.id,
        veo_jersey_number: 11,
        stat_type: 'top_speed_kmh',
        player_id: player11Id,
        category: 'physical',
        value: 24,
      },
      {
        match_id: matchInSeason!.id,
        veo_jersey_number: 11,
        stat_type: 'average_speed_kmh',
        player_id: player11Id,
        category: 'physical',
        value: 10,
      },
      {
        match_id: matchSecondInSeason!.id,
        veo_jersey_number: 11,
        stat_type: 'top_speed_kmh',
        player_id: player11Id,
        category: 'physical',
        value: 27,
      },
      {
        match_id: matchSecondInSeason!.id,
        veo_jersey_number: 11,
        stat_type: 'average_speed_kmh',
        player_id: player11Id,
        category: 'physical',
        value: 14,
      },
      // Pre-season: same player (jersey 11), must not contribute to the sum.
      {
        match_id: matchPreSeason!.id,
        veo_jersey_number: 11,
        stat_type: 'distance_total_meters',
        player_id: player11Id,
        category: 'physical',
        value: 999999,
      },
      // Unmatched jersey number — must never appear as a row.
      {
        match_id: matchInSeason!.id,
        veo_jersey_number: 99,
        stat_type: 'football_goal_total',
        player_id: null,
        category: 'attacking',
        value: 3,
      },
    ])

    await anonPage.reload({ waitUntil: 'networkidle' })
    await anonPage.getByTestId('public-tab-veo').click()
    const veoRows = anonPage.getByTestId('public-veo-stats-row')
    await expect(veoRows).toHaveCount(2)
    const jersey11Row = veoRows.filter({ hasText: '#11' })
    await expect(jersey11Row.getByTestId('public-veo-stat-distance_total_meters')).toHaveText(
      '5000',
    )
    await expect(jersey11Row.getByTestId('public-veo-stat-top_speed_kmh')).toHaveText('27')
    await expect(jersey11Row.getByTestId('public-veo-stat-average_speed_kmh')).toHaveText('12')
    const jersey22Row = veoRows.filter({ hasText: '#22' })
    await expect(jersey22Row.getByTestId('public-veo-stat-sprints_total')).toHaveText('10')
    await expect(anonPage.locator('body')).not.toContainText('Veo Secret Player 22')
    await expect(anonPage.locator('body')).not.toContainText('Secret Name Should Not Leak')

    // Direct RPC call: no player_id, no name, only jersey_number + stats.
    const rpcRes = await anonCtx.request.post(`${SUPABASE_URL}/rest/v1/rpc/get_public_veo_stats`, {
      headers: anonHeaders(),
      data: { p_slug: teamSlug },
    })
    expect(rpcRes.ok()).toBe(true)
    const rpcBody = (await rpcRes.json()) as {
      enabled: boolean
      rows: Array<Record<string, unknown>>
    }
    expect(rpcBody.enabled).toBe(true)
    for (const row of rpcBody.rows) {
      expect(Object.keys(row).sort()).toEqual(['jersey_number', 'stats'])
    }
    expect(JSON.stringify(rpcBody)).not.toContain('Veo Secret Player 22')

    // Switching to Veo-Stats and back preserves the Trainingsbewertungen
    // tab's content (US3 regression). Player 22 (added above, purely for
    // the Veo fixture) legitimately gained its own all-zero ranking row, so
    // this checks jersey 11's original row is still intact rather than the
    // total row count.
    await anonPage.getByTestId('public-tab-points').click()
    const jersey11PointsRow = anonPage.getByTestId('public-ranking-row').filter({ hasText: '#11' })
    await expect(jersey11PointsRow.locator('td').nth(1)).toHaveText('4')

    // Unknown slug surfaces a clean not-found state, not an error.
    await anonPage.goto(`/public/does-not-exist-${suffix}/ranking`, { waitUntil: 'networkidle' })
    await expect(anonPage.getByTestId('public-ranking-not-found')).toBeVisible()

    // Direct anon REST access to the underlying table is denied (RLS) —
    // no session cookie, plain anon apikey, exactly what a public visitor's
    // browser could attempt.
    const directRes = await anonCtx.request.get(`${SUPABASE_URL}/rest/v1/point_entries?select=*`, {
      headers: anonHeaders(),
    })
    expect(directRes.ok()).toBe(true)
    expect(await directRes.json()).toEqual([])

    await anonCtx.close()
  })
})
