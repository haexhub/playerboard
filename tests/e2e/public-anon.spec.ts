import { expect, test, type Page } from '@playwright/test'
import { signInWithMagicLink } from './helpers/magic-link'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const SUPABASE_ANON_KEY =
  process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_KEY ?? ''

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

    await seedRankedTeam(teamSlug)
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

    // Unknown slug surfaces a clean not-found state, not an error.
    await anonPage.goto(`/public/does-not-exist-${suffix}/ranking`, { waitUntil: 'networkidle' })
    await expect(anonPage.getByTestId('public-ranking-not-found')).toBeVisible()

    // Direct anon REST access to the underlying table is denied (RLS) —
    // no session cookie, plain anon apikey, exactly what a public visitor's
    // browser could attempt.
    if (!SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_ANON_KEY missing — required to assert anonymous REST denial')
    }
    const directRes = await anonCtx.request.get(`${SUPABASE_URL}/rest/v1/point_entries?select=*`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    })
    expect(directRes.ok()).toBe(true)
    expect(await directRes.json()).toEqual([])

    await anonCtx.close()
  })
})
