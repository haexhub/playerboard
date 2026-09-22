import { expect, test } from '@playwright/test'

// Route-level guards that must reject before any DB or upstream call. Uses the
// plain request fixture — no browser, no session.

test.describe('API negative — unauthenticated callers', () => {
  test('POST /api/veo/sync rejects a missing or wrong bearer with 401', async ({ request }) => {
    const missing = await request.post('/api/veo/sync')
    expect(missing.status()).toBe(401)

    const wrong = await request.post('/api/veo/sync', {
      headers: { Authorization: 'Bearer definitely-not-the-sync-secret' },
    })
    expect(wrong.status()).toBe(401)
  })

  test('GET /api/profile/avatar/:user_id rejects a malformed id with 400', async ({ request }) => {
    const res = await request.get('/api/profile/avatar/not-a-uuid')
    expect(res.status()).toBe(400)
  })

  test('POST /api/veo/login and /api/veo/link reject an unauthenticated caller with 401', async ({
    request,
  }) => {
    const login = await request.post('/api/veo/login', {
      data: {
        team_id: '00000000-0000-0000-0000-000000000000',
        email: 'x@example.com',
        password: 'x',
      },
    })
    expect(login.status()).toBe(401)

    const link = await request.post('/api/veo/link', {
      data: {
        team_id: '00000000-0000-0000-0000-000000000000',
        veo_club_slug: 'x',
        veo_team_slug: 'y',
        link_token: 'not-a-real-token',
      },
    })
    // link.post.ts authenticates via useUserDb() itself, before the (invalid,
    // so 400-worthy) link_token is even checked — 401 still wins.
    expect(link.status()).toBe(401)
  })
})
