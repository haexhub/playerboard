import { expect, test, type Page } from '@playwright/test'
import { signInWithMagicLink } from './helpers/magic-link'
import { SUPABASE_SERVICE_KEY, restGet, restInsert } from './helpers/supabase-rest'

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser console] ${msg.text()}`)
  })
}

// Smallest possible valid PNG (1×1 transparent pixel).
const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d494441545' +
    '82763fcffff3f0005fe02fefc7f0d3c0000000049454e44ae426082',
  'hex',
)

const seedTeamData = async (teamSlug: string): Promise<{ team_id: string }> => {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY missing — required for US1 seed')
  }
  const teams = await restGet<{ id: string }>(
    `teams?slug=eq.${encodeURIComponent(teamSlug)}&select=id`,
  )
  if (teams.length === 0) throw new Error(`team ${teamSlug} not found`)
  const team_id = teams[0]!.id

  await restInsert('players', [
    { team_id, name: 'Alice Anker', jersey_number: 7, position: 'ST', photo_consent: true },
    { team_id, name: 'Bruno Bereit', jersey_number: 10, position: 'MF', photo_consent: false },
    { team_id, name: 'Chiara Cool', jersey_number: 3, position: 'DF', photo_consent: true },
  ])
  await restInsert('point_categories', [
    { team_id, name: 'Einsatz', sort_order: 1, value_min: 0, value_max: 5, active: true },
    { team_id, name: 'Technik', sort_order: 2, value_min: 0, value_max: 5, active: true },
  ])

  return { team_id }
}

test.describe('US1 — trainer records point entries + at least one photo', () => {
  test('trainer creates draft, enters points, uploads photo, saves', async ({ browser }) => {
    test.setTimeout(180_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-${suffix}@example.com`
    const teamName = `US1 Team ${suffix}`
    const teamSlug = `us1-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const page = await trainerCtx.newPage()
    setupPage(page)

    // Trainer signs in and founds a team.
    await signInWithMagicLink(page, trainerEmail)
    await page.waitForURL(/\/start$/, { timeout: 15_000 })

    await page.getByLabel(/team-name/i).fill(teamName)
    await page.getByLabel(/slug/i).fill(teamSlug)
    await page.getByRole('button', { name: /team gründen/i }).click()
    await page.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    // Seed active players + categories (US3/US4 CRUD not built yet).
    await seedTeamData(teamSlug)

    // Open the training editor.
    await page.goto(`/t/${teamSlug}/trainings/new`, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('trainings-new-page')).toBeVisible()

    // Missing photo consent surfaces as a red icon next to the player's name in the grid.
    const brunoRow = page.locator('tr', { hasText: 'Bruno' })
    await expect(brunoRow.getByTestId('consent-missing-icon')).toBeVisible()
    const aliceRow = page.locator('tr', { hasText: 'Alice' })
    await expect(aliceRow.getByTestId('consent-missing-icon')).toHaveCount(0)

    // Save button is enabled as soon as the draft exists — photos are optional.
    await expect(page.getByTestId('training-save-button')).toBeEnabled({ timeout: 15_000 })

    // Enter one point value → auto-save on blur → input border turns green.
    const aliceEinsatz = page.locator('input[aria-label*="Alice Anker"][aria-label*="Einsatz"]')
    await aliceEinsatz.first().fill('4')
    await aliceEinsatz.first().blur()
    await expect(aliceEinsatz.first()).toHaveClass(/border-green-500/, { timeout: 10_000 })

    // Dedicated stepper buttons update the value and disable at the category bounds.
    const aliceIncrease = page.getByRole('button', { name: 'Alice Anker — Einsatz erhöhen' })
    const aliceDecrease = page.getByRole('button', { name: 'Alice Anker — Einsatz verringern' })
    await aliceIncrease.click()
    await expect(aliceEinsatz.first()).toHaveValue('5')
    await expect(aliceIncrease).toBeDisabled()
    await expect(aliceEinsatz.first()).toHaveClass(/border-green-500/, { timeout: 10_000 })
    await aliceDecrease.click()
    await expect(aliceEinsatz.first()).toHaveValue('4')

    const brunoEinsatz = page.locator('input[aria-label*="Bruno Bereit"][aria-label*="Einsatz"]')
    const brunoDecrease = page.getByRole('button', { name: 'Bruno Bereit — Einsatz verringern' })
    await brunoDecrease.click()
    await expect(brunoEinsatz.first()).toHaveValue('0')
    await expect(brunoDecrease).toBeDisabled()
    await expect(brunoEinsatz.first()).toHaveClass(/border-green-500/, { timeout: 10_000 })

    // Upload one photo — optional, but exercises the storage path.
    await page.getByTestId('photo-upload-input').setInputFiles({
      name: 'training.png',
      mimeType: 'image/png',
      buffer: PNG_1x1,
    })
    await expect(page.getByTestId('photo-empty-hint')).toBeHidden({ timeout: 15_000 })

    // Save and land on the detail page in status "saved".
    await page.getByTestId('training-save-button').click()
    await page.waitForURL(new RegExp(`/t/${teamSlug}/trainings/[0-9a-f-]+`), {
      timeout: 15_000,
    })
    await expect(page.getByTestId('training-status-badge')).toHaveText('Gespeichert')

    // Training list shows the entry.
    await page.goto(`/t/${teamSlug}/trainings`, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('trainings-index-page')).toBeVisible()
    await expect(page.locator('li').filter({ hasText: /Gespeichert/ })).toHaveCount(1)

    await trainerCtx.close()
  })

  test('trainer can save a training without uploading any photo', async ({ browser }) => {
    test.setTimeout(120_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-nophoto-${suffix}@example.com`
    const teamName = `US1 NoPhoto ${suffix}`
    const teamSlug = `us1-nophoto-${suffix}`

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    setupPage(page)

    await signInWithMagicLink(page, trainerEmail)
    await page.waitForURL(/\/start$/, { timeout: 15_000 })
    await page.getByLabel(/team-name/i).fill(teamName)
    await page.getByLabel(/slug/i).fill(teamSlug)
    await page.getByRole('button', { name: /team gründen/i }).click()
    await page.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await seedTeamData(teamSlug)

    await page.goto(`/t/${teamSlug}/trainings/new`, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('training-save-button')).toBeEnabled({ timeout: 15_000 })
    await page.getByTestId('training-save-button').click()
    await page.waitForURL(new RegExp(`/t/${teamSlug}/trainings/[0-9a-f-]+`), {
      timeout: 15_000,
    })
    await expect(page.getByTestId('training-status-badge')).toHaveText('Gespeichert')

    await ctx.close()
  })
})
