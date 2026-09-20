import { expect, test, type Page } from '@playwright/test'
import { fetchLatestMagicLink, signInWithMagicLink } from './helpers/magic-link'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

const restGet = async <T>(path: string): Promise<T[]> => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as T[]
}

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser console] ${msg.text()}`)
  })
}

const foundTeam = async (page: Page, teamName: string, teamSlug: string) => {
  await page.waitForURL(/\/start$/, { timeout: 15_000 })
  await page.getByLabel(/team-name/i).fill(teamName)
  await page.getByLabel(/slug/i).fill(teamSlug)
  await page.getByRole('button', { name: /team gründen/i }).click()
  await page.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })
}

// Smallest possible valid PNG (1×1 transparent pixel).
const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d494441545' +
    '82763fcffff3f0005fe02fefc7f0d3c0000000049454e44ae426082',
  'hex',
)

test.describe('US1 — member edits their own display name', () => {
  test('name change on /profile shows up on the team members list; too-short names are rejected', async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const suffix = uniqueSuffix()
    const email = `profile-${suffix}@example.com`
    const teamName = `Profile Team ${suffix}`
    const teamSlug = `profile-team-${suffix}`

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    setupPage(page)

    await signInWithMagicLink(page, email)
    await foundTeam(page, teamName, teamSlug)

    await page.goto('/profile', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('profile-page')).toBeVisible()

    // Too-short name is rejected, previous name kept.
    await page.getByLabel('Name').fill('A')
    await page.getByTestId('profile-form-save-name').click()
    await expect(page.locator('[data-testid="profile-form"] [role], .text-red-700')).toContainText(
      /mindestens 2/i,
    )

    await page.getByLabel('Name').fill('Nina Neu')
    await page.getByTestId('profile-form-save-name').click()
    await expect(page.getByLabel('Name')).toHaveValue('Nina Neu')

    await page.goto(`/t/${teamSlug}/team/members`, { waitUntil: 'networkidle' })
    await expect(page.getByText('Nina Neu')).toBeVisible()

    await ctx.close()
  })
})

test.describe('US2 — member uploads an avatar', () => {
  test('avatar upload shows on /profile and on the team members list; bad files are rejected', async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const suffix = uniqueSuffix()
    const email = `avatar-${suffix}@example.com`
    const teamName = `Avatar Team ${suffix}`
    const teamSlug = `avatar-team-${suffix}`

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    setupPage(page)

    await signInWithMagicLink(page, email)
    await foundTeam(page, teamName, teamSlug)

    await page.goto('/profile', { waitUntil: 'networkidle' })

    // Unsupported type is rejected, no avatar set.
    await page.getByTestId('profile-avatar-input').setInputFiles({
      name: 'not-an-image.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    })
    await expect(page.getByTestId('profile-avatar-error')).toBeVisible()
    await expect(page.getByTestId('profile-avatar-image')).toHaveCount(0)

    await page.getByTestId('profile-avatar-input').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG_1x1,
    })
    await expect(page.getByTestId('profile-avatar-image')).toBeVisible({ timeout: 10_000 })

    await page.goto(`/t/${teamSlug}/team/members`, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('member-avatar-image')).toBeVisible({ timeout: 10_000 })

    await ctx.close()
  })
})

test.describe('US3 — member removes their avatar', () => {
  test('removing the avatar restores the placeholder everywhere', async ({ browser }) => {
    test.setTimeout(90_000)
    const suffix = uniqueSuffix()
    const email = `rmavatar-${suffix}@example.com`
    const teamName = `Rm Avatar Team ${suffix}`
    const teamSlug = `rm-avatar-team-${suffix}`

    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    setupPage(page)

    await signInWithMagicLink(page, email)
    await foundTeam(page, teamName, teamSlug)

    await page.goto('/profile', { waitUntil: 'networkidle' })
    await page.getByTestId('profile-avatar-input').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG_1x1,
    })
    await expect(page.getByTestId('profile-avatar-image')).toBeVisible({ timeout: 10_000 })

    await page.getByTestId('profile-avatar-remove').click()
    await expect(page.getByTestId('profile-avatar-image')).toHaveCount(0)
    await expect(page.getByTestId('profile-avatar-placeholder')).toBeVisible()

    await page.goto(`/t/${teamSlug}/team/members`, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('member-avatar-image')).toHaveCount(0)

    await ctx.close()
  })
})

test.describe('US4 — trainer resets an inappropriate avatar or name', () => {
  test('trainer resets a teammate; unauthorized attempts are denied', async ({ browser }) => {
    test.setTimeout(120_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `mod-trainer-${suffix}@example.com`
    const memberEmail = `mod-member-${suffix}@example.com`
    const teamName = `Mod Team ${suffix}`
    const teamSlug = `mod-team-${suffix}`
    const otherTrainerEmail = `mod-other-${suffix}@example.com`
    const otherTeamSlug = `mod-other-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)
    await signInWithMagicLink(trainerPage, trainerEmail)
    await foundTeam(trainerPage, teamName, teamSlug)

    await trainerPage.goto(`/t/${teamSlug}/team/members`, { waitUntil: 'networkidle' })
    await trainerPage
      .getByLabel(/e-mail/i)
      .first()
      .fill(memberEmail)
    await trainerPage.getByRole('button', { name: /einladen/i }).click()
    await expect(trainerPage.getByText(memberEmail)).toBeVisible({ timeout: 10_000 })

    const memberLink = await fetchLatestMagicLink(memberEmail)
    const memberCtx = await browser.newContext()
    const memberPage = await memberCtx.newPage()
    setupPage(memberPage)
    await memberPage.goto(memberLink, { waitUntil: 'networkidle' })
    await expect(memberPage.getByText(new RegExp(teamName))).toBeVisible({ timeout: 15_000 })
    await memberPage.getByRole('button', { name: /annehmen/i }).click()
    await memberPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    await memberPage.goto('/profile', { waitUntil: 'networkidle' })
    await memberPage.getByLabel('Name').fill('Unangemessen')
    await memberPage.getByTestId('profile-form-save-name').click()
    await memberPage.getByTestId('profile-avatar-input').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG_1x1,
    })
    await expect(memberPage.getByTestId('profile-avatar-image')).toBeVisible({ timeout: 10_000 })

    await trainerPage.goto(`/t/${teamSlug}/team/members`, { waitUntil: 'networkidle' })
    // Locate by "not the trainer's own row" (marked "(du)"), not by the
    // display name — the name is exactly what this test is about to change.
    const memberRow = trainerPage.locator('li').filter({ hasNotText: '(du)' })
    await expect(memberRow).toContainText('Unangemessen')
    await memberRow.getByTestId('member-reset-avatar').click()
    await memberRow.getByTestId('member-avatar-image').waitFor({ state: 'detached' })
    await memberRow.getByTestId('member-reset-name').click()
    await expect(memberRow).not.toContainText('Unangemessen')
    await expect(memberRow.getByTestId('member-avatar-image')).toHaveCount(0)

    const [team] = await restGet<{ id: string }>(`teams?slug=eq.${teamSlug}&select=id`)
    const [membership] = await restGet<{ user_id: string }>(
      `memberships?team_id=eq.${team!.id}&role=eq.player&select=user_id`,
    )
    const memberUserId = membership!.user_id

    // N1: a player-role account may not moderate.
    const playerModerateRes = await memberPage.request.post('/api/profile/moderate', {
      data: { target_user_id: memberUserId, team_id: team!.id, field: 'name' },
      failOnStatusCode: false,
    })
    expect(playerModerateRes.status()).toBe(403)

    // N2: a trainer of an unrelated team may not moderate this member.
    const otherCtx = await browser.newContext()
    const otherPage = await otherCtx.newPage()
    setupPage(otherPage)
    await signInWithMagicLink(otherPage, otherTrainerEmail)
    await foundTeam(otherPage, `Other Team ${suffix}`, otherTeamSlug)
    const otherRes = await otherPage.request.post('/api/profile/moderate', {
      data: { target_user_id: memberUserId, team_id: team!.id, field: 'name' },
      failOnStatusCode: false,
    })
    expect(otherRes.status()).toBe(403)

    await trainerCtx.close()
    await memberCtx.close()
    await otherCtx.close()
  })
})
