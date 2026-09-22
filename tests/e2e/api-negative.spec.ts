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
})
