import { expect, test, type Page } from '@playwright/test'
import { fetchLatestMagicLink, signInWithMagicLink } from './helpers/magic-link'

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser console] ${msg.text()}`)
  })
}

test.describe('T110 — team settings page', () => {
  test('trainer edits name, slug and season start; a player is denied', async ({ browser }) => {
    test.setTimeout(180_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-settings-${suffix}@example.com`
    const playerEmail = `player-settings-${suffix}@example.com`
    const teamSlug = `settings-team-${suffix}`
    const newSlug = `settings-team-${suffix}-renamed`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)
    await signInWithMagicLink(trainerPage, trainerEmail)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })
    await trainerPage.getByLabel(/team-name/i).fill(`Settings Team ${suffix}`)
    await trainerPage.getByLabel(/slug/i).fill(teamSlug)
    await trainerPage.getByRole('button', { name: /team gründen/i }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    // Invite + accept a player up front, to exercise the trainer-only guard below.
    await trainerPage.goto(`/t/${teamSlug}/team/members`, { waitUntil: 'networkidle' })
    await trainerPage.getByLabel(/e-mail/i).first().fill(playerEmail)
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

    // Trainer opens settings; the form is pre-filled with the current values.
    await trainerPage.goto(`/t/${teamSlug}/team/settings`, { waitUntil: 'networkidle' })
    await expect(trainerPage.getByTestId('team-settings-page')).toBeVisible()
    await expect(trainerPage.getByTestId('team-settings-name-input')).toHaveValue(
      `Settings Team ${suffix}`,
    )
    await expect(trainerPage.getByTestId('team-settings-slug-input')).toHaveValue(teamSlug)

    // Rename + change the season start; slug stays the same, no redirect.
    const newName = `Settings Team ${suffix} Renamed`
    await trainerPage.getByTestId('team-settings-name-input').fill(newName)
    await trainerPage.getByTestId('team-settings-season-start-input').fill('2026-03-01')
    const submitButton = trainerPage.getByTestId('team-settings-submit')
    await submitButton.click()
    await expect(submitButton).toBeDisabled()
    await expect(submitButton).toBeEnabled()
    await trainerPage.reload({ waitUntil: 'networkidle' })
    await expect(trainerPage.getByTestId('team-settings-name-input')).toHaveValue(newName)
    await expect(trainerPage.getByTestId('team-settings-season-start-input')).toHaveValue(
      '2026-03-01',
    )
    await expect(trainerPage.locator('p', { hasText: newName })).toBeVisible()

    // Changing the slug redirects to the new URL.
    await trainerPage.getByTestId('team-settings-slug-input').fill(newSlug)
    await trainerPage.getByTestId('team-settings-submit').click()
    await trainerPage.waitForURL(new RegExp(`/t/${newSlug}/team/settings$`), { timeout: 15_000 })
    await expect(trainerPage.getByTestId('team-settings-slug-input')).toHaveValue(newSlug)

    // A player is denied and bounced to their own dashboard.
    await playerPage.goto(`/t/${newSlug}/team/settings`, { waitUntil: 'networkidle' })
    await playerPage.waitForURL(new RegExp(`/t/${newSlug}/dashboard$`), { timeout: 15_000 })

    await trainerCtx.close()
    await playerCtx.close()
  })
})
