import { expect, test, type Page } from '@playwright/test'
import { fetchLatestMagicLink, signInWithMagicLink } from './helpers/magic-link'
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
    await playerDialog.getByRole('radio', { name: 'Manuell' }).check()
    await playerDialog.getByLabel('Name').fill('Alice Anker')
    await playerDialog.getByLabel(/Trikotnummer/).fill('7')
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()
    await expect(rows).toHaveCount(1)
    await expect(rows.nth(0)).toContainText('Alice Anker')
    await expect(rows.nth(0)).toContainText('7')

    // Create player B with jersey #9.
    await trainerPage.getByTestId('player-new-button').click()
    await playerDialog.getByRole('radio', { name: 'Manuell' }).check()
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

    // Invite CTA opens the team InviteForm pre-filled with role "player".
    const inviteDialog = trainerPage.getByTestId('player-invite-dialog')
    await bRowRenamed.getByTestId('player-invite-button').click()
    await expect(inviteDialog).toBeVisible()
    await expect(inviteDialog.getByLabel(/rolle/i)).toHaveValue('player')
    await inviteDialog.getByLabel(/e-mail/i).fill(inviteeEmail)
    await inviteDialog.getByRole('button', { name: /einladen/i }).click()
    await expect(inviteDialog).toBeHidden()

    // Invited user accepts and lands in the team's dashboard.
    const inviteLink = await fetchLatestMagicLink(inviteeEmail)
    const inviteeCtx = await browser.newContext()
    const inviteePage = await inviteeCtx.newPage()
    setupPage(inviteePage)
    await inviteePage.goto(inviteLink, { waitUntil: 'networkidle' })
    await expect(inviteePage.getByText(new RegExp(teamName))).toBeVisible({ timeout: 15_000 })
    await inviteePage.getByRole('button', { name: /annehmen/i }).click()
    await inviteePage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    // Trainer links the newly accepted member to Bruno's player row. The invitee has no
    // display name yet, so the candidate dropdown falls back to their user id — with only
    // one unlinked player-role member in this team, selecting the sole real option is
    // unambiguous regardless of its label.
    await trainerPage.reload({ waitUntil: 'networkidle' })
    const bRowFinal = trainerPage.getByTestId('player-row').filter({ hasText: 'Bruno Bereit II' })
    const accountSelect = bRowFinal.getByLabel(/Konto für Bruno Bereit II wählen/)
    await accountSelect.selectOption({ index: 1 })
    await bRowFinal.getByTestId('player-link-button').click()
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

  test('new-player form links an invited-but-unlinked account in one step', async ({ browser }) => {
    test.setTimeout(120_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-cand-${suffix}@example.com`
    const inviteeEmail = `player-cand-${suffix}@example.com`
    const teamName = `Cand Team ${suffix}`
    const teamSlug = `cand-team-${suffix}`

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
    // No player-role member has accepted an invite yet — no candidate picker.
    await expect(playerDialog.getByTestId('player-form-candidate-select')).toHaveCount(0)
    await trainerPage.getByRole('button', { name: 'Schließen' }).click()
    await expect(playerDialog).toBeHidden()

    // Invite a player and have them accept — this creates an unlinked membership.
    // (The players page only offers a per-row "Einladen" CTA once a player row
    // exists; with none yet, use the general team-members invite form instead.)
    await trainerPage.goto(`/t/${teamSlug}/team/members`, { waitUntil: 'networkidle' })
    await trainerPage.getByLabel(/e-mail/i).fill(inviteeEmail)
    await trainerPage.getByLabel(/rolle/i).selectOption('player')
    await trainerPage.getByRole('button', { name: /einladen/i }).click()

    const inviteLink = await fetchLatestMagicLink(inviteeEmail)
    const inviteeCtx = await browser.newContext()
    const inviteePage = await inviteeCtx.newPage()
    setupPage(inviteePage)
    await inviteePage.goto(inviteLink, { waitUntil: 'networkidle' })
    await expect(inviteePage.getByText(new RegExp(teamName))).toBeVisible({ timeout: 15_000 })
    await inviteePage.getByRole('button', { name: /annehmen/i }).click()
    await inviteePage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    // Now the new-player form offers the invited account directly.
    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    await trainerPage.getByTestId('player-new-button').click()
    await expect(playerDialog).toBeVisible()
    await playerDialog.getByRole('radio', { name: 'Bestehendes Konto verknüpfen' }).check()
    const candidateSelect = playerDialog.getByTestId('player-form-candidate-select')
    await expect(candidateSelect).toBeVisible()
    await candidateSelect.selectOption({ index: 1 })
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(playerDialog).toBeHidden()

    const row = trainerPage.getByTestId('player-row')
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('player-linked')).toBeVisible()

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

    // No candidates exist yet — the "link existing account" option isn't offered.
    await expect(
      playerDialog.getByRole('radio', { name: 'Bestehendes Konto verknüpfen' }),
    ).toHaveCount(0)

    await playerDialog.getByRole('radio', { name: 'Per E-Mail einladen' }).check()
    await playerDialog.getByLabel('Name').fill('Nina Neuling')
    await playerDialog.getByLabel(/Trikotnummer/).fill('11')
    await playerDialog.getByTestId('player-form-invite-email').fill(inviteeEmail)
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
    await playerDialog.getByRole('radio', { name: 'Manuell' }).check()
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
})
