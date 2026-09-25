import { expect, test, type Page } from '@playwright/test'
import { countMailsTo, fetchLatestMagicLink, signInWithMagicLink } from './helpers/magic-link'
import { restGet, restInsert } from './helpers/supabase-rest'

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser console] ${msg.text()}`)
  })
}

test.describe('US4 — trainer manages the player roster', () => {
  test('CRUD, consent toggle, jersey-uniqueness violation, link via invite', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-plr-${suffix}@example.com`
    const inviteeEmail = `player-plr-${suffix}@example.com`
    const teamName = `US4 Team ${suffix}`
    const teamSlug = `us4-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)

    // Trainer signs in and founds a fresh team.
    await signInWithMagicLink(trainerPage, trainerEmail)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })
    await trainerPage.getByLabel(/team-name/i).fill(teamName)
    await trainerPage.getByLabel(/slug/i).fill(teamSlug)
    await trainerPage.getByRole('button', { name: /team gründen/i }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    await expect(trainerPage.getByTestId('players-page')).toBeVisible()

    const playerDialog = trainerPage.getByTestId('player-dialog')
    const rows = trainerPage.getByTestId('player-row')

    // Create player A with jersey #7.
    await trainerPage.getByTestId('player-new-button').click()
    await expect(playerDialog).toBeVisible()
    await playerDialog.getByLabel('Name').fill('Alice Anker')
    await playerDialog.getByLabel(/Trikotnummer/).fill('7')
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()
    await expect(rows).toHaveCount(1)
    await expect(rows.nth(0)).toContainText('Alice Anker')
    await expect(rows.nth(0)).toContainText('7')

    // Create player B with jersey #9.
    await trainerPage.getByTestId('player-new-button').click()
    await playerDialog.getByLabel('Name').fill('Bruno Bereit')
    await playerDialog.getByLabel(/Trikotnummer/).fill('9')
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()
    await expect(rows).toHaveCount(2)

    // Rename player B from their profile page (the roster row links straight
    // to it — there is no separate edit dialog in the list anymore).
    const bRow = rows.filter({ hasText: 'Bruno Bereit' })
    await bRow.getByRole('link', { name: 'Bruno Bereit' }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}/players/`), { timeout: 15_000 })
    const bSettings = trainerPage.getByTestId('player-detail-settings')
    await expect(bSettings).toBeVisible()
    await bSettings.getByLabel('Name').fill('Bruno Bereit II')
    await expect(bSettings.getByTestId('player-form-save-status')).toHaveText('Gespeichert', {
      timeout: 10_000,
    })

    // Active-jersey-uniqueness violation: editing Bruno to jersey #7 (Alice's active number) must be rejected.
    await bSettings.getByLabel(/Trikotnummer/).fill('7')
    await expect(bSettings.getByRole('alert')).toContainText(/bereits vergeben/i)

    // Bruno keeps his original jersey — the rejected edit was never persisted.
    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    const bRowRenamed = rows.filter({ hasText: 'Bruno Bereit II' })
    await expect(bRowRenamed).toHaveCount(1)
    await expect(bRowRenamed).toContainText('9')

    // Consent toggle inline for Alice.
    const aRow = rows.filter({ hasText: 'Alice Anker' })
    const consentCheckbox = aRow.getByLabel(/Foto-Einwilligung/)
    await expect(consentCheckbox).not.toBeChecked()
    await consentCheckbox.check()
    await expect(consentCheckbox).toBeChecked()

    // Status checkbox deactivates Alice — row stays listed, marked inactive.
    const statusCheckbox = aRow.getByLabel(/Status/)
    await expect(statusCheckbox).toBeChecked()
    await statusCheckbox.uncheck()
    await expect(aRow).toContainText('Inaktiv')
    await expect(rows).toHaveCount(2)

    // Einladen is disabled with no email on file yet.
    await expect(bRowRenamed.getByTestId('player-invite-button')).toBeDisabled()

    // Add an email from Bruno's profile page, then invite directly from the roster.
    await bRowRenamed.getByRole('link', { name: 'Bruno Bereit II' }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}/players/`), { timeout: 15_000 })
    const bSettings2 = trainerPage.getByTestId('player-detail-settings')
    await bSettings2.getByLabel(/E-Mail/).fill(inviteeEmail)
    await expect(bSettings2.getByTestId('player-form-save-status')).toHaveText('Gespeichert', {
      timeout: 10_000,
    })

    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    await rows.filter({ hasText: 'Bruno Bereit II' }).getByTestId('player-invite-button').click()
    await expect(trainerPage.getByText(/gesendet/i)).toBeVisible({ timeout: 10_000 })

    // Invited user accepts and lands in the team's dashboard.
    const inviteLink = await fetchLatestMagicLink(inviteeEmail)
    const inviteeCtx = await browser.newContext()
    const inviteePage = await inviteeCtx.newPage()
    setupPage(inviteePage)
    await inviteePage.goto(inviteLink, { waitUntil: 'networkidle' })
    await expect(inviteePage.getByText(new RegExp(teamName))).toBeVisible({ timeout: 15_000 })
    await inviteePage.getByRole('button', { name: /annehmen/i }).click()
    await inviteePage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    // Because the invite was issued with this player's id (research.md §3),
    // accepting it auto-links Bruno immediately — no manual "Verknüpfen" step
    // needed, unlike the old generic (row-agnostic) invite dialog.
    await trainerPage.reload({ waitUntil: 'networkidle' })
    const bRowFinal = trainerPage.getByTestId('player-row').filter({ hasText: 'Bruno Bereit II' })
    await expect(bRowFinal.getByTestId('player-linked')).toBeVisible({ timeout: 10_000 })

    // Changing the membership role clears the player link atomically.
    await trainerPage.goto(`/t/${teamSlug}/team/members`, { waitUntil: 'networkidle' })
    const memberRow = trainerPage.locator('li').filter({
      has: trainerPage.locator('option:checked').filter({ hasText: /^Spieler$/ }),
    })
    await expect(memberRow).toHaveCount(1)
    await memberRow.locator('select').selectOption('trainer')

    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    const unlinkedBruno = trainerPage
      .getByTestId('player-row')
      .filter({ hasText: 'Bruno Bereit II' })
    await expect(unlinkedBruno.getByTestId('player-linked')).toHaveCount(0)
    await expect(unlinkedBruno.getByLabel(/Konto für Bruno Bereit II wählen/)).toHaveCount(0)

    await trainerCtx.close()
    await inviteeCtx.close()
  })

  test('new-player form invites a not-yet-existing account and auto-links it on acceptance', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-inv-${suffix}@example.com`
    const inviteeEmail = `player-inv-${suffix}@example.com`
    const teamName = `Inv Team ${suffix}`
    const teamSlug = `inv-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)

    await signInWithMagicLink(trainerPage, trainerEmail)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })
    await trainerPage.getByLabel(/team-name/i).fill(teamName)
    await trainerPage.getByLabel(/slug/i).fill(teamSlug)
    await trainerPage.getByRole('button', { name: /team gründen/i }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    await trainerPage.getByTestId('player-new-button').click()
    const playerDialog = trainerPage.getByTestId('player-dialog')
    await expect(playerDialog).toBeVisible()

    // The dialog is a single flat form — no mode radio, no "Bestehendes Konto
    // verknüpfen" option at all anymore (research.md §6).
    await expect(playerDialog.getByRole('radio')).toHaveCount(0)

    await playerDialog.getByLabel('Name').fill('Nina Neuling')
    await playerDialog.getByLabel(/Trikotnummer/).fill('11')
    await playerDialog.getByTestId('player-form-email').fill(inviteeEmail)
    await playerDialog.getByTestId('player-form-send-invite').check()
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()

    // Player row exists immediately, not yet linked (invite still pending).
    const row = trainerPage.getByTestId('player-row').filter({ hasText: 'Nina Neuling' })
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('player-linked')).toHaveCount(0)

    // Invitee accepts — the pre-created player row links automatically, no
    // manual "Verknüpfen" step needed.
    const inviteLink = await fetchLatestMagicLink(inviteeEmail)
    const inviteeCtx = await browser.newContext()
    const inviteePage = await inviteeCtx.newPage()
    setupPage(inviteePage)
    await inviteePage.goto(inviteLink, { waitUntil: 'networkidle' })
    await expect(inviteePage.getByText(new RegExp(teamName))).toBeVisible({ timeout: 15_000 })
    await inviteePage.getByRole('button', { name: /annehmen/i }).click()
    await inviteePage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    const linkedRow = trainerPage.getByTestId('player-row').filter({ hasText: 'Nina Neuling' })
    await expect(linkedRow.getByTestId('player-linked')).toBeVisible({ timeout: 10_000 })

    // Once linked, an email change requires the account owner's confirmation
    // (US1 acceptance scenario 5/6, FR-005/FR-007) — exercised from the profile page.
    await linkedRow.getByRole('link', { name: 'Nina Neuling' }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}/players/`), { timeout: 15_000 })
    const settings = trainerPage.getByTestId('player-detail-settings')
    await expect(settings).toBeVisible()

    const newEmail = `nina-new-${uniqueSuffix()}@example.com`
    await settings.getByLabel(/E-Mail/).fill(newEmail)
    await expect(settings.getByRole('status')).toContainText(/bestätigung/i, { timeout: 10_000 })
    // Nothing changed yet — the owner hasn't confirmed anything.

    // The linked account owner (still signed in as inviteePage) sees and acts
    // on the pending request from their own profile page.
    await inviteePage.goto('/profile', { waitUntil: 'networkidle' })
    const pendingCard = inviteePage.getByTestId('pending-email-change-card')
    await expect(pendingCard).toBeVisible({ timeout: 10_000 })
    await expect(pendingCard).toContainText(newEmail)
    await pendingCard.getByTestId('pending-email-change-start').click()

    // Supabase's Secure Email Change sends one confirmation to each address;
    // both must be visited before Auth reports the new email.
    const oldAddressLink = await fetchLatestMagicLink(inviteeEmail)
    const newAddressLink = await fetchLatestMagicLink(newEmail)
    await inviteePage.goto(oldAddressLink, { waitUntil: 'networkidle' })
    await inviteePage.goto(newAddressLink, { waitUntil: 'networkidle' })

    await inviteePage.goto('/profile', { waitUntil: 'networkidle' })
    await expect(pendingCard).toBeVisible({ timeout: 10_000 })
    await pendingCard.getByTestId('pending-email-change-finish').click()
    await expect(inviteePage.getByTestId('pending-email-change-card')).toContainText(
      /aktualisiert/i,
      { timeout: 10_000 },
    )

    await trainerCtx.close()
    await inviteeCtx.close()
  })

  test('team-members invite form also creates + auto-links a player when a name is given', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-mem-${suffix}@example.com`
    const inviteeEmail = `player-mem-${suffix}@example.com`
    const teamName = `Mem Team ${suffix}`
    const teamSlug = `mem-team-${suffix}`

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
    // Role defaults to "player" — the optional roster fields are already visible.
    await trainerPage
      .getByLabel(/e-mail/i)
      .first()
      .fill(inviteeEmail)
    await trainerPage.getByLabel('Name').fill('Malik Muster')
    await trainerPage.getByLabel(/Trikotnummer/).fill('23')
    await trainerPage.getByRole('button', { name: /einladen/i }).click()
    await expect(trainerPage.getByText(inviteeEmail)).toBeVisible({ timeout: 10_000 })

    // Player row was created immediately, not yet linked.
    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    const row = trainerPage.getByTestId('player-row').filter({ hasText: 'Malik Muster' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('23')
    await expect(row.getByTestId('player-linked')).toHaveCount(0)

    const inviteLink = await fetchLatestMagicLink(inviteeEmail)
    const inviteeCtx = await browser.newContext()
    const inviteePage = await inviteeCtx.newPage()
    setupPage(inviteePage)
    await inviteePage.goto(inviteLink, { waitUntil: 'networkidle' })
    await expect(inviteePage.getByText(new RegExp(teamName))).toBeVisible({ timeout: 15_000 })
    await inviteePage.getByRole('button', { name: /annehmen/i }).click()
    await inviteePage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    const linkedRow = trainerPage.getByTestId('player-row').filter({ hasText: 'Malik Muster' })
    await expect(linkedRow.getByTestId('player-linked')).toBeVisible({ timeout: 10_000 })

    await trainerCtx.close()
    await inviteeCtx.close()
  })

  test('trainer edits player settings inline from the detail page', async ({ browser }) => {
    test.setTimeout(90_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-det-${suffix}@example.com`
    const teamName = `Det Team ${suffix}`
    const teamSlug = `det-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)

    await signInWithMagicLink(trainerPage, trainerEmail)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })
    await trainerPage.getByLabel(/team-name/i).fill(teamName)
    await trainerPage.getByLabel(/slug/i).fill(teamSlug)
    await trainerPage.getByRole('button', { name: /team gründen/i }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    // Create a player via the roster page, then follow the roster's name link to their detail page.
    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    const playerDialog = trainerPage.getByTestId('player-dialog')
    await trainerPage.getByTestId('player-new-button').click()
    await playerDialog.getByLabel('Name').fill('Dana Detail')
    await playerDialog.getByLabel(/Trikotnummer/).fill('5')
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()

    await trainerPage
      .getByTestId('player-row')
      .filter({ hasText: 'Dana Detail' })
      .getByRole('link', { name: 'Dana Detail' })
      .click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}/players/`), { timeout: 15_000 })
    await expect(trainerPage.getByTestId('player-detail-page')).toBeVisible()

    // Settings are always visible for trainers, pre-filled with the current values — no edit toggle.
    const settings = trainerPage.getByTestId('player-detail-settings')
    await expect(settings).toBeVisible()
    await expect(settings.getByLabel('Name')).toHaveValue('Dana Detail')
    await expect(settings.getByLabel(/Trikotnummer/)).toHaveValue('5')

    // Change name, jersey number and photo consent — changes save automatically, no Speichern button.
    await settings.getByLabel('Name').fill('Dana Detail II')
    await settings.getByLabel(/Trikotnummer/).fill('6')
    const consentCheckbox = settings.getByRole('checkbox', { name: 'Foto-Einwilligung' })
    await consentCheckbox.check()
    await expect(settings.getByTestId('player-form-save-status')).toHaveText('Gespeichert', {
      timeout: 10_000,
    })

    const heading = trainerPage.getByRole('heading', { level: 1 })
    await expect(heading).toContainText('Dana Detail II')
    await expect(heading).toContainText('#6')
    await expect(consentCheckbox).toBeChecked()

    // Consistency with the roster page: the same record reflects the change there too.
    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    await expect(
      trainerPage.getByTestId('player-row').filter({ hasText: 'Dana Detail II' }),
    ).toContainText('6')

    await trainerCtx.close()
  })

  test('email is optional on create, becomes invitable once added, and is unique per team', async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-eml-${suffix}@example.com`
    const teamName = `Eml Team ${suffix}`
    const teamSlug = `eml-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)

    await signInWithMagicLink(trainerPage, trainerEmail)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })
    await trainerPage.getByLabel(/team-name/i).fill(teamName)
    await trainerPage.getByLabel(/slug/i).fill(teamSlug)
    await trainerPage.getByRole('button', { name: /team gründen/i }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    const playerDialog = trainerPage.getByTestId('player-dialog')
    const rows = trainerPage.getByTestId('player-row')

    // Create with no email at all — no invite option, no error.
    await trainerPage.getByTestId('player-new-button').click()
    await expect(playerDialog).toBeVisible()
    await expect(playerDialog.getByTestId('player-form-send-invite')).toBeDisabled()
    await playerDialog.getByLabel('Name').fill('Ela Erst')
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()
    const elaRow = rows.filter({ hasText: 'Ela Erst' })
    await expect(elaRow).toHaveCount(1)
    await expect(elaRow.getByTestId('player-invite-button')).toBeDisabled()

    // Add an email later from the profile page — the profile editor never
    // sends an invite itself, but the roster's Einladen button becomes
    // available for a later send.
    const sharedEmail = `shared-${suffix}@example.com`
    await elaRow.getByRole('link', { name: 'Ela Erst' }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}/players/`), { timeout: 15_000 })
    let settings = trainerPage.getByTestId('player-detail-settings')
    await settings.getByLabel(/E-Mail/).fill(sharedEmail)
    await expect(settings.getByTestId('player-form-save-status')).toHaveText('Gespeichert', {
      timeout: 10_000,
    })
    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    await expect(elaRow.getByTestId('player-invite-button')).toBeEnabled()

    // Changing an unlinked player's email also updates an already-open invite.
    const [team] = await restGet<{ id: string }>(`teams?select=id&slug=eq.${teamSlug}`)
    const [ela] = await restGet<{ id: string }>(
      `players?select=id&team_id=eq.${team!.id}&name=eq.Ela%20Erst`,
    )
    await elaRow.getByTestId('player-invite-button').click()
    await expect(trainerPage.getByText(/gesendet/i)).toBeVisible()
    await expect.poll(() => countMailsTo(sharedEmail)).toBe(1)
    await fetchLatestMagicLink(sharedEmail)
    const [oldInvitation] = await restGet<{ email: string; token: string }>(
      `invitations?select=email,token&player_id=eq.${ela!.id}&accepted_at=is.null`,
    )

    const replacementEmail = `replacement-${suffix}@example.com`
    await elaRow.getByRole('link', { name: 'Ela Erst' }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}/players/`), { timeout: 15_000 })
    settings = trainerPage.getByTestId('player-detail-settings')
    await settings.getByLabel(/E-Mail/).fill(replacementEmail)
    await expect(settings.getByTestId('player-form-save-status')).toHaveText('Gespeichert', {
      timeout: 10_000,
    })
    const [newInvitation] = await restGet<{ email: string; token: string }>(
      `invitations?select=email,token&player_id=eq.${ela!.id}&accepted_at=is.null`,
    )
    expect(newInvitation!.email).toBe(replacementEmail)
    expect(newInvitation!.token).not.toBe(oldInvitation!.token)
    expect(await countMailsTo(replacementEmail)).toBe(0)

    // A second player in the same team cannot reuse that email (case-insensitive).
    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    await trainerPage.getByTestId('player-new-button').click()
    await expect(playerDialog).toBeVisible()
    await playerDialog.getByLabel('Name').fill('Zwo Zweiter')
    await playerDialog.getByTestId('player-form-email').fill(replacementEmail.toUpperCase())
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog.getByRole('alert')).toBeVisible()
    await expect(playerDialog).toBeVisible()
    await trainerPage.getByRole('button', { name: 'Schließen' }).click()
    await expect(rows.filter({ hasText: 'Zwo Zweiter' })).toHaveCount(0)

    await trainerCtx.close()
  })

  test('list "Einladen" sends directly without a dialog and resends while still open', async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-lst-${suffix}@example.com`
    const inviteeEmail = `invitee-lst-${suffix}@example.com`
    const teamName = `Lst Team ${suffix}`
    const teamSlug = `lst-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)

    await signInWithMagicLink(trainerPage, trainerEmail)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })
    await trainerPage.getByLabel(/team-name/i).fill(teamName)
    await trainerPage.getByLabel(/slug/i).fill(teamSlug)
    await trainerPage.getByRole('button', { name: /team gründen/i }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    const playerDialog = trainerPage.getByTestId('player-dialog')
    await trainerPage.getByTestId('player-new-button').click()
    await playerDialog.getByLabel('Name').fill('Liam Liste')
    await playerDialog.getByTestId('player-form-email').fill(inviteeEmail)
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()

    const row = trainerPage.getByTestId('player-row').filter({ hasText: 'Liam Liste' })
    const inviteButton = row.getByTestId('player-invite-button')
    await expect(inviteButton).toBeEnabled()
    await inviteButton.click()
    // No dialog ever opens for this action.
    await expect(trainerPage.getByTestId('player-invite-dialog')).toHaveCount(0)
    await expect.poll(() => countMailsTo(inviteeEmail)).toBe(1)
    const firstLink = await fetchLatestMagicLink(inviteeEmail)

    // Resend while the invitation is still open (not yet accepted) succeeds.
    await new Promise((resolve) => setTimeout(resolve, 1200))
    await inviteButton.click()
    await expect(trainerPage.getByText(/gesendet/i)).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => countMailsTo(inviteeEmail)).toBe(1)
    const secondLink = await fetchLatestMagicLink(inviteeEmail)
    expect(secondLink).not.toBe(firstLink)

    await trainerCtx.close()
  })

  test('roster status checkbox activates and deactivates a player in both directions', async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-react-${suffix}@example.com`
    const teamName = `React Team ${suffix}`
    const teamSlug = `react-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)

    await signInWithMagicLink(trainerPage, trainerEmail)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })
    await trainerPage.getByLabel(/team-name/i).fill(teamName)
    await trainerPage.getByLabel(/slug/i).fill(teamSlug)
    await trainerPage.getByRole('button', { name: /team gründen/i }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    const playerDialog = trainerPage.getByTestId('player-dialog')
    await trainerPage.getByTestId('player-new-button').click()
    await playerDialog.getByLabel('Name').fill('Reo Reaktiv')
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()

    const row = trainerPage.getByTestId('player-row').filter({ hasText: 'Reo Reaktiv' })
    const statusCheckbox = row.getByLabel(/Status/)
    await expect(statusCheckbox).toBeChecked()
    await expect(row).toContainText('Aktiv')

    await statusCheckbox.uncheck()
    await expect(row).toContainText('Inaktiv')

    await statusCheckbox.check()
    await expect(row).toContainText('Aktiv')

    await trainerCtx.close()
  })

  test('a player with no recorded points can be deleted from the roster', async ({ browser }) => {
    test.setTimeout(60_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-del-${suffix}@example.com`
    const teamName = `Del Team ${suffix}`
    const teamSlug = `del-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)

    await signInWithMagicLink(trainerPage, trainerEmail)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })
    await trainerPage.getByLabel(/team-name/i).fill(teamName)
    await trainerPage.getByLabel(/slug/i).fill(teamSlug)
    await trainerPage.getByRole('button', { name: /team gründen/i }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    const playerDialog = trainerPage.getByTestId('player-dialog')
    await trainerPage.getByTestId('player-new-button').click()
    await playerDialog.getByLabel('Name').fill('Lena Löschbar')
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()

    const row = trainerPage.getByTestId('player-row').filter({ hasText: 'Lena Löschbar' })
    await row.getByTestId('player-delete-button').click()
    const deleteDialog = trainerPage.getByTestId('player-delete-dialog')
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByTestId('player-delete-confirm-button').click()
    await expect(deleteDialog).toBeHidden()
    await expect(row).toHaveCount(0)

    await trainerCtx.close()
  })

  test('deleting a player with recorded points is rejected; deactivation is offered instead', async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-delh-${suffix}@example.com`
    const teamName = `Delh Team ${suffix}`
    const teamSlug = `delh-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)

    await signInWithMagicLink(trainerPage, trainerEmail)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })
    await trainerPage.getByLabel(/team-name/i).fill(teamName)
    await trainerPage.getByLabel(/slug/i).fill(teamSlug)
    await trainerPage.getByRole('button', { name: /team gründen/i }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    const [team] = await restGet<{ id: string }>(`teams?select=id&slug=eq.${teamSlug}`)
    const [player] = await restInsert<{ id: string }>('players', [
      { team_id: team!.id, name: 'Hanna History', active: true },
    ])
    const [category] = await restInsert<{ id: string }>('point_categories', [
      { team_id: team!.id, name: 'Einsatz', sort_order: 1, value_min: 0, value_max: 10 },
    ])
    const [training] = await restInsert<{ id: string }>('trainings', [
      { team_id: team!.id, date: new Date().toISOString().slice(0, 10), status: 'saved' },
    ])
    await restInsert('point_entries', [
      { training_id: training!.id, player_id: player!.id, category_id: category!.id, value: 5 },
    ])

    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    const row = trainerPage.getByTestId('player-row').filter({ hasText: 'Hanna History' })
    await row.getByTestId('player-delete-button').click()
    const deleteDialog = trainerPage.getByTestId('player-delete-dialog')
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByTestId('player-delete-confirm-button').click()
    await expect(deleteDialog.getByRole('alert')).toContainText(/deaktivieren/i)
    await expect(deleteDialog).toBeVisible()
    await trainerPage.getByRole('button', { name: 'Abbrechen' }).click()
    await expect(row).toHaveCount(1)

    await trainerCtx.close()
  })
})
