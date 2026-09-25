import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseMatchListResponse } from '~/server/utils/veo/client'

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
