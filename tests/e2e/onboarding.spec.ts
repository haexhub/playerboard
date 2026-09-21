import { expect, test, type Page } from '@playwright/test'
import { fetchLatestMagicLink, signInWithMagicLink } from './helpers/magic-link'

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser console] ${msg.text()}`)
  })
}

test.describe('US0 — signup, team founding, invitation acceptance', () => {
  test('trainer signs up, founds a team, invites a player who accepts', async ({ browser }) => {
    test.setTimeout(120_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-${suffix}@example.com`
    const playerEmail = `player-${suffix}@example.com`
    const teamName = `Test Team ${suffix}`
    const teamSlug = `test-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)

    await signInWithMagicLink(trainerPage, trainerEmail)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })

    await trainerPage.getByLabel(/team-name/i).fill(teamName)
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

    await expect(playerPage.getByText(new RegExp(teamName))).toBeVisible({ timeout: 15_000 })
    await playerPage.getByRole('button', { name: /annehmen/i }).click()
    await playerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await playerPage.goto('/t/does-not-exist/dashboard', { waitUntil: 'networkidle' })
    await playerPage.waitForURL(/\/start$/, { timeout: 10_000 })

    await trainerCtx.close()
    await playerCtx.close()
  })
})
