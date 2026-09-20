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

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser console] ${msg.text()}`)
  })
}

const seedOnePlayer = async (teamSlug: string): Promise<void> => {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY missing — required to seed a player for propagation check')
  }
  const teams = await restGet<{ id: string }>(
    `teams?slug=eq.${encodeURIComponent(teamSlug)}&select=id`,
  )
  if (teams.length === 0) throw new Error(`team ${teamSlug} not found`)
  const team_id = teams[0]!.id
  await restInsert('players', [{ team_id, name: 'Dana Deckung', jersey_number: 4, active: true }])
}

test.describe('US3 — trainer manages point categories', () => {
  test('create, rename, reorder, deactivate; propagates to /trainings/new', async ({ browser }) => {
    test.setTimeout(120_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-cat-${suffix}@example.com`
    const teamName = `US3 Team ${suffix}`
    const teamSlug = `us3-team-${suffix}`

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    setupPage(page)

    // Trainer signs in and founds a fresh team.
    await signInWithMagicLink(page, trainerEmail)
    await page.waitForURL(/\/start$/, { timeout: 15_000 })
    await page.getByLabel(/team-name/i).fill(teamName)
    await page.getByLabel(/slug/i).fill(teamSlug)
    await page.getByRole('button', { name: /team gründen/i }).click()
    await page.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await seedOnePlayer(teamSlug)

    await page.goto(`/t/${teamSlug}/categories`, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('categories-page')).toBeVisible()

    const dialog = page.getByTestId('category-dialog')
    const rows = page.getByTestId('category-row')

    // Create "Einsatz" (sort_order 1).
    await page.getByTestId('category-new-button').click()
    await expect(dialog).toBeVisible()
    await page.getByLabel('Name').fill('Einsatz')
    await page.getByLabel('Reihenfolge').fill('1')
    await page.getByTestId('category-form-submit').click()
    await expect(dialog).toBeHidden()
    await expect(rows).toHaveCount(1)

    // Create "Fairness" (sort_order 2).
    await page.getByTestId('category-new-button').click()
    await expect(dialog).toBeVisible()
    await page.getByLabel('Name').fill('Fairness')
    await page.getByLabel('Reihenfolge').fill('2')
    await page.getByTestId('category-form-submit').click()
    await expect(dialog).toBeHidden()
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('Einsatz')
    await expect(rows.nth(1)).toContainText('Fairness')

    // Rename "Fairness" → "Fairplay".
    await rows.nth(1).getByTestId('category-edit-button').click()
    await expect(dialog).toBeVisible()
    const nameInput = page.getByLabel('Name')
    await expect(nameInput).toHaveValue('Fairness')
    await nameInput.fill('Fairplay')
    await page.getByTestId('category-form-submit').click()
    await expect(dialog).toBeHidden()
    await expect(rows.nth(1)).toContainText('Fairplay')

    // Reorder: move "Fairplay" above "Einsatz".
    await rows.nth(1).getByRole('button', { name: 'Nach oben' }).click()
    await expect(rows.nth(0)).toContainText('Fairplay')
    await expect(rows.nth(1)).toContainText('Einsatz')

    // Deactivate "Einsatz" — stays listed, marked inactive.
    await rows.filter({ hasText: 'Einsatz' }).getByRole('button', { name: 'Deaktivieren' }).click()
    await expect(rows.filter({ hasText: 'Einsatz' })).toContainText('inaktiv')
    await expect(rows).toHaveCount(2)

    // Propagation: new training shows only the active category as a column.
    await page.goto(`/t/${teamSlug}/trainings/new`, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('trainings-new-page')).toBeVisible()
    const grid = page.getByTestId('training-point-grid')
    await expect(grid).toBeVisible()
    await expect(grid.getByRole('columnheader', { name: /Fairplay/ })).toBeVisible()
    await expect(grid.getByRole('columnheader', { name: /^Einsatz/ })).toHaveCount(0)

    await ctx.close()
  })
})
