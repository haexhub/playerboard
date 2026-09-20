import { expect, test, type Page } from '@playwright/test'
import { fetchLatestMagicLink, signInWithMagicLink } from './helpers/magic-link'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser console] ${msg.text()}`)
  })
}

const restHeaders = () => ({
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
})

const restGet = async <T>(path: string): Promise<T[]> => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: restHeaders() })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as T[]
}

const restInsert = async <T>(table: string, rows: unknown[]): Promise<T[]> => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: restHeaders(),
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`INSERT ${table} failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as T[]
}

const restPatch = async (table: string, filter: string, body: unknown): Promise<void> => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: restHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${table} failed: ${res.status} ${await res.text()}`)
}

test.describe('US2 — player dashboard + progress chart', () => {
  test('player sees rank + top-3 on dashboard and progress chart on player detail', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const suffix = uniqueSuffix()
    const trainerEmail = `trainer-us2-${suffix}@example.com`
    const playerEmail = `player-us2-${suffix}@example.com`
    const teamName = `US2 Team ${suffix}`
    const teamSlug = `us2-team-${suffix}`

    // Trainer signup + team founding + invite player.
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

    // Player accepts invitation.
    const inviteLink = await fetchLatestMagicLink(playerEmail)
    const playerCtx = await browser.newContext()
    const playerPage = await playerCtx.newPage()
    setupPage(playerPage)
    await playerPage.goto(inviteLink, { waitUntil: 'networkidle' })
    await expect(playerPage.getByRole('button', { name: /annehmen/i })).toBeVisible({
      timeout: 15_000,
    })
    await playerPage.getByRole('button', { name: /annehmen/i }).click()
    await playerPage.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })

    // Seed the team: players (one linked to the player user), categories, a
    // saved training with point entries producing a clear ranking.
    const [team] = await restGet<{ id: string }>(
      `teams?slug=eq.${encodeURIComponent(teamSlug)}&select=id`,
    )
    const team_id = team!.id
    const [membership] = await restGet<{ user_id: string }>(
      `memberships?team_id=eq.${team_id}&role=eq.player&select=user_id`,
    )
    const playerUserId = membership!.user_id

    const [alice, bruno, chiara] = await restInsert<{ id: string }>('players', [
      {
        team_id,
        name: 'Alice Anker',
        jersey_number: 7,
        position: 'ST',
        photo_consent: true,
        linked_user_id: playerUserId,
      },
      {
        team_id,
        name: 'Bruno Bereit',
        jersey_number: 10,
        position: 'MF',
        photo_consent: true,
        linked_user_id: null,
      },
      {
        team_id,
        name: 'Chiara Cool',
        jersey_number: 3,
        position: 'DF',
        photo_consent: true,
        linked_user_id: null,
      },
    ])

    const [einsatz, technik] = await restInsert<{ id: string }>('point_categories', [
      { team_id, name: 'Einsatz', sort_order: 1, value_min: 0, value_max: 10, active: true },
      { team_id, name: 'Technik', sort_order: 2, value_min: 0, value_max: 10, active: true },
    ])

    const today = new Date().toISOString().slice(0, 10)
    const [training] = await restInsert<{ id: string }>('trainings', [
      { team_id, date: today, status: 'draft' },
    ])
    await restInsert('training_photos', [
      {
        training_id: training!.id,
        storage_path: `${team_id}/${training!.id}/${crypto.randomUUID()}.jpg`,
        content_type: 'image/jpeg',
        size_bytes: 100,
        uploaded_by: playerUserId,
      },
    ])
    await restInsert('point_entries', [
      { training_id: training!.id, player_id: alice!.id, category_id: einsatz!.id, value: 9 },
      { training_id: training!.id, player_id: alice!.id, category_id: technik!.id, value: 8 },
      { training_id: training!.id, player_id: bruno!.id, category_id: einsatz!.id, value: 7 },
      { training_id: training!.id, player_id: bruno!.id, category_id: technik!.id, value: 6 },
      { training_id: training!.id, player_id: chiara!.id, category_id: einsatz!.id, value: 5 },
      { training_id: training!.id, player_id: chiara!.id, category_id: technik!.id, value: 4 },
    ])
    await restPatch('trainings', `id=eq.${training!.id}`, { status: 'saved' })

    // Player visits dashboard.
    await playerPage.goto(`/t/${teamSlug}/dashboard`, { waitUntil: 'networkidle' })
    await expect(playerPage.getByTestId('dashboard-page')).toBeVisible()
    await expect(playerPage.getByTestId('my-rank-card')).toContainText('1')
    const top3 = playerPage.getByTestId('top-three')
    await expect(top3).toContainText('Alice Anker')
    await expect(top3).toContainText('Bruno Bereit')
    await expect(top3).toContainText('Chiara Cool')

    // Player opens own detail via CTA.
    await playerPage.getByRole('link', { name: /mein zeitverlauf/i }).click()
    await playerPage.waitForURL(new RegExp(`/t/${teamSlug}/players/${alice!.id}`), {
      timeout: 15_000,
    })
    await expect(playerPage.getByTestId('player-detail-page')).toBeVisible()
    await expect(playerPage.getByTestId(`player-progress-chart-${einsatz!.id}`)).toBeVisible()
    await expect(playerPage.getByTestId(`player-progress-chart-${technik!.id}`)).toBeVisible()
    await expect(playerPage.getByTestId(`player-progress-chart-${einsatz!.id}`)).toContainText(
      'Ø Team 7.0 · Median 7.0',
    )
    await expect(playerPage.getByTestId(`player-progress-chart-${technik!.id}`)).toContainText(
      'Ø Team 6.0 · Median 6.0',
    )

    // Trainer sees the full ranking table on their dashboard.
    await trainerPage.goto(`/t/${teamSlug}/ranking`, { waitUntil: 'networkidle' })
    await expect(trainerPage.getByTestId('ranking-table')).toBeVisible()
    await expect(trainerPage.getByTestId('ranking-table')).toContainText('Alice Anker')

    await trainerCtx.close()
    await playerCtx.close()
  })
})
