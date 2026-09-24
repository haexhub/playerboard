import { expect, test, type Page } from '@playwright/test'
import { signInWithMagicLink } from './helpers/magic-link'
import { restGet, restInsert, restHeaders, SUPABASE_URL } from './helpers/supabase-rest'
import { asUser, getAccessToken } from './helpers/session'

// Negative-auth coverage for the two new linked-player email routes
// (contracts/rls-policies.md's N1-N7 matrix, partial — N4/N6/N8 are not
// covered here, disclosed in specs/015-unify-player-invite-dialog/tasks.md).
// These are the security-sensitive routes this feature's design review
// specifically hardened, so their authorization boundaries are verified
// directly rather than only through the happy-path UI flow.

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8)

const setupPage = (page: Page) => {
  page.on('pageerror', (err) => console.error(`[browser error] ${err.message}`))
}

const foundTeam = async (page: Page, teamName: string, teamSlug: string) => {
  await page.waitForURL(/\/start$/, { timeout: 15_000 })
  await page.getByLabel(/team-name/i).fill(teamName)
  await page.getByLabel(/slug/i).fill(teamSlug)
  await page.getByRole('button', { name: /team gründen/i }).click()
  await page.waitForURL(new RegExp(`/t/${teamSlug}(/|$)`), { timeout: 15_000 })
}

test.describe('Negative auth — linked-player email routes', () => {
  test('trainer-only, own-team-only, linked-only request; owner-only confirm; trigger blocks direct writes', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const suffix = uniqueSuffix()

    const trainerACtx = await browser.newContext()
    const trainerAPage = await trainerACtx.newPage()
    setupPage(trainerAPage)
    await signInWithMagicLink(trainerAPage, `trainer-a-${suffix}@example.com`)
    await foundTeam(trainerAPage, `NegA ${suffix}`, `nega-${suffix}`)

    const ownerCtx = await browser.newContext()
    const ownerPage = await ownerCtx.newPage()
    setupPage(ownerPage)
    await signInWithMagicLink(ownerPage, `owner-${suffix}@example.com`)

    const strangerCtx = await browser.newContext()
    const strangerPage = await strangerCtx.newPage()
    setupPage(strangerPage)
    await signInWithMagicLink(strangerPage, `stranger-${suffix}@example.com`)

    const trainerBCtx = await browser.newContext()
    const trainerBPage = await trainerBCtx.newPage()
    setupPage(trainerBPage)
    await signInWithMagicLink(trainerBPage, `trainer-b-${suffix}@example.com`)
    await foundTeam(trainerBPage, `NegB ${suffix}`, `negb-${suffix}`)

    const ownerToken = await getAccessToken(ownerCtx)
    const trainerAToken = await getAccessToken(trainerACtx)
    const ownerId = JSON.parse(
      Buffer.from(ownerToken.split('.')[1]!, 'base64url').toString('utf-8'),
    ) as { sub: string }

    const [teamA] = await restGet<{ id: string }>(`teams?select=id&slug=eq.nega-${suffix}`)
    const [teamB] = await restGet<{ id: string }>(`teams?select=id&slug=eq.negb-${suffix}`)

    // linked_user_id requires an existing player-role membership in the same
    // team (enforce_player_linked_user_membership, specs/001-points-and-photos).
    await restInsert('memberships', [{ team_id: teamA!.id, user_id: ownerId.sub, role: 'player' }])

    const [linkedPlayer] = await restInsert<{ id: string }>('players', [
      {
        team_id: teamA!.id,
        name: `Linked ${suffix}`,
        active: true,
        linked_user_id: ownerId.sub,
        email: `owner-${suffix}@example.com`,
      },
    ])
    const [unlinkedPlayer] = await restInsert<{ id: string }>('players', [
      { team_id: teamA!.id, name: `Unlinked ${suffix}`, active: true },
    ])

    // N1: a non-trainer (no membership at all, a fortiori a player-role member) cannot request.
    const n1 = await strangerCtx.request.post(`/api/players/${linkedPlayer!.id}/email`, {
      data: { team_id: teamA!.id, email: `new-${suffix}@example.com` },
    })
    expect(n1.status()).toBe(403)

    // N2: a trainer of a different team cannot target Team A's player.
    const n2 = await trainerBCtx.request.post(`/api/players/${linkedPlayer!.id}/email`, {
      data: { team_id: teamB!.id, email: `new-${suffix}@example.com` },
    })
    expect(n2.status()).toBe(400)

    // N3: Team A's own trainer cannot request a change for a not-yet-linked player.
    const n3 = await trainerACtx.request.post(`/api/players/${unlinkedPlayer!.id}/email`, {
      data: { team_id: teamA!.id, email: `new-${suffix}@example.com` },
    })
    expect(n3.status()).toBe(400)

    // Happy path so far: Team A's trainer CAN request a change for their own linked player.
    const requestedEmail = `new-${suffix}@example.com`
    const ok = await trainerACtx.request.post(`/api/players/${linkedPlayer!.id}/email`, {
      data: { team_id: teamA!.id, email: requestedEmail },
    })
    expect(ok.status()).toBe(200)
    const { request_id } = (await ok.json()) as { request_id: string }

    // Confirm-route: the trainer (not the linked owner) cannot confirm it.
    const wrongConfirm = await trainerACtx.request.post(
      `/api/players/${linkedPlayer!.id}/email/confirm`,
      { data: { request_id } },
    )
    expect(wrongConfirm.status()).toBe(403)

    // Confirm-route: even the real owner can't finalize before Auth reports the
    // new address — they never actually called supabase.auth.updateUser here.
    const tooEarly = await ownerCtx.request.post(`/api/players/${linkedPlayer!.id}/email/confirm`, {
      data: { request_id },
    })
    expect(tooEarly.status()).toBe(409)

    // N7: the linked-email guard trigger blocks a direct PostgREST write to
    // players.email for a linked player, even by that team's own trainer,
    // even though players_write_trainer's RLS policy would otherwise allow it.
    const directWrite = await fetch(`${SUPABASE_URL}/rest/v1/players?id=eq.${linkedPlayer!.id}`, {
      method: 'PATCH',
      headers: { ...asUser(trainerAToken), Prefer: 'return=minimal' },
      body: JSON.stringify({ email: `direct-${suffix}@example.com` }),
    })
    expect(directWrite.ok).toBe(false)

    // The blocked write left the original email untouched.
    const [afterDirectWrite] = await fetch(
      `${SUPABASE_URL}/rest/v1/players?id=eq.${linkedPlayer!.id}&select=email`,
      { headers: restHeaders() },
    ).then((r) => r.json() as Promise<{ email: string }[]>)
    expect(afterDirectWrite!.email).toBe(`owner-${suffix}@example.com`)

    await trainerACtx.close()
    await trainerBCtx.close()
    await ownerCtx.close()
    await strangerCtx.close()
  })
})
