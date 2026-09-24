import { expect, test, type Page } from '@playwright/test'
import { signInWithMagicLink } from './helpers/magic-link'
import { restGet } from './helpers/supabase-rest'

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser console] ${msg.text()}`)
  })
}

test.describe('trainer manages a player email from the detail page', () => {
  test('add, edit and reject a duplicate email via the inline settings form', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-pde-${suffix}@example.com`
    const teamName = `Det Email Team ${suffix}`
    const teamSlug = `det-email-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)

    await signInWithMagicLink(trainerPage, trainerEmail)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })
    await trainerPage.getByLabel(/team-name/i).fill(teamName)
    await trainerPage.getByLabel(/slug/i).fill(teamSlug)
    await trainerPage.getByRole('button', { name: /team gründen/i }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    // Two unlinked players, created without an email via the roster dialog.
    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    const playerDialog = trainerPage.getByTestId('player-dialog')
    for (const name of ['Erin Email', 'Finn Fehler']) {
      await trainerPage.getByTestId('player-new-button').click()
      await playerDialog.getByLabel('Name').fill(name)
      await trainerPage.getByTestId('player-form-submit').click()
      await expect(playerDialog).toBeHidden()
    }

    const [team] = await restGet<{ id: string }>(`teams?select=id&slug=eq.${teamSlug}`)
    const [erin] = await restGet<{ id: string }>(
      `players?select=id&team_id=eq.${team!.id}&name=eq.${encodeURIComponent('Erin Email')}`,
    )
    const [finn] = await restGet<{ id: string }>(
      `players?select=id&team_id=eq.${team!.id}&name=eq.${encodeURIComponent('Finn Fehler')}`,
    )

    // Add an email to Erin from her detail page — no email set yet.
    await trainerPage.goto(`/t/${teamSlug}/players/${erin!.id}`, { waitUntil: 'networkidle' })
    const erinSettings = trainerPage.getByTestId('player-detail-settings')
    const erinEmail = erinSettings.getByLabel('E-Mail')
    await expect(erinEmail).toHaveValue('')
    await erinEmail.fill(`erin-${suffix}@example.com`)
    await expect(erinSettings.getByTestId('player-form-save-status')).toHaveText('Gespeichert', {
      timeout: 10_000,
    })

    // Persists across a reload.
    await trainerPage.reload({ waitUntil: 'networkidle' })
    await expect(erinSettings.getByLabel('E-Mail')).toHaveValue(`erin-${suffix}@example.com`)

    // Editing to a new address also persists.
    await erinSettings.getByLabel('E-Mail').fill(`erin-new-${suffix}@example.com`)
    await expect(erinSettings.getByTestId('player-form-save-status')).toHaveText('Gespeichert', {
      timeout: 10_000,
    })
    await trainerPage.reload({ waitUntil: 'networkidle' })
    await expect(erinSettings.getByLabel('E-Mail')).toHaveValue(`erin-new-${suffix}@example.com`)

    // Finn tries Erin's address (case-insensitive) — rejected, nothing persisted.
    await trainerPage.goto(`/t/${teamSlug}/players/${finn!.id}`, { waitUntil: 'networkidle' })
    const finnSettings = trainerPage.getByTestId('player-detail-settings')
    await finnSettings.getByLabel('E-Mail').fill(`ERIN-NEW-${suffix}@example.com`)
    await expect(finnSettings.getByRole('alert')).toContainText(/bereits vergeben/i)
    await trainerPage.reload({ waitUntil: 'networkidle' })
    await expect(finnSettings.getByLabel('E-Mail')).toHaveValue('')
  })
})
