import { expect, test, type Page } from '@playwright/test'
import { signInWithMagicLink } from './helpers/magic-link'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

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
  stats: { team_association: 'own' | 'opponent'; stat_type: string; category: string; value: number }[],
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

    await seedMatch(teamIdA, `match-draw-${suffix}`, 'SG Neukirchen', 2, 2, [
      { team_association: 'own', stat_type: 'football_goal_total', category: 'attacking', value: 2 },
      { team_association: 'opponent', stat_type: 'football_goal_total', category: 'attacking', value: 2 },
      { team_association: 'own', stat_type: 'football_corner_total', category: 'set_pieces', value: 3 },
      { team_association: 'opponent', stat_type: 'football_corner_total', category: 'set_pieces', value: 1 },
    ])
    await seedMatch(teamIdA, `match-win-${suffix}`, 'FSV Limbach', 9, 0, [
      { team_association: 'own', stat_type: 'football_goal_total', category: 'attacking', value: 9 },
      { team_association: 'opponent', stat_type: 'football_goal_total', category: 'attacking', value: 0 },
      { team_association: 'own', stat_type: 'football_corner_total', category: 'set_pieces', value: 5 },
      { team_association: 'opponent', stat_type: 'football_corner_total', category: 'set_pieces', value: 1 },
    ])

    // Team B: founded, but nothing Veo-related ever seeded for it.
    const emailB = `veo-b-${suffix}@example.com`
    const slugB = `veo-b-${suffix}`
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    setupPage(pageB)
    await foundTeam(pageB, emailB, `Veo B ${suffix}`, slugB)

    // Team A sees both matches with the seeded stats, own vs. opponent.
    await pageA.goto(`/t/${slugA}/analytics`, { waitUntil: 'networkidle' })
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

    await ctxA.close()
    await ctxB.close()
  })
})
