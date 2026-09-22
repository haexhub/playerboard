import { expect, test, type Page } from '@playwright/test'
import { fetchLatestMagicLink, signInWithMagicLink } from './helpers/magic-link'
import {
  anonHeaders,
  SUPABASE_SERVICE_KEY,
  SUPABASE_URL,
  restGet,
  restHeaders,
  restInsert,
} from './helpers/supabase-rest'

const restPatch = async (path: string, body: unknown): Promise<void> => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: restHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status} ${await res.text()}`)
}

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

const seedRosterAndTraining = async (
  teamSlug: string,
): Promise<{ team_id: string; noConsentPlayerId: string }> => {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY missing — required to seed the photo-consent fixture')
  }
  const teams = await restGet<{ id: string }>(
    `teams?slug=eq.${encodeURIComponent(teamSlug)}&select=id`,
  )
  if (teams.length === 0) throw new Error(`team ${teamSlug} not found`)
  const team_id = teams[0]!.id

  const players = await restInsert<{ id: string }>('players', [
    { team_id, name: 'No Consent Nina', jersey_number: 1, active: true, photo_consent: false },
    { team_id, name: 'Consenting Carla', jersey_number: 2, active: true, photo_consent: true },
  ])
  await restInsert('point_categories', [
    { team_id, name: 'Einsatz', sort_order: 1, value_min: 0, value_max: 5, active: true },
  ])

  return { team_id, noConsentPlayerId: players[0]!.id }
}

test.describe('US6 — training photo gallery with consent gating', () => {
  test('player sees a placeholder until team-wide consent is clean, then the gallery; anon cannot fetch the file directly', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-photo-${suffix}@example.com`
    const playerEmail = `player-photo-${suffix}@example.com`
    const teamName = `US6 Team ${suffix}`
    const teamSlug = `us6-team-${suffix}`

    const trainerCtx = await browser.newContext()
    const trainerPage = await trainerCtx.newPage()
    setupPage(trainerPage)

    // Trainer signs in, founds a team, invites a player.
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

    // Player accepts — now a real member of the team.
    const inviteLink = await fetchLatestMagicLink(playerEmail)
    const playerCtx = await browser.newContext()
    const playerPage = await playerCtx.newPage()
    setupPage(playerPage)
    await playerPage.goto(inviteLink, { waitUntil: 'networkidle' })
    await expect(playerPage.getByText(new RegExp(teamName))).toBeVisible({ timeout: 15_000 })
    await playerPage.getByRole('button', { name: /annehmen/i }).click()
    await playerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    // Seed a roster where one active player has not given photo consent.
    const { noConsentPlayerId } = await seedRosterAndTraining(teamSlug)

    // Trainer creates a training, uploads one photo, and saves it.
    await trainerPage.goto(`/t/${teamSlug}/trainings/new`, { waitUntil: 'networkidle' })
    await expect(trainerPage.getByTestId('trainings-new-page')).toBeVisible()
    await trainerPage.getByTestId('photo-upload-input').setInputFiles({
      name: 'training.png',
      mimeType: 'image/png',
      buffer: PNG_1x1,
    })
    await expect(trainerPage.getByTestId('photo-empty-hint')).toBeHidden({ timeout: 15_000 })
    await expect(trainerPage.getByTestId('training-save-button')).toBeEnabled({ timeout: 15_000 })
    await trainerPage.getByTestId('training-save-button').click()
    await trainerPage.waitForURL(new RegExp(`/t/${teamSlug}/trainings/[0-9a-f-]+`), {
      timeout: 15_000,
    })
    const trainingUrl = trainerPage.url()

    // Player opens the training: team-wide consent is blocked (Nina has none),
    // so the gallery renders a placeholder, not the photo.
    await playerPage.goto(trainingUrl, { waitUntil: 'networkidle' })
    await expect(playerPage.getByTestId('training-detail-page')).toBeVisible()
    await expect(playerPage.getByTestId('photo-gallery-blocked')).toBeVisible()
    await expect(playerPage.getByTestId('photo-gallery-grid')).toHaveCount(0)

    // Trainer grants the missing consent — team-wide status becomes clean.
    await restPatch(`players?id=eq.${noConsentPlayerId}`, { photo_consent: true })

    // Player reloads: the same training now renders the actual photo.
    await playerPage.reload({ waitUntil: 'networkidle' })
    await expect(playerPage.getByTestId('photo-gallery-grid')).toBeVisible()
    await expect(playerPage.getByTestId('photo-gallery-blocked')).toHaveCount(0)
    await expect(playerPage.locator('[data-testid="photo-gallery-grid"] img')).toHaveCount(1)

    // Direct, unsigned Storage access as anon is denied regardless of consent.
    const trainingId = trainingUrl.split('/').pop()!
    const [photoRow] = await restGet<{ storage_path: string }>(
      `training_photos?training_id=eq.${trainingId}&select=storage_path`,
    )
    expect(photoRow).toBeTruthy()
    const anonRes = await trainerCtx.request.get(
      `${SUPABASE_URL}/storage/v1/object/training-photos/${photoRow!.storage_path}`,
      { headers: anonHeaders() },
    )
    expect(anonRes.ok()).toBe(false)

    await trainerCtx.close()
    await playerCtx.close()
  })
})
