import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPlayerAnalysisStats, parseMatchListResponse } from '~/server/utils/veo/client'

const fixture = JSON.parse(readFileSync('tests/fixtures/veo/matches-list-response.json', 'utf-8'))

describe('parseMatchListResponse', () => {
  it('parses a real matches-list response, reading the nested team.id', () => {
    const matches = parseMatchListResponse(fixture)

    expect(matches).toHaveLength(2)
    expect(matches[0]).toMatchObject({
      identifier: '02bf798f-3fbb-4025-acd9-3d6f45b2a2c1',
      team: { id: '88536f41-beaf-479e-9b7f-bbf6b2f8410c' },
      info: { stats: { score_aggregated: { own: 7, opponent: 5 } } },
    })
  })

  // Regression test: the API stopped honoring `fields=team__id` (a flattened
  // field) and always returns the full nested `team` object instead —
  // caused every live sync to fail with "Unexpected Veo matches response
  // shape" until the schema/call site were updated to match (2026-09-25).
  it('rejects a response with a flattened team__id instead of a nested team object', () => {
    const legacyShape = fixture.map((match: Record<string, unknown>) => {
      const { team, ...rest } = match
      return { ...rest, team__id: (team as { id: string }).id }
    })
    expect(() => parseMatchListResponse(legacyShape)).toThrow(
      'Unexpected Veo matches response shape',
    )
  })
})

describe('fetchPlayerAnalysisStats', () => {
  afterEach(() => vi.unstubAllGlobals())

  // Regression test: the real Veo web app sends `team_id` on this request —
  // omitting it (as research.md §1 originally assumed) fails with HTTP 400.
  // Confirmed by capturing the actual request the app.veo.co frontend sends
  // (2026-09-25).
  it('includes team_id in the cross_match/player request body', async () => {
    const fetchMock = vi.fn(
      async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await fetchPlayerAnalysisStats('token', {
      veoTeamId: '88536f41-beaf-479e-9b7f-bbf6b2f8410c',
      veoMatchIds: ['02bf798f-3fbb-4025-acd9-3d6f45b2a2c1'],
    })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      type: 'cross_match',
      team_id: '88536f41-beaf-479e-9b7f-bbf6b2f8410c',
      group_by: 'player',
      match_ids: ['02bf798f-3fbb-4025-acd9-3d6f45b2a2c1'],
    })
  })
})
