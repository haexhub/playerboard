import { expect, test, type Page } from '@playwright/test'
import { countMailsTo, fetchLatestMagicLink, signInWithMagicLink } from './helpers/magic-link'
import { restGet } from './helpers/supabase-rest'

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

    // Edit (rename) player B and confirm the change is reflected.
    const bRow = rows.filter({ hasText: 'Bruno Bereit' })
    await bRow.getByTestId('player-edit-button').click()
    await expect(playerDialog).toBeVisible()
    const nameInput = playerDialog.getByLabel('Name')
    await expect(nameInput).toHaveValue('Bruno Bereit')
    await nameInput.fill('Bruno Bereit II')
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()
    await expect(rows.filter({ hasText: 'Bruno Bereit II' })).toHaveCount(1)

    // Active-jersey-uniqueness violation: editing Bruno to jersey #7 (Alice's active number) must be rejected.
    const bRowRenamed = rows.filter({ hasText: 'Bruno Bereit II' })
    await bRowRenamed.getByTestId('player-edit-button').click()
    await expect(playerDialog).toBeVisible()
    await playerDialog.getByLabel(/Trikotnummer/).fill('7')
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog.getByRole('alert')).toContainText(/bereits vergeben/i)
    await expect(playerDialog).toBeVisible()
    await trainerPage.getByRole('button', { name: 'Schließen' }).click()
    await expect(playerDialog).toBeHidden()
    // Bruno keeps his original jersey — the rejected edit was not applied.
    await expect(rows.filter({ hasText: 'Bruno Bereit II' })).toContainText('9')

    // Consent toggle inline for Alice.
    const aRow = rows.filter({ hasText: 'Alice Anker' })
    const consentCheckbox = aRow.locator('input[type="checkbox"]')
    await expect(consentCheckbox).not.toBeChecked()
    await consentCheckbox.check()
    await expect(consentCheckbox).toBeChecked()

    // Deactivate Alice — row stays listed, marked inactive, and "Deaktivieren" disappears.
    await aRow.getByRole('button', { name: 'Deaktivieren' }).click()
    await expect(aRow).toContainText('Inaktiv')
    await expect(aRow.getByRole('button', { name: 'Deaktivieren' })).toHaveCount(0)
    await expect(rows).toHaveCount(2)

    // Einladen is disabled with no email on file yet.
    await expect(bRowRenamed.getByTestId('player-invite-button')).toBeDisabled()

    // Add an email via "Bearbeiten" and invite directly from the unified form.
    await bRowRenamed.getByTestId('player-edit-button').click()
    await expect(playerDialog).toBeVisible()
    await playerDialog.getByTestId('player-form-email').fill(inviteeEmail)
    await playerDialog.getByTestId('player-form-send-invite').check()
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()

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

    // Once linked, "Direkt einladen" is gone and an email change requires the
    // account owner's confirmation (US1 acceptance scenario 5/6, FR-005/FR-007).
    await linkedRow.getByTestId('player-edit-button').click()
    await expect(playerDialog).toBeVisible()
    await expect(playerDialog.getByTestId('player-form-send-invite')).toHaveCount(0)

    const newEmail = `nina-new-${uniqueSuffix()}@example.com`
    await playerDialog.getByTestId('player-form-email').fill(newEmail)
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog.getByRole('status')).toContainText(/bestätigung/i)
    // Nothing changed yet — the owner hasn't confirmed anything.
    await expect(playerDialog).toBeVisible()
    await trainerPage.getByRole('button', { name: 'Schließen' }).click()

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

    // Create a player via the roster page, then jump to their detail page.
    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    const playerDialog = trainerPage.getByTestId('player-dialog')
    await trainerPage.getByTestId('player-new-button').click()
    await playerDialog.getByLabel('Name').fill('Dana Detail')
    await playerDialog.getByLabel(/Trikotnummer/).fill('5')
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()

    const [team] = await restGet<{ id: string }>(`teams?select=id&slug=eq.${teamSlug}`)
    const [player] = await restGet<{ id: string }>(
      `players?select=id&team_id=eq.${team!.id}&name=eq.${encodeURIComponent('Dana Detail')}`,
    )

    await trainerPage.goto(`/t/${teamSlug}/players/${player!.id}`, { waitUntil: 'networkidle' })
    await expect(trainerPage.getByTestId('player-detail-page')).toBeVisible()

    // Edit affordance is trainer-visible and pre-fills the current values.
    await trainerPage.getByTestId('player-detail-edit-button').click()
    const editForm = trainerPage.getByTestId('player-detail-edit-form')
    await expect(editForm).toBeVisible()
    await expect(editForm.getByLabel('Name')).toHaveValue('Dana Detail')
    await expect(editForm.getByLabel(/Trikotnummer/)).toHaveValue('5')

    // Change name, jersey number and photo consent, then save.
    await editForm.getByLabel('Name').fill('Dana Detail II')
    await editForm.getByLabel(/Trikotnummer/).fill('6')
    const consentCheckbox = editForm.getByRole('checkbox', { name: 'Foto-Einwilligung' })
    await consentCheckbox.check()
    await trainerPage.getByTestId('player-detail-edit-submit').click()

    await expect(editForm).toBeHidden()
    const heading = trainerPage.getByRole('heading', { level: 1 })
    await expect(heading).toContainText('Dana Detail II')
    await expect(heading).toContainText('#6')
    await expect(trainerPage.getByText('Foto-Einwilligung: Ja')).toBeVisible()

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

    // Add an email later without checking "Direkt einladen" — no invite sent,
    // but the roster's Einladen button becomes available for a later resend.
    const sharedEmail = `shared-${suffix}@example.com`
    await elaRow.getByTestId('player-edit-button').click()
    await expect(playerDialog).toBeVisible()
    await playerDialog.getByTestId('player-form-email').fill(sharedEmail)
    await expect(playerDialog.getByTestId('player-form-send-invite')).toBeEnabled()
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()
    await expect(elaRow.getByTestId('player-invite-button')).toBeEnabled()

    // A second player in the same team cannot reuse that email (case-insensitive).
    await trainerPage.getByTestId('player-new-button').click()
    await expect(playerDialog).toBeVisible()
    await playerDialog.getByLabel('Name').fill('Zwo Zweiter')
    await playerDialog.getByTestId('player-form-email').fill(sharedEmail.toUpperCase())
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

  test('a deactivated player can only be reactivated via the edit dialog', async ({ browser }) => {
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
    await row.getByRole('button', { name: 'Deaktivieren' }).click()
    await expect(row).toContainText('Inaktiv')
    // No "Aktivieren" button ever appears for an inactive row.
    await expect(row.getByRole('button', { name: /^Aktivieren$/ })).toHaveCount(0)

    await row.getByTestId('player-edit-button').click()
    await expect(playerDialog).toBeVisible()
    await playerDialog.getByRole('checkbox', { name: 'Aktiv im Kader' }).check()
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()
    await expect(row).toContainText('Aktiv')

    await trainerCtx.close()
  })
})
