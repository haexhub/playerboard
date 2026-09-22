import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { countMailsTo, fetchLatestMagicLink, signInWithMagicLink } from './helpers/magic-link'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL } from './helpers/supabase-rest'

// Invitation mails against the local Supabase stack + Mailpit. Guards the
// invitation endpoints: DB failures must map to their intended HTTP status
// (409/404/410/403) and the UI must always show the outcome instead of
// staying silent.

const DUPLICATE_MESSAGE = 'An open invitation for this email already exists'

// The mail link is GoTrue's verify URL; the app page it lands on is `redirect_to`.
const redirectTargetOf = (link: string): URL => {
  const redirectTo = new URL(link).searchParams.get('redirect_to')
  if (!redirectTo) throw new Error(`Mail link has no redirect_to: ${link}`)
  return new URL(redirectTo)
}

const inviteTokenOf = (link: string): string => {
  const target = redirectTargetOf(link).searchParams.get('redirect') ?? ''
  const match = target.match(/^\/invite\/([\w-]+)$/)
  if (!match?.[1]) throw new Error(`Mail link does not lead to an invitation: ${link}`)
  return match[1]
}

const submitInvite = async (page: Page, email: string) => {
  await page
    .getByLabel(/e-mail/i)
    .first()
    .fill(email)
  await page.getByLabel(/rolle/i).selectOption('player')
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/invitations/issue') && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: /einladen/i }).click(),
  ])
  return response
}

const acceptViaApi = async (ctx: BrowserContext, token: string) => {
  const res = await ctx.request.post('/api/invitations/accept', { data: { token } })
  return { status: res.status(), body: (await res.json()) as { statusMessage?: string } }
}

test.describe('invitation mail — trainer invites, Mailpit receives, invitee accepts', () => {
  let trainerCtx: BrowserContext
  let trainerPage: Page
  let suffix: string
  let teamName: string
  let teamSlug: string

  const gotoMembers = () =>
    trainerPage.goto(`/t/${teamSlug}/team/members`, { waitUntil: 'networkidle' })

  const inviteAndGetToken = async (email: string): Promise<string> => {
    await gotoMembers()
    expect((await submitInvite(trainerPage, email)).status()).toBe(200)
    return inviteTokenOf(await fetchLatestMagicLink(email))
  }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000)
    suffix = Math.random().toString(36).slice(2, 8)
    teamName = `Invite Mail ${suffix}`
    teamSlug = `invite-mail-${suffix}`

    trainerCtx = await browser.newContext()
    trainerPage = await trainerCtx.newPage()
    await signInWithMagicLink(trainerPage, `trainer-${suffix}@example.com`)
    await trainerPage.waitForURL(/\/start$/, { timeout: 15_000 })
    await trainerPage.getByLabel(/team-name/i).fill(teamName)
    await trainerPage.getByLabel(/slug/i).fill(teamSlug)
    await trainerPage.getByRole('button', { name: /team gründen/i }).click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })
  })

  test.afterAll(async () => {
    await trainerCtx?.close()
  })

  test('the mail goes to the invitee and links back to their invitation', async ({ baseURL }) => {
    const email = `invitee-${suffix}-mail@example.com`
    await gotoMembers()
    expect((await submitInvite(trainerPage, email)).status()).toBe(200)
    await expect(trainerPage.getByText(email, { exact: true })).toBeVisible()

    await expect.poll(() => countMailsTo(email)).toBe(1)
    const link = await fetchLatestMagicLink(email)

    expect(new URL(link).pathname).toContain('/auth/v1/verify')
    const target = redirectTargetOf(link)
    expect(target.origin).toBe(new URL(baseURL ?? '').origin)
    expect(target.pathname).toBe('/callback')
    expect(inviteTokenOf(link)).not.toBe('')
  })

  test('a duplicate open invitation is rejected visibly and sends no second mail', async () => {
    const email = `invitee-${suffix}-dup@example.com`
    await gotoMembers()
    expect((await submitInvite(trainerPage, email)).status()).toBe(200)
    await expect.poll(() => countMailsTo(email)).toBe(1)

    const second = await submitInvite(trainerPage, email)
    expect(second.status()).toBe(409)
    await expect(
      trainerPage.getByRole('alert').filter({ hasText: DUPLICATE_MESSAGE }),
    ).toBeVisible()
    expect(await countMailsTo(email)).toBe(1)
    await expect(trainerPage.getByText(email, { exact: true })).toHaveCount(1)

    await fetchLatestMagicLink(email)
  })

  test('a revoked invitation is gone, and re-inviting the now-registered address works', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const email = `invitee-${suffix}-revoke@example.com`
    await gotoMembers()
    expect((await submitInvite(trainerPage, email)).status()).toBe(200)
    const firstLink = await fetchLatestMagicLink(email)

    const row = trainerPage.locator('li').filter({ hasText: email })
    await row.getByRole('button', { name: /widerrufen/i }).click()
    await expect(trainerPage.getByText(email, { exact: true })).toHaveCount(0)

    // The mail link still signs the invitee in (creating their account), but the
    // revoked invitation behind it must no longer resolve.
    const inviteeCtx = await browser.newContext()
    const inviteePage = await inviteeCtx.newPage()
    await inviteePage.goto(firstLink, { waitUntil: 'networkidle' })
    await expect(inviteePage.getByText(/einladung nicht gefunden/i)).toBeVisible({
      timeout: 15_000,
    })

    // The address now belongs to an existing account — a different GoTrue path.
    await gotoMembers()
    expect((await submitInvite(trainerPage, email)).status()).toBe(200)
    await expect.poll(() => countMailsTo(email)).toBe(1)
    const secondLink = await fetchLatestMagicLink(email)
    expect(inviteTokenOf(secondLink)).not.toBe(inviteTokenOf(firstLink))

    await inviteePage.goto(secondLink, { waitUntil: 'networkidle' })
    await expect(inviteePage.getByText(new RegExp(teamName))).toBeVisible({ timeout: 15_000 })
    await inviteePage.getByRole('button', { name: /annehmen/i }).click()
    await inviteePage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await inviteeCtx.close()
  })

  test('inviting from the new-player dialog creates the player, mails the invite and links on accept', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const email = `invitee-${suffix}-player@example.com`
    const playerName = `Spieler ${suffix}`
    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })

    await trainerPage.getByTestId('player-new-button').click()
    const dialog = trainerPage.getByTestId('player-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Per E-Mail einladen').check()
    await dialog.getByTestId('player-form-invite-email').fill(email)
    await dialog.getByLabel('Name').fill(playerName)
    await trainerPage.getByTestId('player-form-submit').click()
    await expect(dialog).toBeHidden()

    const row = trainerPage.getByTestId('player-row').filter({ hasText: playerName })
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('player-linked')).toHaveCount(0)
    await expect.poll(() => countMailsTo(email)).toBe(1)

    const inviteeCtx = await browser.newContext()
    const inviteePage = await inviteeCtx.newPage()
    await inviteePage.goto(await fetchLatestMagicLink(email), { waitUntil: 'networkidle' })
    await expect(inviteePage.getByText(new RegExp(teamName))).toBeVisible({ timeout: 15_000 })
    await inviteePage.getByRole('button', { name: /annehmen/i }).click()
    await inviteePage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await trainerPage.reload({ waitUntil: 'networkidle' })
    await expect(
      trainerPage
        .getByTestId('player-row')
        .filter({ hasText: playerName })
        .getByTestId('player-linked'),
    ).toBeVisible({ timeout: 10_000 })

    await inviteeCtx.close()
  })

  test('a duplicate invitation from the new-player dialog leaves no orphaned player', async () => {
    const email = `invitee-${suffix}-orphan@example.com`
    const playerName = `Waise ${suffix}`
    await gotoMembers()
    expect((await submitInvite(trainerPage, email)).status()).toBe(200)
    await expect.poll(() => countMailsTo(email)).toBe(1)

    await trainerPage.goto(`/t/${teamSlug}/players`, { waitUntil: 'networkidle' })
    await trainerPage.getByTestId('player-new-button').click()
    const dialog = trainerPage.getByTestId('player-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Per E-Mail einladen').check()
    await dialog.getByTestId('player-form-invite-email').fill(email)
    await dialog.getByLabel('Name').fill(playerName)
    await trainerPage.getByTestId('player-form-submit').click()

    await expect(dialog.getByRole('alert')).toContainText(DUPLICATE_MESSAGE)
    await expect(dialog).toBeVisible()
    expect(await countMailsTo(email)).toBe(1)

    await trainerPage.reload({ waitUntil: 'networkidle' })
    await expect(trainerPage.getByTestId('player-row').filter({ hasText: playerName })).toHaveCount(
      0,
    )

    await fetchLatestMagicLink(email)
  })

  test('accepting an unknown token answers 404', async () => {
    const { status, body } = await acceptViaApi(trainerCtx, 'no-such-token-'.repeat(2))
    expect(status).toBe(404)
    expect(body.statusMessage).toBe('Invitation not found')
  })

  test('accepting with the wrong account answers 403 and the invite page explains why', async () => {
    const token = await inviteAndGetToken(`invitee-${suffix}-wrong@example.com`)

    const { status, body } = await acceptViaApi(trainerCtx, token)
    expect(status).toBe(403)
    expect(body.statusMessage).toBe('Invitation email does not match your account')

    // Only team trainers can read someone else's invitation, so this notice is
    // reachable with the trainer account opening the invitee's link.
    await trainerPage.goto(`/invite/${token}`, { waitUntil: 'networkidle' })
    await expect(trainerPage.getByText(/adressiert/i)).toBeVisible({ timeout: 15_000 })
    await expect(trainerPage.getByRole('button', { name: /annehmen/i })).toBeDisabled()
  })

  test('accepting an expired invitation answers 410', async () => {
    const token = await inviteAndGetToken(`invitee-${suffix}-expired@example.com`)

    const expire = await fetch(`${SUPABASE_URL}/rest/v1/invitations?token=eq.${token}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
    })
    expect(expire.ok).toBe(true)

    const { status, body } = await acceptViaApi(trainerCtx, token)
    expect(status).toBe(410)
    expect(body.statusMessage).toBe('Invitation expired')
  })
})
